from datetime import date, time
from decimal import Decimal

from django.contrib.auth.models import User
from django.test.utils import CaptureQueriesContext
from django.db import connection
from rest_framework.test import APITestCase

from store.models import Category, Order, OrderItem, Product
from .models import OrderDeliveryChangeRequest


class AdminScheduleTests(APITestCase):
    calendar_url = "/api/orders/admin/schedule/calendar/"
    day_url = "/api/orders/admin/schedule/day/"

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username="schedule-admin", is_staff=True)
        cls.customer = User.objects.create_user(username="schedule-customer", first_name="Maria", last_name="Santos")

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def order(self, status="processing", day="2026-04-23", amount="100.00", **kwargs):
        return Order.objects.create(status=status, delivery_date=day, total_amount=Decimal(amount), **kwargs)

    def calendar(self, **kwargs):
        response = self.client.get(self.calendar_url, {"month": "2026-04", **kwargs})
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_month_counts_ignore_overflow_and_unscheduled_orders_but_include_all_statuses(self):
        for status in ["pending_review", "awaiting_downpayment", "awaiting_customer_response", "processing", "out_for_delivery", "delivered", "cancelled", "rejected"]:
            self.order(status)
        self.order(day="2026-03-31")
        self.order(day="2026-05-01")
        self.order(day=None)
        data = self.calendar(start_date="2026-03-29", end_date="2026-05-02")
        self.assertEqual(data["counts"], {"all": 8, "pending": 3, "processing": 1, "out_for_delivery": 1})
        self.assertEqual({day["date"]: day["count"] for day in data["days"]}, {
            "2026-03-31": 1, "2026-04-23": 8, "2026-05-01": 1,
        })

    def test_filter_changes_badges_and_day_details_without_changing_month_pills(self):
        self.order("processing")
        pending = self.order("pending_review")
        awaiting = self.order("awaiting_downpayment")
        data = self.calendar(status="pending")
        self.assertEqual(data["counts"]["all"], 3)
        self.assertEqual(data["days"][0]["count"], 2)
        self.assertEqual(data["days"][0]["total_count"], 3)
        response = self.client.get(self.day_url, {"date": "2026-04-23", "status": "pending"})
        self.assertEqual(response.status_code, 200)
        self.assertCountEqual([order["id"] for order in response.data["orders"]], [pending.id, awaiting.id])
        self.assertEqual(response.data["total_count"], 2)
        self.assertEqual(response.data["day_total_count"], 3)
        self.assertEqual(Decimal(response.data["total_estimate"]), Decimal("200.00"))
        self.assertEqual(Decimal(response.data["day_total_estimate"]), Decimal("300.00"))

    def test_daily_orders_return_real_customers_items_requests_and_exact_estimates_in_time_order(self):
        category = Category.objects.create(name="Bread", slug="bread")
        product = Product.objects.create(category=category, name="Carrot Loaf", price="85.25")
        later = self.order(amount="170.50", full_name="Ana Cruz", delivery_time=time(14, 30))
        earlier = self.order(amount="90.15", user=self.customer, delivery_time=time(8))
        unslotted = self.order(amount="1.01")
        OrderItem.objects.create(order=later, product=product, quantity=2, price="85.25")
        OrderDeliveryChangeRequest.objects.create(
            order=later, requested_by=self.customer,
            original_details={"delivery_date": "2026-04-23"},
            requested_details={"delivery_date": "2026-04-24"},
        )
        response = self.client.get(self.day_url, {"date": "2026-04-23"})
        self.assertEqual(response.status_code, 200)
        orders = response.data["orders"]
        self.assertEqual([order["id"] for order in orders], [earlier.id, later.id, unslotted.id])
        self.assertEqual(orders[0]["customer_name"], "Maria Santos")
        self.assertEqual(orders[1]["customer_name"], "Ana Cruz")
        self.assertEqual(orders[1]["items"][0]["product_name"], "Carrot Loaf")
        self.assertEqual(orders[1]["items"][0]["quantity"], 2)
        self.assertEqual(orders[1]["delivery_change_requests"][0]["requested_by_name"], self.customer.username)
        self.assertEqual(Decimal(response.data["day_total_estimate"]), Decimal("261.66"))

    def test_high_volume_threshold_tracks_actual_month_load(self):
        self.order(day="2026-04-01")
        for _ in range(3):
            self.order(day="2026-04-02")
        data = self.calendar()
        self.assertEqual(data["high_volume_threshold"], 3)
        self.assertFalse(data["days"][0]["is_high_volume"])
        self.assertTrue(data["days"][1]["is_high_volume"])
        for _ in range(4):
            self.order(day="2026-04-01")
        self.assertEqual(self.calendar()["high_volume_threshold"], 5)

    def test_empty_days_months_and_leap_days(self):
        data = self.calendar()
        self.assertEqual(data["counts"]["all"], 0)
        self.assertEqual(data["days"], [])
        self.assertIsNone(data["high_volume_threshold"])
        self.order(day="2028-02-29", amount="250.05")
        self.assertEqual(self.calendar(month="2028-02")["counts"]["all"], 1)
        response = self.client.get(self.day_url, {"date": "2028-02-28"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["orders"], [])
        self.assertEqual(response.data["day_total_estimate"], "0.00")

    def test_invalid_inputs_return_400_even_without_matching_records(self):
        for params in [
            {"month": "2026-13"}, {"month": "26-04"}, {"month": "0000-04"},
            {"month": "2026-04", "start_date": "2026-04-02"},
            {"month": "2026-04", "end_date": "2026-04-29"},
            {"month": "2026-04", "start_date": "2026-01-01"},
            {"month": "2026-04", "status": "invented"},
        ]:
            with self.subTest(params=params):
                self.assertEqual(self.client.get(self.calendar_url, params).status_code, 400)
        for params in [{}, {"date": "2026-02-29"}, {"date": "2026-4-23"}, {"date": "2026-04-23", "status": "invented"}]:
            with self.subTest(params=params):
                self.assertEqual(self.client.get(self.day_url, params).status_code, 400)

    def test_both_endpoints_reject_anonymous_and_non_admin_users(self):
        for user in [None, self.customer]:
            self.client.force_authenticate(user)
            for endpoint, params in [(self.calendar_url, {"month": "2026-04"}), (self.day_url, {"date": "2026-04-23"})]:
                with self.subTest(user=user, endpoint=endpoint):
                    self.assertIn(self.client.get(endpoint, params).status_code, [401, 403])

    def test_endpoints_are_read_only_and_uncached(self):
        order = self.order()
        for endpoint, params in [(self.calendar_url, {"month": "2026-04"}), (self.day_url, {"date": "2026-04-23"})]:
            with CaptureQueriesContext(connection) as queries:
                response = self.client.get(endpoint, params)
            self.assertEqual(response.status_code, 200)
            self.assertIn("no-store", response["Cache-Control"])
            self.assertFalse(any(query["sql"].lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE")) for query in queries))
            for method in ["post", "patch", "put", "delete"]:
                self.assertEqual(getattr(self.client, method)(endpoint, params).status_code, 405)
        order.refresh_from_db()
        self.assertEqual(order.delivery_date, date(2026, 4, 23))

    def test_query_count_does_not_grow_per_order_or_item(self):
        self.order(user=self.customer)
        with CaptureQueriesContext(connection) as initial:
            self.client.get(self.day_url, {"date": "2026-04-23"})
        for _ in range(8):
            order = self.order(user=self.customer)
            OrderItem.objects.create(order=order, quantity=3, price="20.00")
            OrderDeliveryChangeRequest.objects.create(order=order, requested_by=self.customer)
        with CaptureQueriesContext(connection) as expanded:
            response = self.client.get(self.day_url, {"date": "2026-04-23"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(initial), len(expanded))
