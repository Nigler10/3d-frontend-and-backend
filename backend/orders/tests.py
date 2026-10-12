from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from store.models import Order


class AdminPaidOrderCancellationTests(APITestCase):
    def setUp(self):
        admin = User.objects.create_superuser(
            username="order-admin",
            email="order-admin@example.com",
            password="password123",
        )
        self.client.force_authenticate(user=admin)

    def test_processing_orders_with_confirmed_payment_cannot_be_cancelled(self):
        for payment_status in ["partial", "paid"]:
            with self.subTest(payment_status=payment_status):
                order = Order.objects.create(
                    total_amount=Decimal("100.00"),
                    status="processing",
                    payment_status=payment_status,
                )

                response = self.client.patch(
                    f"/api/orders/admin/orders/{order.id}/update-status/",
                    {"status": "cancelled"},
                    format="json",
                )

                self.assertEqual(response.status_code, 409)
                order.refresh_from_db()
                self.assertEqual(order.status, "processing")
                self.assertEqual(order.payment_status, payment_status)
