# chat/signals.py
from django.db import transaction
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from store.models import Order
from .models import Conversation
from .services import ChatService


@receiver(pre_save, sender=Order)
def remember_order_status(sender, instance, **kwargs):
    if not instance.pk:
        instance._previous_status = None
        return

    instance._previous_status = sender.objects.filter(
        pk=instance.pk
    ).values_list("status", flat=True).first()

@receiver(post_save, sender=Order)
def create_order_conversation(sender, instance, created, **kwargs):
    if created:
        Conversation.objects.create(order=instance)


@receiver(post_save, sender=Order)
def broadcast_order_status_change(sender, instance, created, **kwargs):
    previous_status = getattr(instance, "_previous_status", None)
    if not created and previous_status and previous_status != instance.status:
        transaction.on_commit(
            lambda order=instance: ChatService.broadcast_order_status(order)
        )