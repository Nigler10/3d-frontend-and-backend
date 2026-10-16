from decimal import Decimal
from datetime import date, time, timedelta

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


class AdminDashboardStatusFilterTests(APITestCase):
    endpoint = "/api/orders/admin/dashboard/"

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(
            username="dashboard-admin",
            email="dashboard-admin@example.com",
            password="password123",
        )

    def setUp(self):
        self.client.force_authenticate(user=self.admin)
        self.today = date.today()

    def create_order(self, status, **kwargs):
        values = {
            "status": status,
            "total_amount": Decimal("100.00"),
            "full_name": "Scheduled Customer",
            "delivery_date": self.today + timedelta(days=1),
            "delivery_time": time(10, 30),
        }
        values.update(kwargs)
        return Order.objects.create(**values)

    def dashboard(self, **params):
        response = self.client.get(self.endpoint, params)
        self.assertEqual(response.status_code, 200)
        return response.data

    def queue_ids(self, data):
        return [order["id"] for order in data["all_upcoming_orders"]]

    def test_status_filters_find_matching_orders_beyond_the_default_page(self):
        for _ in range(6):
            self.create_order("processing")
        pending = self.create_order(
            "pending_review", delivery_date=self.today + timedelta(days=2)
        )
        awaiting = self.create_order(
            "awaiting_downpayment", delivery_date=self.today + timedelta(days=3)
        )

        self.assertNotIn(pending.id, self.queue_ids(self.dashboard()))
        for status, order in [
            ("pending_review", pending),
            ("awaiting_downpayment", awaiting),
        ]:
            with self.subTest(status=status):
                data = self.dashboard(status=status)
                self.assertEqual(self.queue_ids(data), [order.id])
                self.assertEqual(data["all_upcoming_total"], 1)

    def test_completed_filter_includes_delivered_and_legacy_completed_orders(self):
        delivered = self.create_order("delivered")
        completed = self.create_order("completed")
        self.create_order("processing")

        data = self.dashboard(status="completed")

        self.assertCountEqual(self.queue_ids(data), [delivered.id, completed.id])
        self.assertEqual(data["all_upcoming_total"], 2)
        self.assertEqual(
            {order["status"] for order in data["all_upcoming_orders"]},
            {"delivered", "completed"},
        )

    def test_filtered_pagination_counts_matches_and_clamps_page_numbers(self):
        self.create_order("processing")
        pending = [
            self.create_order(
                "pending_review", delivery_date=self.today + timedelta(days=i + 2)
            )
            for i in range(7)
        ]

        middle = self.dashboard(status="pending_review", per_page=3, page=2)
        self.assertEqual(self.queue_ids(middle), [order.id for order in pending[3:6]])
        self.assertEqual(middle["all_upcoming_total"], 7)
        self.assertEqual(middle["all_upcoming_total_pages"], 3)
        self.assertEqual(middle["all_upcoming_page"], 2)
        self.assertTrue(middle["all_upcoming_has_prev"])
        self.assertTrue(middle["all_upcoming_has_next"])

        last = self.dashboard(status="pending_review", per_page=3, page=999)
        self.assertEqual(self.queue_ids(last), [pending[-1].id])
        self.assertEqual(last["all_upcoming_page"], 3)
        self.assertFalse(last["all_upcoming_has_next"])

        first = self.dashboard(status="pending_review", per_page=3, page=0)
        self.assertEqual(self.queue_ids(first), [order.id for order in pending[:3]])
        self.assertEqual(first["all_upcoming_page"], 1)
        self.assertFalse(first["all_upcoming_has_prev"])

    def test_default_all_and_overdue_filters_keep_terminal_orders_out_of_active_queue(self):
        overdue = self.create_order(
            "pending_review", delivery_date=self.today - timedelta(days=1)
        )
        scheduled = self.create_order("awaiting_downpayment")
        for status in ["delivered", "completed", "cancelled", "rejected"]:
            self.create_order(status, delivery_date=self.today - timedelta(days=1))

        for params in [{}, {"status": "all"}]:
            with self.subTest(params=params):
                self.assertCountEqual(
                    self.queue_ids(self.dashboard(**params)),
                    [overdue.id, scheduled.id],
                )
        self.assertEqual(self.queue_ids(self.dashboard(status="overdue")), [overdue.id])
        self.assertEqual(
            self.queue_ids(self.dashboard(status="awaiting_downpayment")),
            [scheduled.id],
        )
        self.assertCountEqual(
            self.queue_ids(self.dashboard(status="all")),
            [overdue.id, scheduled.id],
        )

    def test_per_page_uses_requested_size_with_supported_bounds(self):
        for _ in range(101):
            self.create_order("pending_review")

        self.assertEqual(len(self.queue_ids(self.dashboard())), 5)
        self.assertEqual(len(self.queue_ids(self.dashboard(per_page=10))), 10)
        self.assertEqual(len(self.queue_ids(self.dashboard(per_page=0))), 1)
        self.assertEqual(len(self.queue_ids(self.dashboard(per_page=1000))), 100)

    def test_filters_preserve_order_details_global_stats_and_upcoming_widget(self):
        self.create_order("pending_review")
        awaiting = self.create_order(
            "awaiting_downpayment", full_name="Awaiting Customer"
        )
        self.create_order("delivered", payment_status="paid")
        baseline = self.dashboard()

        filtered = self.dashboard(status="awaiting_downpayment")
        order = filtered["all_upcoming_orders"][0]
        self.assertEqual(order["id"], awaiting.id)
        self.assertEqual(order["full_name"], "Awaiting Customer")
        self.assertEqual(order["delivery_date"], awaiting.delivery_date.isoformat())
        self.assertEqual(order["delivery_time"], "10:30:00")
        self.assertEqual(order["status"], "awaiting_downpayment")
        self.assertEqual(order["total_amount"], "100.00")
        self.assertIn("items", order)
        self.assertIn("payments", order)
        self.assertIn("status_history", order)

        for key in [
            "total_orders", "pending_review", "awaiting_downpayment", "completed",
            "total_revenue", "status_breakdown", "upcoming_orders",
        ]:
            with self.subTest(key=key):
                self.assertEqual(filtered[key], baseline[key])
