# store/delivery_schedule.py
from collections import Counter
from datetime import date as date_type
from datetime import datetime, time as time_type, timedelta

from django.conf import settings
from django.utils import timezone

from .models import Order


def get_available_delivery_slots(
    requested_date,
    exclude_order_id=None,
):
    max_orders_per_slot = 3
    interval = timedelta(minutes=30)

    now = timezone.localtime()

    earliest_delivery = now + timedelta(
        minutes=settings.DELIVERY_BOOKING_BUFFER_MINUTES
    )

    current = datetime.combine(
        requested_date,
        time_type(8, 0),
    )

    end = datetime.combine(
        requested_date,
        time_type(20, 0),
    )

    slots = []

    while current < end:

        slot_datetime = timezone.make_aware(
            current,
            timezone.get_current_timezone(),
        )

        if (
            requested_date != now.date()
            or slot_datetime > earliest_delivery
        ):
            slots.append(current.time())

        current += interval

    booked_orders = (
        Order.objects
        .filter(delivery_date=requested_date)
        .exclude(status__in=["cancelled", "rejected"])
    )

    # Exclude the order currently being rescheduled.
    if exclude_order_id is not None:
        booked_orders = booked_orders.exclude(
            id=exclude_order_id
        )

    booked_times = booked_orders.values_list(
        "delivery_time",
        flat=True,
    )

    slot_counts = Counter(
        slot
        for slot in booked_times
        if slot is not None
    )

    return [
        slot.strftime("%H:%M")
        for slot in slots
        if slot_counts.get(slot, 0) < max_orders_per_slot
    ]


def validate_delivery_schedule(
    date_value,
    time_value,
    exclude_order_id=None,
):

    try:
        requested_date = date_type.fromisoformat(
            str(date_value)
        )

        requested_time = datetime.strptime(
            str(time_value),
            "%H:%M",
        ).time()

    except (TypeError, ValueError):
        return "Please select a valid delivery date and time."

    if requested_date < timezone.localdate():
        return "Delivery date cannot be in the past."

    available_slots = get_available_delivery_slots(
        requested_date,
        exclude_order_id=exclude_order_id,
    )

    if requested_time.strftime("%H:%M") not in available_slots:
        return (
            "The selected delivery time is no longer available. "
            "Please choose another slot."
        )

    return None