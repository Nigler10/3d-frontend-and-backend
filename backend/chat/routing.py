# chat/routing.py
from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(
        r"ws/orders/status/$",
        consumers.OrderStatusConsumer.as_asgi(),
    ),
    re_path(
        r"ws/chat/orders/(?P<order_id>\d+)/$",
        consumers.ChatConsumer.as_asgi(),
    ),
]