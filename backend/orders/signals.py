# orders/signals.py
from django.db.models.signals import (
    post_save,
    pre_save,
)
from django.dispatch import receiver

from store.models import Order
from .models import OrderStatusHistory


@receiver(pre_save, sender=Order)
def remember_previous_order_status(
    sender,
    instance,
    **kwargs
):
    if not instance.pk:
        instance._previous_status = None
        return

    try:
        previous = (
            sender.objects
            .only("status")
            .get(pk=instance.pk)
        )

        instance._previous_status = (
            previous.status
        )

    except sender.DoesNotExist:
        instance._previous_status = None


@receiver(post_save, sender=Order)
def record_order_status_change(
    sender,
    instance,
    created,
    **kwargs
):
    previous_status = getattr(
        instance,
        "_previous_status",
        None
    )

    status_changed = (
        created
        or previous_status != instance.status
    )

    if not status_changed:
        return

    OrderStatusHistory.objects.create(
        order=instance,
        status=instance.status,
    )