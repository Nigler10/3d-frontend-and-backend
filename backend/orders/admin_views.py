# orders/admin_views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from store.models import Order
from chat.models import Conversation, Message, Quotation
from chat.services import ChatService
from django.db import transaction
from decimal import Decimal, InvalidOperation
from .serializers import OrderSerializer, QuotationSerializer
from chat.serializers import MessageSerializer
from django.db.models import Count, Sum
from datetime import date, timedelta
from .utils_sms_notifications import send_order_status_sms
from payments.services import (
    PaymentAlreadyCompletedError,
    PaymentGatewayError,
    expire_pending_checkout_sessions,
)

# ADMIN: LIST ALL ORDERS
@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_orders(request):
    orders = Order.objects.all().order_by('-created_at')
    serializer = OrderSerializer(orders, many=True)
    return Response(serializer.data)

# ADMIN: ORDER DETAIL
@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_order_detail(request, order_id):
    try:
        order = Order.objects.get(id=order_id)
        serializer = OrderSerializer(order)
        return Response(serializer.data)
    except Order.DoesNotExist:
        return Response({'error': 'Order not found'}, status=404)

@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_send_quotation(request, order_id):

    try:
        order = Order.objects.get(id=order_id)

    except Order.DoesNotExist:
        return Response(
            {"error": "Order not found"},
            status=404
        )

    if not order.is_uploaded_cake:
        return Response(
            {"error": "Quotation is only available for uploaded cake orders."},
            status=400
        )

    if order.status not in ["pending_review", "awaiting_customer_response"]:
        return Response(
            {"error": "A quotation cannot be sent for this order status."},
            status=400
        )

    amount = request.data.get("amount")

    if amount is None:
        return Response(
            {"error": "Quotation amount is required."},
            status=400
        )

    try:
        amount = Decimal(str(amount))

        if amount <= 0:
            raise ValueError

    except (InvalidOperation, TypeError, ValueError):
        return Response(
            {"error": "Quotation amount must be greater than 0."},
            status=400
        )

    with transaction.atomic():
        order.quotations.filter(
            status="pending"
        ).update(
            status="replaced"
        )

        quotation = Quotation.objects.create(
            order=order,
            created_by=request.user,
            amount=amount,
            status="pending",
        )

        order.quoted_price = amount
        order.status = "awaiting_customer_response"
        order.save(
            update_fields=[
                "quoted_price",
                "status",
            ]
        )

        conversation, _ = Conversation.objects.get_or_create(
            order=order
        )

        message = Message.objects.create(
            conversation=conversation,
            sender=request.user,
            sender_type="admin",
            message_type="quotation",
            content=f"Quotation: ₱{amount:,.2f}",
            metadata={
                "quotation_id": quotation.id,
                "amount": str(amount),
                "status": "pending",
                "is_quotation": True,
            },
        )

    return Response({
        "message": "Quotation sent successfully.",
        "quotation": QuotationSerializer(quotation).data,
        "chat_message": MessageSerializer(message).data,
        "order": OrderSerializer(order).data,
    })

# ADMIN: UPDATE ORDER
@api_view(['PATCH'])
@permission_classes([IsAdminUser])
def admin_review_order(request, order_id):

    try:
        order = Order.objects.get(id=order_id)

    except Order.DoesNotExist:
        return Response(
            {"error": "Order not found"},
            status=404
        )

    new_status = request.data.get("status")
    reason = request.data.get("rejection_reason")

    if order.is_uploaded_cake:

        if order.status not in [
            "pending_review",
            "awaiting_customer_response"
        ]:
            return Response(
                {"error": "This uploaded cake order can no longer be rejected."},
                status=400
            )

        if new_status != "rejected":
            return Response(
                {"error": "Uploaded cake orders can only be rejected from this endpoint."},
                status=400
            )

        if not reason:
            return Response(
                {"error": "Rejection reason required"},
                status=400
            )

        old_status = order.status

        order.status = "rejected"
        order.rejection_reason = reason
        order.save(
            update_fields=[
                "status",
                "rejection_reason",
            ]
        )

        sms_sent = False

        if old_status != order.status:
            try:
                send_order_status_sms(order)
                sms_sent = True
            except Exception as e:
                print("ORDER SMS ERROR:", str(e))

        return Response({
            "message": "Uploaded cake order rejected successfully",
            "order": OrderSerializer(order).data,
            "sms_sent": sms_sent
        })

    if order.status != "pending_review":
        return Response(
            {"error": "Order already reviewed"},
            status=400
        )

    if new_status not in [
        "awaiting_downpayment",
        "rejected"
    ]:
        return Response(
            {"error": "Invalid status"},
            status=400
        )

    if new_status == "rejected":

        if not reason:
            return Response(
                {"error": "Rejection reason required"},
                status=400
            )

        order.rejection_reason = reason

    old_status = order.status
    order.status = new_status
    order.save()

    sms_sent = False

    if old_status != new_status:
        try:
            send_order_status_sms(order)
            sms_sent = True
        except Exception as e:
            print("ORDER SMS ERROR:", str(e))

    return Response({
        "message": "Order reviewed successfully",
        "order": OrderSerializer(order).data,
        "sms_sent": sms_sent
    })
    
