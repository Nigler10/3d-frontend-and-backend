# chat/urls.py
from django.urls import path
from .diagnostics import redis_health
from . import views

urlpatterns = [
    # Existing order chat
    path("unread/", views.unread_count),
    path("unread/orders/", views.unread_per_order),

    path("orders/<int:order_id>/", views.conversation_detail),
    path("orders/<int:order_id>/send/", views.send_message),
    path("orders/<int:order_id>/read/", views.mark_messages_read),

    # Customer support
    path("support/", views.support_conversation),
    path("support/inbox/", views.support_inbox),
    path("support/unread/", views.support_unread_count),

    path("support/<int:conversation_id>/", views.support_conversation_detail),
    path("support/<int:conversation_id>/send/", views.send_support_message),
    path("support/<int:conversation_id>/read/", views.mark_support_messages_read),
    path("support/<int:conversation_id>/status/", views.update_support_status),

    # Diagnostics
    path("diagnostics/redis/", redis_health),
]
