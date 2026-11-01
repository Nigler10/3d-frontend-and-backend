# chat/views.py
from rest_framework.decorators import ( api_view, permission_classes, parser_classes )
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from store.models import Order

from django.db.models import Count, Q, OuterRef, Subquery
from django.shortcuts import get_object_or_404

from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import ( Conversation, SupportConversation, SupportMessage )
from .services import ChatService, SupportChatService
from .serializers import ( ConversationSerializer, MessageSerializer, SendMessageSerializer, SupportConversationDetailSerializer, SupportInboxSerializer, SupportMessageSerializer, SendSupportMessageSerializer, SupportConversationStatusSerializer )

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def conversation_detail(request, order_id):

    try:
        if request.user.is_staff or request.user.is_superuser:
            order = Order.objects.get(id=order_id)
        else:
            order = Order.objects.get(
                id=order_id,
                user=request.user
            )

    except Order.DoesNotExist:
        return Response(
            {"error": "Order not found"},
            status=404
        )

    conversation, created = Conversation.objects.get_or_create(
        order=order
    )
    serializer = ConversationSerializer(conversation)

    return Response(serializer.data)

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def send_message(request, order_id):

    try:
        if request.user.is_staff or request.user.is_superuser:
            order = Order.objects.get(id=order_id)
        else:
            order = Order.objects.get(
                id=order_id,
                user=request.user
            )

    except Order.DoesNotExist:
        return Response(
            {"error": "Order not found"},
            status=404
        )

    conversation, created = Conversation.objects.get_or_create(
        order=order
    )

    serializer = SendMessageSerializer(
        data=request.data
    )

    if serializer.is_valid():
        message = ChatService.create_message(
            conversation=conversation,
            sender=request.user,
            sender_type=(
                "admin"
                if request.user.is_staff or request.user.is_superuser
                else "customer"
            ),
            content=serializer.validated_data.get("content", ""),
            attachment=serializer.validated_data.get("attachment"),
        )

        ChatService.broadcast_message(message)

        return Response(
            MessageSerializer(message).data,
            status=201,
        )

    return Response(
        serializer.errors,
        status=400
    )
    
# READ ENDPOINT
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_messages_read(request, order_id):

    try:
        if request.user.is_staff or request.user.is_superuser:
            order = Order.objects.get(id=order_id)
        else:
            order = Order.objects.get(
                id=order_id,
                user=request.user
            )

    except Order.DoesNotExist:
        return Response(
            {"error": "Order not found"},
            status=404
        )

    conversation = order.conversation

    if request.user.is_staff or request.user.is_superuser:

        updated = conversation.messages.filter(
            sender_type__in=["customer", "system"],
            read_by_admin=False
        ).update(read_by_admin=True)

    else:

        updated = conversation.messages.filter(
            sender_type__in=["admin", "system"],
            read_by_customer=False
        ).update(read_by_customer=True)

    return Response({
        "messages_marked_read": updated
    })
    
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def unread_count(request):

    if request.user.is_staff or request.user.is_superuser:
        total = (
            Conversation.objects
            .filter(order__isnull=False)
            .aggregate(
                total=Count(
                    "messages",
                    filter=Q(
                        messages__sender_type__in=["customer", "system"],
                        messages__read_by_admin=False
                    )
                )
            )["total"]
            or 0
        )

    else:

        total = (
            Conversation.objects
            .filter(order__user=request.user)
            .aggregate(
                total=Count(
                    "messages",
                    filter=Q(
                        messages__sender_type__in=["admin", "system"],
                        messages__read_by_customer=False
                    )
                )
            )["total"]
            or 0
        )

    return Response({
        "total_unread": total
    })
    
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def unread_per_order(request):

    if request.user.is_staff or request.user.is_superuser:

        conversations = Conversation.objects.filter(
            order__isnull=False
        )

        result = []

        for convo in conversations:

            unread = convo.messages.filter(
                sender_type__in=["customer", "system"],
                read_by_admin=False
            ).count()

            result.append({
                "order": convo.order.id,
                "unread": unread,
            })

    else:

        conversations = Conversation.objects.filter(
            order__user=request.user
        )

        result = []

        for convo in conversations:

            unread = convo.messages.filter(
                sender_type__in=["admin", "system"],
                read_by_customer=False
            ).count()

            result.append({
                "order": convo.order.id,
                "unread": unread,
            })

    return Response(result)


# ============================================================
# CUSTOMER SUPPORT
# ============================================================

def is_support_admin(user):
    return user.is_staff or user.is_superuser


def get_accessible_support_conversation(request, conversation_id):
    queryset = SupportConversation.objects.select_related(
        "customer"
    ).prefetch_related(
        "messages__sender"
    )

    if is_support_admin(request.user):
        return get_object_or_404(
            queryset,
            id=conversation_id,
        )

    return get_object_or_404(
        queryset,
        id=conversation_id,
        customer=request.user,
    )


