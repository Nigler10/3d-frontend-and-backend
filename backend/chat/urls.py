# chat/urls.py
from django.urls import path
from .diagnostics import redis_health
from . import views

urlpatterns = [
    path("unread/", views.unread_count),
    path("unread/orders/", views.unread_per_order),

    path("orders/<int:order_id>/", views.conversation_detail),
    path("orders/<int:order_id>/send/", views.send_message),

    path("orders/<int:order_id>/read/", views.mark_messages_read),
    
    path("diagnostics/redis/", redis_health),
]