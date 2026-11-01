# chat/routing.py
from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(
        r"ws/orders/status/$",
        consumers.OrderStatusConsumer.as_asgi(),
    ),

    # Admin support inbox must appear before the conversation route.
    re_path(
        r"ws/chat/support/inbox/$",
        consumers.SupportInboxConsumer.as_asgi(),
    ),

    re_path(
        r"ws/chat/support/(?P<conversation_id>\d+)/$",
        consumers.SupportChatConsumer.as_asgi(),
    ),

    # Existing order chat
    re_path(
        r"ws/chat/orders/(?P<order_id>\d+)/$",
        consumers.ChatConsumer.as_asgi(),
    ),
]
