# chat/services.py
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.utils import timezone

from .models import Message, SupportMessage

logger = logging.getLogger(__name__)

class ChatService:

    @staticmethod
    def create_message(
        *,
        conversation,
        sender,
        sender_type,
        content,
        message_type="text",
        attachment=None,
        metadata=None,
        read_by_customer=False,
        read_by_admin=False,
    ):
        return Message.objects.create(
            conversation=conversation,
            sender=sender,
            sender_type=sender_type,
            message_type=message_type,
            content=content,
            attachment=attachment,
            metadata=metadata or {},
            read_by_customer=read_by_customer,
            read_by_admin=read_by_admin,
        )

    @staticmethod
    def create_system_message(
        *,
        conversation,
        content,
        metadata=None,
        read_by_customer=False,
        read_by_admin=False,
    ):
        return ChatService.create_message(
            conversation=conversation,
            sender=None,
            sender_type="system",
            message_type="system",
            content=content,
            metadata=metadata or {},
            read_by_customer=read_by_customer,
            read_by_admin=read_by_admin,
        )

    @staticmethod
    def websocket_payload(message):
        return {
            "id": message.id,
            "sender": message.sender_id,
            "sender_name": (
                message.sender.username
                if message.sender
                else "System"
            ),
            "sender_type": message.sender_type,
            "message_type": message.message_type,
            "message": message.content,
            "metadata": message.metadata or {},
            "attachment": (
                message.attachment.url
                if message.attachment
                else None
            ),
            "created_at": message.created_at.isoformat(),
        }

    @staticmethod
    def broadcast_message(message):
        channel_layer = get_channel_layer()

        if channel_layer is None:
            logger.warning(
                "Unable to broadcast chat message %s: "
                "no channel layer configured.",
                message.id,
            )
            return

        try:
            async_to_sync(
                channel_layer.group_send
            )(
                f"order_{message.conversation.order_id}",
                {
                    "type": "chat_message",
                    "message": ChatService.websocket_payload(
                        message
                    ),
                },
            )

        except Exception:
            # The message is already safely stored in the database.
            # A websocket failure should not make the API request fail.
            logger.exception(
                "Failed to broadcast chat message %s",
                message.id,
            )

    @staticmethod
    def broadcast_order_status(order):
        channel_layer = get_channel_layer()
        if channel_layer is None:
            logger.warning(
                "Unable to broadcast status for order %s: no channel layer configured.",
                order.id,
            )
            return

        event = {
            "type": "order_status_update",
            "order_id": order.id,
            "status": order.status,
        }
        if order.status == "rejected":
            event["rejection_reason"] = order.rejection_reason

        if order.user_id:
            try:
                async_to_sync(channel_layer.group_send)(
                    f"customer_{order.user_id}",
                    event,
                )
            except Exception:
                logger.exception(
                    "Failed to broadcast status for order %s to its customer",
                    order.id,
                )

        if order.status == "cancelled":
            try:
                async_to_sync(channel_layer.group_send)("admins", event)
            except Exception:
                logger.exception(
                    "Failed to broadcast cancellation for order %s to admins",
                    order.id,
                )
                
class SupportChatService:

    @staticmethod
    def create_message(
        *,
        conversation,
        sender,
        sender_type,
        content="",
        message_type="text",
        attachment=None,
    ):
        message = SupportMessage.objects.create(
            conversation=conversation,
            sender=sender,
            sender_type=sender_type,
            message_type=message_type,
            content=content,
            attachment=attachment,
            read_by_customer=False,
            read_by_admin=False,
        )

        # A new customer message reopens a resolved conversation.
        # Admin replies do not automatically resolve or reopen it.
        if sender_type == "customer":
            conversation.status = "open"

        conversation.last_message_at = message.created_at

        conversation.save(
            update_fields=[
                "status",
                "last_message_at",
                "updated_at",
            ]
        )

        return message

    @staticmethod
    def websocket_payload(message):
        attachment_url = None

        if message.attachment:
            try:
                attachment_url = message.attachment.url
            except Exception:
                attachment_url = None

        return {
            "id": message.id,
            "sender": message.sender_id,
            "sender_name": (
                message.sender.username
                if message.sender
                else "System"
            ),
            "sender_type": message.sender_type,
            "message_type": message.message_type,
            "message": message.content,
            "attachment": attachment_url,
            "created_at": message.created_at.isoformat(),
            "read_by_customer": message.read_by_customer,
            "read_by_admin": message.read_by_admin,
        }

    @staticmethod
    def broadcast_message(message):
        channel_layer = get_channel_layer()

        if channel_layer is None:
            logger.warning(
                "Unable to broadcast support message %s: "
                "no channel layer configured.",
                message.id,
            )
            return

        payload = SupportChatService.websocket_payload(message)

        try:
            async_to_sync(channel_layer.group_send)(
                f"support_{message.conversation_id}",
                {
                    "type": "support_message",
                    "message": payload,
                },
            )
        except Exception:
            logger.exception(
                "Failed to broadcast support message %s",
                message.id,
            )

        # Notify the admin inbox that this conversation has changed.
        try:
            async_to_sync(channel_layer.group_send)(
                "support_admins",
                {
                    "type": "support_inbox_update",
                    "conversation_id": message.conversation_id,
                    "status": message.conversation.status,
                },
            )
        except Exception:
            logger.exception(
                "Failed to notify support inbox for message %s",
                message.id,
            )

    @staticmethod
    def broadcast_conversation_update(conversation):
        channel_layer = get_channel_layer()

        if channel_layer is None:
            return

        event = {
            "conversation_id": conversation.id,
            "status": conversation.status,
        }

        try:
            async_to_sync(channel_layer.group_send)(
                f"support_{conversation.id}",
                {
                    "type": "support_conversation_update",
                    **event,
                },
            )
        except Exception:
            logger.exception(
                "Failed to broadcast support conversation update %s",
                conversation.id,
            )

        try:
            async_to_sync(channel_layer.group_send)(
                "support_admins",
                {
                    "type": "support_inbox_update",
                    **event,
                },
            )
        except Exception:
            logger.exception(
                "Failed to notify support admins about conversation %s",
                conversation.id,
            )