@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def admin_update_order_status(request, order_id):
    try:
        order = Order.objects.get(
            id=order_id
        )

    except Order.DoesNotExist:
        return Response(
            {"error": "Order not found"},
            status=404
        )

    new_status = request.data.get("status")

    if not new_status:
        return Response(
            {"error": "Status is required"},
            status=400
        )

    valid_transitions = {
        "pending_review": [
            "cancelled",
        ],
        "awaiting_customer_response": [
            "cancelled",
        ],
        "awaiting_downpayment": [
            "processing",
            "cancelled",
        ],
        "processing": [
            "ready_for_delivery",
            "cancelled",
        ],
        "ready_for_delivery": [
            "out_for_delivery",
        ],
        "out_for_delivery": [
            "delivered",
        ],
    }

    current_status = order.status

    if (
        current_status not in valid_transitions
        or new_status not in valid_transitions[current_status]
    ):
        return Response(
            {
                "error":
                    f"Invalid transition from "
                    f"{current_status} to {new_status}"
            },
            status=400
        )

    # --------------------------------------------------
    # PROCESSING REQUIRES A VERIFIED PAYMENT
    # --------------------------------------------------

    if new_status == "processing":
        if order.payment_status not in [
            "partial",
            "paid",
        ]:
            return Response(
                {
                    "error":
                        "This order cannot start processing "
                        "until a payment has been confirmed."
                },
                status=400
            )

    # --------------------------------------------------
    # CANCELLATION SAFETY
    # --------------------------------------------------

    if new_status == "cancelled":

        total_paid = (
            order.payments
            .filter(
                status__in=[
                    "partial",
                    "paid",
                ]
            )
            .aggregate(
                total=Sum("amount")
            )["total"]
            or Decimal("0.00")
        )

        # We do not currently have an automated refund flow.
        #
        # Once real money has been received, admins must not
        # simply cancel the order and lose payment accounting.
        if (
            total_paid > 0
            or order.payment_status in [
                "partial",
                "paid",
            ]
        ):
            return Response(
                {
                    "error":
                        "This order already has a confirmed "
                        "payment and cannot be cancelled "
                        "without a refund process."
                },
                status=409
            )

        try:
            expire_pending_checkout_sessions(
                order
            )

        except PaymentAlreadyCompletedError:
            return Response(
                {
                    "error":
                        "PayMongo reports that this checkout "
                        "has already been paid. Refresh the "
                        "order before making changes."
                },
                status=409
            )

        except PaymentGatewayError:
            return Response(
                {
                    "error":
                        "The active payment checkout could "
                        "not be safely closed. Please try again."
                },
                status=503
            )

    if new_status == "delivered":
        if order.payment_status not in [
            "partial",
            "paid",
        ]:
            return Response(
                {
                    "error":
                        "This order must have a confirmed "
                        "downpayment before it can be marked delivered."
                },
                status=400
            )

    old_status = order.status

    order.status = new_status

    if new_status == "cancelled":
        order.payment_status = "cancelled"

        order.save(
            update_fields=[
                "status",
                "payment_status",
            ]
        )

    else:
        order.save(
            update_fields=[
                "status",
            ]
        )

    sms_sent = False

    if old_status != new_status:
        try:
            send_order_status_sms(order)
            sms_sent = True

        except Exception as e:
            print(
                "ORDER SMS ERROR:",
                str(e)
            )

    return Response({
        "message": "Order status updated successfully.",
        "order": OrderSerializer(order).data,
        "sms_sent": sms_sent,

        "trigger_sms":
            new_status in [
                "ready_for_delivery",
                "out_for_delivery",
                "delivered",
            ],

        "allow_rating":
            new_status == "delivered",
    })
    
