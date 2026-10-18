from decimal import Decimal
from datetime import datetime, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from .models import AddonPricing, CakeCustomization, Cart, CartItem, Category, CustomCakePricing, Order, OrderItem, Product, UserProfile
from .views import _get_available_delivery_slots


class DeliveryScheduleTests(APITestCase):
    def test_same_day_slots_include_booking_buffer(self):
        now = datetime(2026, 10, 11, 10, 15, tzinfo=ZoneInfo("Asia/Manila"))

        with patch("store.views.timezone.localtime", return_value=now):
            slots = _get_available_delivery_slots(now.date())

        self.assertNotIn("10:30", slots)
        self.assertIn("11:00", slots)


class SingleCakeCheckoutTests(APITestCase):
    def setUp(self):
        self.customer = User.objects.create_user(username="single-cake-customer", first_name="Cake", last_name="Customer")
        UserProfile.objects.create(user=self.customer, phone="09123456789", street="123 Cake Street")
        self.client.force_authenticate(user=self.customer)
        self.cart = Cart.objects.create(user=self.customer)
        design = {"shape": "round", "price": "120.50", "topping_layout": {"chocolate": {"position": [0.2, 2.5, -0.3]}}}
        self.selected = CartItem.objects.create(cart=self.cart, customization=design, quantity=2)
        self.other_cake = CartItem.objects.create(cart=self.cart, customization=design, quantity=1)
        category = Category.objects.create(name="Checkout Cakes", slug="checkout-cakes")
        product = Product.objects.create(category=category, name="Regular Cake", description="", price=Decimal("10.00"))
        self.other_product = CartItem.objects.create(cart=self.cart, product=product, quantity=3)
        self.payload = {"delivery_date": (timezone.localdate() + timedelta(days=1)).isoformat(), "delivery_time": "10:00"}

    def submit(self, **selection):
        return self.client.post("/api/orders/create/", {**self.payload, **selection}, format="json")

    def test_selected_custom_cake_only_is_ordered_and_other_cart_lines_remain(self):
        response = self.submit(cart_item_id=self.selected.pk)
        self.assertEqual(response.status_code, 200)
        order = Order.objects.get(pk=response.data["order_id"])
        self.assertEqual(order.total_amount, Decimal("241.00"))
        self.assertEqual(order.items.count(), 1)
        self.assertEqual(order.items.get().quantity, 2)
        self.assertEqual(order.items.get().customization, self.selected.customization)
        self.assertSetEqual(set(self.cart.items.values_list("pk", flat=True)), {self.other_cake.pk, self.other_product.pk})

    def test_selected_regular_cake_uses_its_cart_line_quantity_and_price(self):
        response = self.submit(cart_item_id=self.other_product.pk)
        self.assertEqual(response.status_code, 200)
        order = Order.objects.get(pk=response.data["order_id"])
        self.assertEqual(order.total_amount, Decimal("30.00"))
        self.assertEqual(order.items.get().product_id, self.other_product.product_id)
        self.assertEqual(self.cart.items.count(), 2)

    def test_whole_cart_checkout_still_orders_all_lines(self):
        response = self.submit()
        self.assertEqual(response.status_code, 200)
        order = Order.objects.get(pk=response.data["order_id"])
        self.assertEqual(order.items.count(), 3)
        self.assertEqual(order.total_amount, Decimal("391.50"))
        self.assertFalse(self.cart.items.exists())

    def test_missing_or_foreign_cart_line_never_falls_back_to_whole_cart(self):
        other_user = User.objects.create_user(username="other-cake-customer")
        foreign_cart = Cart.objects.create(user=other_user)
        foreign_item = CartItem.objects.create(cart=foreign_cart, customization={"price": "1000.00"})
        for item_id in [foreign_item.pk, foreign_item.pk + 100]:
            with self.subTest(item_id=item_id):
                self.assertEqual(self.submit(cart_item_id=item_id).status_code, 400)
                self.assertEqual(self.cart.items.count(), 3)
                self.assertFalse(Order.objects.exists())
        self.assertTrue(CartItem.objects.filter(pk=foreign_item.pk).exists())

    def test_invalid_item_ids_do_not_checkout_any_items(self):
        for item_id in [None, True, 0, -1, 1.2, "", "abc", "9" * 100, [], {}]:
            with self.subTest(item_id=item_id):
                self.assertEqual(self.submit(cart_item_id=item_id).status_code, 400)
                self.assertEqual(self.cart.items.count(), 3)
                self.assertFalse(Order.objects.exists())

    def test_order_item_failure_rolls_back_order_without_removing_cart_lines(self):
        with patch("store.views.OrderItem.objects.create", side_effect=RuntimeError("test order failure")):
            response = self.submit(cart_item_id=self.selected.pk)
        self.assertEqual(response.status_code, 500)
        self.assertFalse(Order.objects.exists())
        self.assertEqual(self.cart.items.count(), 3)