# ------------------------------------------------------------
# CUSTOMER: GET OR CREATE PERSISTENT SUPPORT CONVERSATION
# GET /api/chat/support/
# ------------------------------------------------------------

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def support_conversation(request):

    if is_support_admin(request.user):
        return Response(
            {"error": "This endpoint is for customers only."},
            status=403,
        )

    conversation, created = SupportConversation.objects.get_or_create(
        customer=request.user,
    )

    serializer = SupportConversationDetailSerializer(
        conversation,
        context={"request": request},
    )

    return Response(serializer.data)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def support_inbox(request):

    if not is_support_admin(request.user):
        return Response(
            {"error": "Admin access required."},
            status=403,
        )

    queryset = SupportConversation.objects.select_related(
        "customer",
        "customer__userprofile",
    ).order_by()

    status_filter = request.query_params.get("status")

    if status_filter:
        valid_statuses = [
            choice[0]
            for choice in SupportConversation.STATUS_CHOICES
        ]

        if status_filter not in valid_statuses:
            return Response(
                {"error": "Invalid support status."},
                status=400,
            )

        queryset = queryset.filter(status=status_filter)

    latest_message = SupportMessage.objects.filter(
        conversation_id=OuterRef("pk")
    ).order_by("-created_at")

    queryset = queryset.annotate(
        last_message_content=Subquery(
            latest_message.values("content")[:1]
        ),
        last_message_type=Subquery(
            latest_message.values("message_type")[:1]
        ),
        last_message_sender_type=Subquery(
            latest_message.values("sender_type")[:1]
        ),
        unread_count=Count(
            "messages",
            filter=Q(
                messages__sender_type__in=["customer", "system"],
                messages__read_by_admin=False,
            ),
            distinct=True,
        ),
    ).order_by("-last_message_at")

    serializer = SupportInboxSerializer(
        queryset,
        many=True,
    )

    return Response({
        "results": serializer.data,
    })


# ------------------------------------------------------------
# GET A SUPPORT CONVERSATION AND ITS HISTORY
# GET /api/chat/support/<conversation_id>/
# ------------------------------------------------------------

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def support_conversation_detail(request, conversation_id):

    conversation = get_accessible_support_conversation(
        request,
        conversation_id,
    )

    serializer = SupportConversationDetailSerializer(
        conversation,
        context={"request": request},
    )

    return Response(serializer.data)

@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([
    MultiPartParser,
    FormParser,
    JSONParser,
])
def send_support_message(request, conversation_id):

    conversation = get_accessible_support_conversation(
        request,
        conversation_id,
    )

    serializer = SendSupportMessageSerializer(
        data=request.data,
        context={"request": request},
    )

    if not serializer.is_valid():
        return Response(
            serializer.errors,
            status=400,
        )

    content = serializer.validated_data.get("content", "")
    attachment = serializer.validated_data.get("attachment")

    sender_type = (
        "admin"
        if is_support_admin(request.user)
        else "customer"
    )

    message = SupportChatService.create_message(
        conversation=conversation,
        sender=request.user,
        sender_type=sender_type,
        content=content,
        message_type="image" if attachment else "text",
        attachment=attachment,
    )

    SupportChatService.broadcast_message(message)

    return Response(
        SupportMessageSerializer(
            message,
            context={"request": request},
        ).data,
        status=201,
    )


# ------------------------------------------------------------
# MARK SUPPORT MESSAGES AS READ
# POST /api/chat/support/<conversation_id>/read/
# ------------------------------------------------------------

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_support_messages_read(request, conversation_id):

    conversation = get_accessible_support_conversation(
        request,
        conversation_id,
    )

    if is_support_admin(request.user):

        updated = conversation.messages.filter(
            sender_type__in=["customer", "system"],
            read_by_admin=False,
        ).update(
            read_by_admin=True,
        )

    else:

        updated = conversation.messages.filter(
            sender_type__in=["admin", "system"],
            read_by_customer=False,
        ).update(
            read_by_customer=True,
        )

    return Response({
        "messages_marked_read": updated,
    })


# ------------------------------------------------------------
# ADMIN: CHANGE SUPPORT CONVERSATION STATUS
# PATCH /api/chat/support/<conversation_id>/status/
# ------------------------------------------------------------

@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_support_status(request, conversation_id):

    if not is_support_admin(request.user):
        return Response(
            {"error": "Admin access required."},
            status=403,
        )

    conversation = get_object_or_404(
        SupportConversation,
        id=conversation_id,
    )

    serializer = SupportConversationStatusSerializer(
        data=request.data,
    )

    if not serializer.is_valid():
        return Response(
            serializer.errors,
            status=400,
        )

    conversation.status = serializer.validated_data["status"]

    conversation.save(
        update_fields=["status", "updated_at"],
    )

    SupportChatService.broadcast_conversation_update(
        conversation,
    )

    return Response({
        "id": conversation.id,
        "status": conversation.status,
    })

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def support_unread_count(request):

    if is_support_admin(request.user):

        total = SupportMessage.objects.filter(
            sender_type__in=["customer", "system"],
            read_by_admin=False,
        ).count()

    else:

        total = SupportMessage.objects.filter(
            conversation__customer=request.user,
            sender_type__in=["admin", "system"],
            read_by_customer=False,
        ).count()

    return Response({
        "total_unread": total,
    })
