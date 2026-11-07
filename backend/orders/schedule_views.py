"""Read-only admin calendar queries over the existing order records."""

import calendar
import re
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, F, Prefetch, Sum
from django.utils import timezone
from django.views.decorators.cache import never_cache
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from store.models import Order, OrderItem
from .models import OrderDeliveryChangeRequest
from .serializers import OrderDeliveryChangeRequestSerializer, OrderItemSerializer


PENDING_STATUSES = (
    "pending_review", "awaiting_downpayment", "awaiting_customer_response",
)
STATUS_FILTERS = {
    "pending": PENDING_STATUSES,
    **{value: (value,) for value, _label in Order.STATUS_CHOICES},
    "completed": ("completed", "delivered"),
}


def parse_date(value, name):
    if not value or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValidationError({name: "Use YYYY-MM-DD."})
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValidationError({name: "Enter a valid date."})


def filter_orders(orders, status):
    if status == "all":
        return orders
    if status not in STATUS_FILTERS:
        raise ValidationError({"status": "Unknown order status."})
    return orders.filter(status__in=STATUS_FILTERS[status])


def filter_counts(status_counts):
    return {
        "all": sum(status_counts.values()),
        "pending": sum(status_counts.get(status, 0) for status in PENDING_STATUSES),
        "processing": status_counts.get("processing", 0),
        "out_for_delivery": status_counts.get("out_for_delivery", 0),
    }


class ScheduledOrderSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    items = OrderItemSerializer(many=True, read_only=True)
    delivery_change_requests = OrderDeliveryChangeRequestSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = (
            "id", "customer_name", "status", "status_label", "delivery_date",
            "delivery_time", "items", "total_amount", "order_notes",
            "delivery_change_requests",
        )

    def get_customer_name(self, order):
        return order.full_name or (
            order.user.get_full_name() or order.user.username if order.user else None
        )


@never_cache
@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_schedule_calendar(request):
    """Month totals plus daily counts for the visible calendar date range.

    Filter pills always count the requested month, excluding its grey overflow
    cells. All means every dated order, including terminal statuses. Pending
    combines review, customer-response, and downpayment states.
    """
    month = request.query_params.get("month", timezone.localdate().strftime("%Y-%m"))
    if not re.fullmatch(r"\d{4}-\d{2}", month):
        raise ValidationError({"month": "Use YYYY-MM."})
    first = parse_date(f"{month}-01", "month")
    last = first.replace(day=calendar.monthrange(first.year, first.month)[1])
    start = parse_date(request.query_params.get("start_date", first.isoformat()), "start_date")
    end = parse_date(request.query_params.get("end_date", last.isoformat()), "end_date")
    if start > first or end < last or end - start > timedelta(days=62):
        raise ValidationError({"date_range": "Include the full month in a range of at most 63 days."})

    status_filter = request.query_params.get("status", "all")
    # Validate even when the database contains no scheduled orders.
    filter_orders(Order.objects.all(), status_filter)
    grouped = (
        Order.objects.filter(delivery_date__range=(start, end))
        .values("delivery_date", "status").annotate(count=Count("id"))
        .order_by("delivery_date", "status")
    )
    days = {}
    month_status_counts = {}
    for row in grouped:
        day = row["delivery_date"].isoformat()
        days.setdefault(day, {})[row["status"]] = row["count"]
        if first <= row["delivery_date"] <= last:
            month_status_counts[row["status"]] = (
                month_status_counts.get(row["status"], 0) + row["count"]
            )

    month_counts = filter_counts(month_status_counts)
    scheduled_days = sum(first.isoformat() <= day <= last.isoformat() for day in days)
    # High volume means strictly above the month's average occupied-day load.
    # It is derived from real counts, rather than a fixed delivery threshold.
    threshold = month_counts["all"] // scheduled_days + 1 if scheduled_days else None
    result = []
    for day, counts in days.items():
        matching = counts if status_filter == "all" else {
            status: count for status, count in counts.items()
            if status in STATUS_FILTERS[status_filter]
        }
        count = sum(matching.values())
        result.append({
            "date": day,
            "count": count,
            "total_count": sum(counts.values()),
            "status_counts": matching,
            "dominant_status": max(matching, key=matching.get) if matching else None,
            "is_high_volume": threshold is not None and count >= threshold,
        })
    return Response({
        "month": month, "start_date": start, "end_date": end,
        "status": status_filter, "counts": month_counts,
        "high_volume_threshold": threshold, "days": result,
    })


@never_cache
@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_schedule_day(request):
    selected_date = parse_date(request.query_params.get("date"), "date")
    day_orders = Order.objects.filter(delivery_date=selected_date)
    filtered = filter_orders(day_orders, request.query_params.get("status", "all"))
    # total_amount is the app's canonical estimate (updated on quote acceptance).
    summary = day_orders.aggregate(count=Count("id"), estimate=Sum("total_amount"))
    orders = filtered.select_related("user").prefetch_related(
        Prefetch("items", queryset=OrderItem.objects.select_related("product").order_by("id")),
        Prefetch("delivery_change_requests", queryset=(
            OrderDeliveryChangeRequest.objects.select_related("requested_by", "reviewed_by")
        )),
    ).order_by(F("delivery_time").asc(nulls_last=True), "id")
    data = ScheduledOrderSerializer(orders, many=True).data
    return Response({
        "date": selected_date,
        "status": request.query_params.get("status", "all"),
        "total_count": len(data),
        "day_total_count": summary["count"],
        "total_estimate": str(sum((order.total_amount for order in orders), Decimal("0.00"))),
        "day_total_estimate": str(summary["estimate"] or Decimal("0.00")),
        "orders": data,
    })
