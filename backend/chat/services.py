# chat/services.py
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from .models import Message

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
        if not order.user_id:
            return

        channel_layer = get_channel_layer()
        if channel_layer is None:
            logger.warning(
                "Unable to broadcast status for order %s: no channel layer configured.",
                order.id,
            )
            return

        try:
            async_to_sync(channel_layer.group_send)(
                f"customer_{order.user_id}",
                {
                    "type": "order_status_update",
                    "order_id": order.id,
                    "status": order.status,
                },
            )
        except Exception:
            logger.exception("Failed to broadcast status for order %s", order.id)