class BestSellingProductsTests(APITestCase):
    def test_endpoint_returns_top_three_by_delivered_quantity(self):
        category = Category.objects.create(name="Cakes", slug="cakes")
        products = [
            Product.objects.create(category=category, name=name, description="", price=Decimal("10.00"))
            for name in ["Top Seller", "Second Seller", "Third Seller", "Cancelled Seller", "No Sales"]
        ]
        delivered_order = Order.objects.create(total_amount=Decimal("100.00"), status="delivered")
        cancelled_order = Order.objects.create(total_amount=Decimal("100.00"), status="cancelled")

        for product, quantity in zip(products[:3], [5, 3, 1]):
            OrderItem.objects.create(order=delivered_order, product=product, quantity=quantity, price=product.price)
        OrderItem.objects.create(order=cancelled_order, product=products[3], quantity=100, price=products[3].price)

        response = self.client.get("/api/best-selling-products/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 3)
        self.assertEqual(
            [product["name"] for product in response.data],
            ["Top Seller", "Second Seller", "Third Seller"],
        )


class AdminProductDeletionTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="product-admin",
            email="product-admin@example.com",
            password="password123",
        )
        self.client.force_authenticate(user=self.admin)
        category = Category.objects.create(name="Cakes", slug="deletion-test-cakes")
        self.product = Product.objects.create(
            category=category,
            name="Pending Cake",
            description="",
            price=Decimal("10.00"),
        )
        self.other_product = Product.objects.create(
            category=category,
            name="Available Cake",
            description="",
            price=Decimal("10.00"),
        )

    def test_active_order_blocks_only_its_product_deletion(self):
        pending_order = Order.objects.create(
            total_amount=Decimal("10.00"),
            status="pending_review",
        )
        processing_order = Order.objects.create(
            total_amount=Decimal("10.00"),
            status="processing",
        )
        OrderItem.objects.create(
            order=pending_order,
            product=self.product,
            quantity=1,
            price=self.product.price,
        )
        OrderItem.objects.create(
            order=processing_order,
            product=self.product,
            quantity=1,
            price=self.product.price,
        )

        product_url = f"/api/admin/products/{self.product.id}/delete/"
        other_product_url = f"/api/admin/products/{self.other_product.id}/delete/"
        check_response = self.client.get(product_url)
        other_check_response = self.client.get(other_product_url)

        self.assertTrue(check_response.data["has_active_orders"])
        self.assertFalse(other_check_response.data["has_active_orders"])
        self.assertEqual(self.client.delete(product_url).status_code, 409)
        self.assertTrue(Product.objects.filter(id=self.product.id).exists())
        self.assertEqual(self.client.delete(other_product_url).status_code, 200)
        self.assertFalse(Product.objects.filter(id=self.other_product.id).exists())


