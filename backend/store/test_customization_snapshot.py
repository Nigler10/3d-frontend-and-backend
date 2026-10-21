from copy import deepcopy
from datetime import timedelta

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import CakeCustomization, CartItem, CustomCakePricing, UserProfile


class CustomizationSnapshotTests(APITestCase):
    def setUp(self):
        self.customer = User.objects.create_user(username="design-customer", first_name="Cake", last_name="Customer")
        self.admin = User.objects.create_superuser(username="design-admin", email="baker@example.com", password="test-password")
        UserProfile.objects.create(user=self.customer, phone="09123456789", street="123 Cake Street")
        self.client.force_authenticate(self.customer)

    def design(self, shape="round", message="Happy Birthday Ana!"):
        return {
            "shape": shape,
            "tier": "Mini 2 Tier",
            "size": "6x4 & 4x4",
            "flavor": "Ube Chiffon",
            "tier_flavors": {"Bottom Tier": "Ube Chiffon", "Top Tier": "Vanilla Chiffon"},
            "cake_color": "#52e7d4",
            "icing_color": "#F7A8C8",
            "inscription_text": message,
            "text_font": "playful",
            "inscription_color": "#FFFFFF",
            "candle_number": 27,
            "candle_mode": "number",
            "candle_color": "white",
            "has_candle": True,
            "has_chocolate": True,
            "has_balls": False,
            "has_nuts": True,
            "has_cherry": True,
            "has_sprinkles": False,
            "topping_layout": {
                "_design": {"version": 1, "tier_flavor_overrides": [False, True]},
                "_preview": {"version": 1, "image": "data:image/png;base64,Y2FrZQ=="},
                "candle": {"x": 50, "y": 50, "mode": "number", "color": "white", "position": [0, 2.85, 0]},
                "chocolate": [
                    {"x": 25, "y": 35, "size": "small", "position": [-0.4, 2.8, 0.2], "rotation": {"x": 30, "y": 45}},
                    {"x": 65, "y": 35, "size": "large", "position": [0.3, 2.8, -0.2]},
                ],
                "cherry": [{"x": 70, "y": 60, "size": "medium", "position": [0.3, 2.9, 0.2]}],
            },
        }

    def add_design(self, design):
        CustomCakePricing.objects.update_or_create(
            shape=design["shape"], tier=design["tier"], size=design["size"], flavor=design["flavor"],
            defaults={"price": "1600.00"},
        )
        response = self.client.post("/api/cake-customization/", design, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        snapshot = CartItem.objects.latest("pk").customization
        for key, value in design.items():
            self.assertEqual(snapshot[key], value, key)
        record = CakeCustomization.objects.get(pk=snapshot["id"])
        self.assertEqual(record.topping_layout, design["topping_layout"])
        self.assertEqual(record.tier_flavors, design["tier_flavors"])
        return snapshot

    def checkout(self):
        response = self.client.post("/api/orders/create/", {
            "delivery_date": (timezone.localdate() + timedelta(days=2)).isoformat(),
            "delivery_time": "10:00",
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        return response.data["order_id"]

    def assert_order_designs(self, endpoint, expected):
        response = self.client.get(endpoint)
        self.assertEqual(response.status_code, 200, response.data)
        actual = {item["customization"]["id"]: item["customization"] for item in response.data["items"]}
        self.assertEqual(actual, {snapshot["id"]: snapshot for snapshot in expected})

    def test_each_cart_and_order_item_keeps_its_complete_immutable_design(self):
        first = self.add_design(self.design())
        second_design = self.design(shape="rectangle", message="Congratulations Bea!")
        second_design["tier_flavors"]["Top Tier"] = "Choco Moist"
        second_design["topping_layout"]["_design"]["tier_flavor_overrides"] = [True, False]
        second = self.add_design(second_design)
        first_order = self.checkout()
        third = self.add_design(self.design(message="A different order"))
        second_order = self.checkout()

        # Orders are snapshots, even if a customization record is later edited.
        CakeCustomization.objects.filter(pk=first["id"]).update(inscription_text="Later edit", tier_flavors={})
        preserved = deepcopy([first, second])
        self.assert_order_designs(f"/api/orders/customer/orders/{first_order}/", preserved)
        self.assert_order_designs(f"/api/orders/customer/orders/{second_order}/", [third])
        self.client.force_authenticate(self.admin)
        self.assert_order_designs(f"/api/orders/admin/orders/{first_order}/", preserved)
        self.assert_order_designs(f"/api/orders/admin/orders/{second_order}/", [third])
