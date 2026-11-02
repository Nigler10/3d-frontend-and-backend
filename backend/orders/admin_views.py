# orders/admin_views.py
import math
from rest_framework import status
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
from django.db.models import Count, Sum, Q, F, CharField
from django.db.models.functions import Cast, Lower
from datetime import date, timedelta
from .utils_sms_notifications import send_order_status_sms
from payments.services import ( PaymentAlreadyCompletedError, PaymentGatewayError, expire_pending_checkout_sessions )
from django.utils import timezone
from store.delivery_schedule import validate_delivery_schedule
from .models import OrderDeliveryChangeRequest
from .serializers import OrderDeliveryChangeRequestSerializer

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
    
@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def admin_review_delivery_change_request(
    request,
    order_id,
    request_id,
):

    action = request.data.get("status")
    admin_note = str(
        request.data.get("admin_note") or ""
    ).strip()

    if action not in ["approved", "rejected"]:
        return Response(
            {
                "error": (
                    "Invalid review action. "
                    "Choose approved or rejected."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if action == "rejected" and not admin_note:
        return Response(
            {
                "error": (
                    "Please provide a reason when rejecting "
                    "a delivery change request."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():

        try:
            order = Order.objects.select_for_update().get(
                id=order_id
            )

        except Order.DoesNotExist:
            return Response(
                {"error": "Order not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            change_request = (
                OrderDeliveryChangeRequest.objects
                .select_for_update()
                .get(
                    id=request_id,
                    order=order,
                )
            )

        except OrderDeliveryChangeRequest.DoesNotExist:
            return Response(
                {
                    "error": (
                        "Delivery change request not found."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        if change_request.status != "pending":
            return Response(
                {
                    "error": (
                        "This delivery change request has "
                        "already been reviewed."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if action == "approved":

            if order.status not in [
                "pending_review",
                "awaiting_customer_response",
                "awaiting_downpayment",
                "processing",
                "ready_for_delivery",
            ]:
                return Response(
                    {
                        "error": (
                            "This order can no longer receive "
                            "delivery changes."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            requested = change_request.requested_details

            schedule_error = validate_delivery_schedule(
                requested.get("delivery_date"),
                requested.get("delivery_time"),
                exclude_order_id=order.id,
            )

            if schedule_error:
                return Response(
                    {
                        "error": (
                            "This requested delivery slot is no "
                            "longer available. The customer must "
                            "submit another request."
                        ),
                        "details": schedule_error,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            fields_to_update = [
                "full_name",
                "phone",
                "street",
                "region",
                "region_code",
                "province",
                "province_code",
                "city",
                "city_code",
                "barangay",
                "barangay_code",
                "postal_code",
                "delivery_date",
                "delivery_time",
            ]

            from datetime import date, datetime

            for field in fields_to_update:

                value = requested.get(field)

                if field == "delivery_date":
                    value = date.fromisoformat(value)

                elif field == "delivery_time":
                    value = datetime.strptime(
                        value,
                        "%H:%M",
                    ).time()

                setattr(order, field, value)

            order.save(
                update_fields=fields_to_update
            )

        change_request.status = action
        change_request.admin_note = admin_note
        change_request.reviewed_by = request.user
        change_request.reviewed_at = timezone.now()

        change_request.save(
            update_fields=[
                "status",
                "admin_note",
                "reviewed_by",
                "reviewed_at",
                "updated_at",
            ]
        )

    order.refresh_from_db()

    return Response(
        {
            "message": (
                "Delivery change request "
                f"{action} successfully."
            ),
            "request": OrderDeliveryChangeRequestSerializer(
                change_request
            ).data,
            "order": OrderSerializer(order).data,
        },
        status=status.HTTP_200_OK,
    )

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
    
    status_filter = request.GET.get("status", "all")

    # Filter orders by status first.
    all_upcoming_qs = Order.objects.all()

    if status_filter == "completed":
        all_upcoming_qs = all_upcoming_qs.filter(
            status__in=["delivered", "completed"]
        )
    else:
        all_upcoming_qs = all_upcoming_qs.exclude(
            status__in=["delivered", "completed", "cancelled", "rejected"]
        )

        if status_filter == "overdue":
            all_upcoming_qs = all_upcoming_qs.filter(
                delivery_date__lt=today
            )
        elif status_filter != "all":
            all_upcoming_qs = all_upcoming_qs.filter(
                status=status_filter
            )

    # Search all matching orders BEFORE pagination.
    search_query = request.GET.get("search", "").strip()

    if search_query:
        all_upcoming_qs = all_upcoming_qs.annotate(
            _order_id_text=Cast("id", output_field=CharField()),
            _customization_text=Cast(
                "items__customization",
                output_field=CharField(),
            ),
        ).filter(
            Q(full_name__icontains=search_query)
            | Q(_order_id_text__icontains=search_query)
            | Q(status__icontains=search_query)
            | Q(items__product__name__icontains=search_query)
            | Q(_customization_text__icontains=search_query)
        ).distinct()

    # Sort all matching orders BEFORE pagination.
    sort_by = request.GET.get("sort", "date_asc")

    if sort_by == "date_desc":
        all_upcoming_qs = all_upcoming_qs.order_by(
            F("delivery_date").desc(nulls_last=True),
            F("delivery_time").desc(nulls_last=True),
            "-id",
        )
    elif sort_by == "name_asc":
        all_upcoming_qs = all_upcoming_qs.order_by(
            Lower("full_name"),
            "id",
        )
    elif sort_by == "id_desc":
        all_upcoming_qs = all_upcoming_qs.order_by("-id")
    else:
        # Default: earliest delivery first.
        all_upcoming_qs = all_upcoming_qs.order_by(
            F("delivery_date").asc(nulls_last=True),
            F("delivery_time").asc(nulls_last=True),
            "id",
        )

    # Paginate after filtering, searching, and sorting.
    try:
        page = max(1, int(request.GET.get("page", 1)))
        page_size = max(
            1,
            min(100, int(request.GET.get("per_page", 9))),
        )
    except (TypeError, ValueError):
        return Response(
            {"detail": "Invalid pagination parameters."},
            status=400,
        )

    total_count = all_upcoming_qs.count()
    total_pages = max(1, math.ceil(total_count / page_size))

    page = min(page, total_pages)

    start = (page - 1) * page_size
    end = start + page_size

    all_upcoming_orders = OrderSerializer(
        all_upcoming_qs[start:end],
        many=True,
    ).data

    # Keep the separate Upcoming Deliveries list unchanged.
    upcoming_orders = OrderSerializer(
        upcoming_orders_qs,
        many=True,
    ).data

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

    first_of_this_month = today.replace(day=1)
    first_of_last_month = (first_of_this_month - timedelta(days=1)).replace(day=1)

    start_of_this_week = today - timedelta(days=today.weekday())
    start_of_last_week = start_of_this_week - timedelta(days=7)

    total_this_month = orders.filter(created_at__date__gte=first_of_this_month).count()
    total_last_month = orders.filter(
        created_at__date__gte=first_of_last_month,
        created_at__date__lt=first_of_this_month,
    ).count()

    pending_this_week = orders.filter(
        status="pending_review",
        created_at__date__gte=start_of_this_week,
    ).count()
    pending_last_week = orders.filter(
        status="pending_review",
        created_at__date__gte=start_of_last_week,
        created_at__date__lt=start_of_this_week,
    ).count()

    awaiting_this_week = orders.filter(
        status="awaiting_downpayment",
        created_at__date__gte=start_of_this_week,
    ).count()
    awaiting_last_week = orders.filter(
        status="awaiting_downpayment",
        created_at__date__gte=start_of_last_week,
        created_at__date__lt=start_of_this_week,
    ).count()

    completed_this_month = orders.filter(
        status="delivered",
        created_at__date__gte=first_of_this_month,
    ).count()
    completed_last_month = orders.filter(
        status="delivered",
        created_at__date__gte=first_of_last_month,
        created_at__date__lt=first_of_this_month,
    ).count()

    revenue_this_month = orders.filter(
        payment_status="paid",
        created_at__date__gte=first_of_this_month,
    ).aggregate(total=Sum("total_amount"))["total"] or 0
    revenue_last_month = orders.filter(
        payment_status="paid",
        created_at__date__gte=first_of_last_month,
        created_at__date__lt=first_of_this_month,
    ).aggregate(total=Sum("total_amount"))["total"] or 0

    total_pct, total_change = calc_trend(total_this_month, total_last_month)
    pending_pct, pending_change = calc_trend(pending_this_week, pending_last_week)
    awaiting_pct, awaiting_change = calc_trend(awaiting_this_week, awaiting_last_week)
    completed_pct, completed_change = calc_trend(completed_this_month, completed_last_month)
    revenue_pct, revenue_change = calc_trend(float(revenue_this_month), float(revenue_last_month))

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