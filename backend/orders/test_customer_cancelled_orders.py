from unittest.mock import patch

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from store.models import Order, OrderItem


class CustomerCancelledOrderTests(APITestCase):
    def setUp(self):
        self.customer = User.objects.create_user(username="cancelled-order-customer")
        self.other_customer = User.objects.create_user(username="other-order-customer")
        self.admin = User.objects.create_superuser(username="cancellation-admin", email="baker@example.com", password="test-password")

    def assert_customer_can_still_view(self, order, expected_status):
        self.client.force_authenticate(self.customer)
        response = self.client.get("/api/orders/customer/orders/")
        self.assertEqual(response.status_code, 200)
        saved = next(item for item in response.data if item["id"] == order.id)
        self.assertEqual(saved["status"], expected_status)
        self.assertEqual(saved["items"][0]["customization"]["inscription_text"], "Keep my cake details")
        detail = self.client.get(f"/api/orders/customer/orders/{order.id}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["status"], expected_status)
        self.assertEqual(detail.data["rejection_reason"], saved["rejection_reason"])

    @patch("orders.admin_views.send_order_status_sms")
    def test_orders_remain_in_customer_api_after_admin_cancels_or_rejects_pending_review(self, _sms):
        for status, uploaded in [("cancelled", False), ("rejected", False), ("rejected", True)]:
            with self.subTest(status=status, uploaded=uploaded):
                order = Order.objects.create(user=self.customer, status="pending_review", is_uploaded_cake=uploaded, total_amount="100.00")
                OrderItem.objects.create(order=order, price="100.00", customization={"inscription_text": "Keep my cake details"})
                self.assert_customer_can_still_view(order, "pending_review")
                self.client.force_authenticate(self.admin)
                action = "review" if status == "rejected" else "update-status"
                response = self.client.patch(f"/api/orders/admin/orders/{order.id}/{action}/", {
                    "status": status, "rejection_reason": "The requested date is unavailable.",
                }, format="json")
                self.assertEqual(response.status_code, 200, response.data)
                order.refresh_from_db()
                self.assertEqual(order.status, status)
                self.assert_customer_can_still_view(order, status)

    def test_customer_list_includes_cancelled_and_rejected_orders_only_for_the_owner(self):
        own = [Order.objects.create(user=self.customer, status=status, total_amount="100.00") for status in ["pending_review", "cancelled", "rejected"]]
        for status in ["cancelled", "rejected"]:
            Order.objects.create(user=self.other_customer, status=status, total_amount="100.00")
        self.client.force_authenticate(self.customer)
        response = self.client.get("/api/orders/customer/orders/")
        self.assertEqual(response.status_code, 200)
        self.assertSetEqual({order["id"] for order in response.data}, {order.id for order in own})