class CustomCakePricingTests(APITestCase):
    def setUp(self):
        self.customer = User.objects.create_user(
            username="customer",
            first_name="Cake",
            last_name="Lover",
            password="password123",
        )
        UserProfile.objects.create(
            user=self.customer,
            phone="09123456789",
            street="123 Bakery St",
            city="Dasmarinas",
            province="Cavite",
            postal_code="4114",
        )
        self.admin = User.objects.create_superuser(
            username="admin",
            email="admin@example.com",
            password="password123",
        )
        self.client = APIClient()

        self.base_price, _ = CustomCakePricing.objects.update_or_create(
            tier="1 Tier Cake",
            size="Bento Cake",
            flavor="Choco Moist",
            defaults={"price": Decimal("1000.00")},
        )
        AddonPricing.objects.update_or_create(
            key="candle",
            defaults={"name": "Candle", "price": Decimal("100.00")},
        )
        AddonPricing.objects.update_or_create(
            key="chocolate",
            defaults={"name": "Chocolate", "price": Decimal("200.00")},
        )
        AddonPricing.objects.update_or_create(
            key="balls",
            defaults={"name": "Balls", "price": Decimal("100.00")},
        )
        AddonPricing.objects.update_or_create(
            key="nuts",
            defaults={"name": "Nuts", "price": Decimal("75.00")},
        )

    def custom_cake_payload(self, **overrides):
        payload = {
            "shape": "round",
            "cake_color": "#683434",
            "flavor": "Choco Moist",
            "tier": "1 Tier Cake",
            "size": "Bento Cake",
            "tier_flavors": {"Bottom Tier": "Choco Moist"},
            "inscription_text": "Happy Birthday",
            "text_font": "classic",
            "topping_layout": {"balls": {"x": 40, "y": 60, "size": "medium"}},
            "has_candle": True,
            "has_chocolate": False,
            "has_balls": True,
            "has_nuts": False,
            "price": "1.00",
        }
        payload.update(overrides)
        return payload

    def test_custom_cake_price_uses_base_and_addons(self):
        self.client.force_authenticate(user=self.customer)

        response = self.client.post(
            "/api/cake-customization/",
            self.custom_cake_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        customization = CakeCustomization.objects.get()
        self.assertEqual(customization.price, Decimal("1200.00"))
        self.assertEqual(customization.inscription_text, "Happy Birthday")
        self.assertEqual(customization.tier_flavors["Bottom Tier"], "Choco Moist")
        cart_item = CartItem.objects.get()
        self.assertEqual(cart_item.customization["id"], customization.id)
        self.assertEqual(cart_item.customization["shape"], "round")
        self.assertEqual(cart_item.customization["price"], "1200.00")

    def test_submitted_price_is_ignored(self):
        self.client.force_authenticate(user=self.customer)

        response = self.client.post(
            "/api/cake-customization/",
            self.custom_cake_payload(price="999999.00", has_candle=False, has_balls=False),
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(CakeCustomization.objects.get().price, Decimal("1000.00"))

    def test_chocolate_quantity_and_individual_positions_survive_cart_save(self):
        self.client.force_authenticate(user=self.customer)
        for size, price in [("small", "100.00"), ("medium", "175.00"), ("large", "250.00")]:
            AddonPricing.objects.update_or_create(
                key=f"chocolate_{size}",
                defaults={"name": f"Chocolate ({size})", "price": Decimal(price)},
            )
        chocolates = [
            {"x": 25, "y": 35, "size": "small", "position": [-0.5, 2.4, -0.3]},
            {"x": 65, "y": 35, "size": "medium", "position": [0.3, 2.4, -0.3]},
            {"x": 50, "y": 70, "size": "large", "position": [0, 2.4, 0.4]},
        ]
        response = self.client.post(
            "/api/cake-customization/",
            self.custom_cake_payload(
                has_chocolate=True, has_candle=False, has_balls=False,
                topping_layout={"chocolate": chocolates},
            ),
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(CakeCustomization.objects.get().topping_layout["chocolate"], chocolates)
        self.assertEqual(CartItem.objects.get().customization["topping_layout"]["chocolate"], chocolates)
        expected_addons = sum(
            AddonPricing.objects.get(key=f"chocolate_{layout['size']}").price
            for layout in chocolates
        )
        self.assertEqual(CakeCustomization.objects.get().price, self.base_price.price + expected_addons)

    def test_missing_base_price_returns_400(self):
        self.client.force_authenticate(user=self.customer)

        response = self.client.post(
            "/api/cake-customization/",
            self.custom_cake_payload(size="Not Configured"),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("No price is configured", response.data["error"])

    def test_valid_custom_cake_uses_default_price_when_row_missing(self):
        self.client.force_authenticate(user=self.customer)
        CustomCakePricing.objects.filter(
            tier="1 Tier Cake",
            size="Tall Bento Cake",
            flavor="Choco Moist",
        ).delete()

        response = self.client.post(
            "/api/cake-customization/",
            self.custom_cake_payload(size="Tall Bento Cake"),
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(CakeCustomization.objects.get().price, Decimal("1200.00"))
        self.assertEqual(CartItem.objects.get().customization["price"], "1200.00")

    def test_custom_cake_snapshot_stays_viewable_after_admin_accepts_order(self):
        self.client.force_authenticate(user=self.customer)
        self.client.post(
            "/api/cake-customization/",
            self.custom_cake_payload(shape="rectangle"),
            format="json",
        )

        order_response = self.client.post(
            "/api/orders/create/",
            {
                "street": "123 Bakery St",
                "city": "Dasmarinas",
                "province": "Cavite",
                "postal_code": "4114",
                "delivery_date": (timezone.localdate() + timedelta(days=1)).isoformat(),
                "delivery_time": "10:00",
            },
            format="json",
        )

        self.assertEqual(order_response.status_code, 200)
        order = Order.objects.get(id=order_response.data["order_id"])
        item = OrderItem.objects.get(order=order)
        self.assertEqual(item.customization["shape"], "rectangle")

        self.client.force_authenticate(user=self.admin)
        review_response = self.client.patch(
            f"/api/orders/admin/orders/{order.id}/review/",
            {"status": "awaiting_downpayment"},
            format="json",
        )

        self.assertEqual(review_response.status_code, 200)
        accepted_item = review_response.data["order"]["items"][0]
        self.assertEqual(accepted_item["customization"]["shape"], "rectangle")
        self.assertEqual(accepted_item["customization"]["inscription_text"], "Happy Birthday")

    def test_admin_pricing_endpoint_rejects_non_admin(self):
        self.client.force_authenticate(user=self.customer)

        response = self.client.get("/api/admin/custom-pricing/")

        self.assertEqual(response.status_code, 403)

    def test_admin_can_update_custom_cake_price(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.patch(
            f"/api/admin/custom-pricing/{self.base_price.id}/update/",
            {"price": "1250.00"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.base_price.refresh_from_db()
        self.assertEqual(self.base_price.price, Decimal("1250.00"))
