from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.test import APIClient, APITestCase

from .models import AddonPricing, CakeCustomization, CartItem, Category, CustomCakePricing, Order, OrderItem, Product, UserProfile


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
                "delivery_date": "2026-06-10",
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