# DASHBOARD
@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_dashboard(request):
    orders = Order.objects.all()

    today = date.today()
    upcoming_limit = today + timedelta(days=7)

    upcoming_orders_qs = Order.objects.filter(
        delivery_date__range=[today, upcoming_limit]
    ).exclude(status__in=["delivered", "cancelled", "rejected"]).order_by("delivery_date")

    all_upcoming_qs = Order.objects.exclude(
        status__in=["delivered", "cancelled", "rejected"]
    ).order_by("delivery_date", "delivery_time")

    # pagination
    page = int(request.GET.get("page", 1))
    page_size = 5

    start = (page - 1) * page_size
    end = start + page_size

    total_count = all_upcoming_qs.count()
    import math
    total_pages = math.ceil(total_count / page_size) if total_count > 0 else 1

    all_upcoming_orders = OrderSerializer(all_upcoming_qs[start:end], many=True).data
    upcoming_orders = OrderSerializer(upcoming_orders_qs, many=True).data

    # ── Trend calculations ──
    def calc_trend(current, previous):
        """Return (percentage_string, raw_change)."""
        raw_change = current - previous
        if previous == 0:
            pct = "+100%" if current > 0 else "0%"
        else:
            change = ((current - previous) / previous) * 100
            sign = "+" if change >= 0 else ""
            pct = f"{sign}{change:.0f}%"
        return pct, raw_change

    # Month-over-month boundaries
    first_of_this_month = today.replace(day=1)
    first_of_last_month = (first_of_this_month - timedelta(days=1)).replace(day=1)

    # Week-over-week boundaries (Monday-based)
    start_of_this_week = today - timedelta(days=today.weekday())
    start_of_last_week = start_of_this_week - timedelta(days=7)

    # Total orders: this month vs last month
    total_this_month = orders.filter(created_at__date__gte=first_of_this_month).count()
    total_last_month = orders.filter(
        created_at__date__gte=first_of_last_month,
        created_at__date__lt=first_of_this_month,
    ).count()

    # Pending review: this week vs last week
    pending_this_week = orders.filter(
        status="pending_review",
        created_at__date__gte=start_of_this_week,
    ).count()
    pending_last_week = orders.filter(
        status="pending_review",
        created_at__date__gte=start_of_last_week,
        created_at__date__lt=start_of_this_week,
    ).count()

    # Awaiting downpayment: this week vs last week
    awaiting_this_week = orders.filter(
        status="awaiting_downpayment",
        created_at__date__gte=start_of_this_week,
    ).count()
    awaiting_last_week = orders.filter(
        status="awaiting_downpayment",
        created_at__date__gte=start_of_last_week,
        created_at__date__lt=start_of_this_week,
    ).count()

    # Completed (delivered): this month vs last month
    completed_this_month = orders.filter(
        status="delivered",
        created_at__date__gte=first_of_this_month,
    ).count()
    completed_last_month = orders.filter(
        status="delivered",
        created_at__date__gte=first_of_last_month,
        created_at__date__lt=first_of_this_month,
    ).count()

    # Revenue: this month vs last month
    revenue_this_month = orders.filter(
        payment_status="paid",
        created_at__date__gte=first_of_this_month,
    ).aggregate(total=Sum("total_amount"))["total"] or 0
    revenue_last_month = orders.filter(
        payment_status="paid",
        created_at__date__gte=first_of_last_month,
        created_at__date__lt=first_of_this_month,
    ).aggregate(total=Sum("total_amount"))["total"] or 0

    # Compute all trends
    total_pct, total_change = calc_trend(total_this_month, total_last_month)
    pending_pct, pending_change = calc_trend(pending_this_week, pending_last_week)
    awaiting_pct, awaiting_change = calc_trend(awaiting_this_week, awaiting_last_week)
    completed_pct, completed_change = calc_trend(completed_this_month, completed_last_month)
    revenue_pct, revenue_change = calc_trend(float(revenue_this_month), float(revenue_last_month))

    # Overdue orders: delivery_date is in the past, not yet delivered/cancelled/rejected
    overdue_count = Order.objects.filter(
        delivery_date__lt=today
    ).exclude(
        status__in=["delivered", "cancelled", "rejected"]
    ).count()

    data = {
        "total_orders": orders.count(),
        "pending_review": orders.filter(status="pending_review").count(),
        "awaiting_downpayment": orders.filter(status="awaiting_downpayment").count(),
        "completed": orders.filter(status="delivered").count(),

        "total_revenue": orders.filter(payment_status="paid").aggregate(
            total=Sum("total_amount")
        )["total"] or 0,

        # Trend data with raw changes
        "total_orders_trend": total_pct,
        "total_orders_change": total_change,
        "total_orders_previous": total_last_month,
        "total_orders_trend_period": "vs last month",

        "pending_review_trend": pending_pct,
        "pending_review_change": pending_change,
        "pending_review_previous": pending_last_week,
        "pending_review_trend_period": "vs last week",

        "awaiting_downpayment_trend": awaiting_pct,
        "awaiting_downpayment_change": awaiting_change,
        "awaiting_downpayment_previous": awaiting_last_week,
        "awaiting_downpayment_trend_period": "vs last week",

        "completed_trend": completed_pct,
        "completed_change": completed_change,
        "completed_previous": completed_last_month,
        "completed_trend_period": "vs last month",

        "total_revenue_trend": revenue_pct,
        "total_revenue_change": float(revenue_change),
        "total_revenue_previous": float(revenue_last_month),
        "total_revenue_trend_period": "vs last month",

        "overdue_count": overdue_count,

        "status_breakdown": {
            "pending_review": orders.filter(status="pending_review").count(),
            "awaiting_downpayment": orders.filter(status="awaiting_downpayment").count(),
            "processing": orders.filter(status="processing").count(),
            "ready_for_delivery": orders.filter(status="ready_for_delivery").count(),
            "delivered": orders.filter(status="delivered").count(),
            "cancelled": orders.filter(status__in=["cancelled", "rejected"]).count(),
        },

        "upcoming_orders": upcoming_orders,
        "all_upcoming_orders": all_upcoming_orders,
        "all_upcoming_total": total_count,
        "all_upcoming_total_pages": total_pages,
        "all_upcoming_page": page,
        "all_upcoming_has_next": end < total_count,
        "all_upcoming_has_prev": page > 1,
    }

    return Response(data)


