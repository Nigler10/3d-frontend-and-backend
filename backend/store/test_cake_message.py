from decimal import Decimal
from importlib import import_module
from unittest.mock import MagicMock

from django.contrib.auth.models import User
from django.test import SimpleTestCase
from rest_framework.test import APITestCase

from .models import CakeCustomization, CartItem, CustomCakePricing


class CakeMessageCartTests(APITestCase):
    def setUp(self):
        self.client.force_authenticate(User.objects.create_user(username="cake-message-customer"))
        CustomCakePricing.objects.update_or_create(
            shape="round", tier="1 Tier Cake", size="Bento Cake", flavor="Choco Moist",
            defaults={"price": Decimal("500.00")},
        )

    def submit(self, message):
        return self.client.post("/api/cake-customization/", {
            "shape": "round", "tier": "1 Tier Cake", "size": "Bento Cake",
            "flavor": "Choco Moist", "inscription_text": message,
        }, format="json")

    def test_messages_over_30_characters_can_be_saved_to_the_cart(self):
        for length in [31, 48, 80]:
            with self.subTest(length=length):
                message = "W" * length
                response = self.submit(message)
                self.assertEqual(response.status_code, 201, response.data)
                self.assertEqual(CakeCustomization.objects.latest("pk").inscription_text, message)
                self.assertEqual(CartItem.objects.latest("pk").customization["inscription_text"], message)

    def test_oversized_api_messages_return_validation_errors_without_creating_cart_items(self):
        response = self.submit("W" * 81)
        self.assertEqual(response.status_code, 400)
        self.assertIn("inscription_text", response.data)
        self.assertFalse(CakeCustomization.objects.exists())
        self.assertFalse(CartItem.objects.exists())


class CakeMessageSchemaRepairTests(SimpleTestCase):
    def repair(self, actual_length, vendor="postgresql"):
        apps = MagicMock()
        apps.get_model.return_value = CakeCustomization
        editor = MagicMock()
        editor.connection.vendor = vendor
        editor.connection.cursor.return_value.__enter__.return_value.fetchone.return_value = (actual_length,)
        migration = import_module("store.migrations.0033_repair_cake_message_length")
        migration.repair_cake_message_length(apps, editor)
        return editor

    def test_legacy_database_column_is_widened_to_the_model_limit(self):
        editor = self.repair(30)
        editor.alter_field.assert_called_once()
        model, old_field, new_field = editor.alter_field.call_args.args
        self.assertIs(model, CakeCustomization)
        self.assertEqual(old_field.max_length, 30)
        self.assertEqual(new_field.max_length, 80)
        self.assertEqual(old_field.column, new_field.column)

    def test_matching_or_larger_columns_are_never_shrunk(self):
        for length in [80, 120, None]:
            with self.subTest(length=length):
                self.repair(length).alter_field.assert_not_called()

    def test_other_database_backends_do_not_need_the_postgresql_repair(self):
        editor = self.repair(None, vendor="sqlite")
        editor.connection.cursor.assert_not_called()
        editor.alter_field.assert_not_called()
