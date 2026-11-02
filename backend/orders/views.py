# orders/views.py
import re, uuid
from django.db import transaction
from django.utils import timezone
from chat.models import Conversation
from chat.services import ChatService
from .serializers import QuotationSerializer
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from store.models import Order, Product
from .models import ProductReview
from .serializers import OrderSerializer
from .serializers_feedback import ProductReviewSerializer
from orders.utils_sms_notifications import send_order_status_sms
from payments.services import ( PaymentAlreadyCompletedError, PaymentGatewayError, expire_pending_checkout_sessions )
from datetime import datetime
from django.db import IntegrityError
from django.utils import timezone
from store.address_utils import resolve_address
from store.delivery_schedule import validate_delivery_schedule
from .models import ( ProductReview, OrderDeliveryChangeRequest )
from .serializers import ( OrderDeliveryChangeRequestSerializer )

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def order_history(request):
    orders = Order.objects.filter(user=request.user).order_by('-created_at')
    serializer = OrderSerializer(orders, many=True)
    return Response(serializer.data)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def order_detail(request, order_id):
    try:
        order = Order.objects.get(id=order_id, user=request.user)
        serializer = OrderSerializer(order)
        return Response(serializer.data)
    except Order.DoesNotExist:
        return Response({'error': 'Order not found'}, status=404)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def customer_orders(request):
    user = request.user
    orders = Order.objects.filter(user=request.user).order_by('-created_at')
    serializer = OrderSerializer(orders, many=True)
    return Response(serializer.data)

DELIVERY_CHANGE_ALLOWED_STATUSES = [
    "pending_review",
    "awaiting_customer_response",
    "awaiting_downpayment",
    "processing",
    "ready_for_delivery",
]

DELIVERY_ADDRESS_FIELDS = [
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
]


def get_order_delivery_details(order):

    details = {
        "full_name": order.full_name or "",
        "phone": order.phone or "",
    }

    for field in DELIVERY_ADDRESS_FIELDS:
        details[field] = getattr(order, field) or ""

    details["delivery_date"] = (
        order.delivery_date.isoformat()
        if order.delivery_date
        else ""
    )

    details["delivery_time"] = (
        order.delivery_time.strftime("%H:%M")
        if order.delivery_time
        else ""
    )

    return details

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_delivery_change_request(request, order_id):
    try:
        with transaction.atomic():

            try:
                order = Order.objects.select_for_update().get(
                    id=order_id,
                    user=request.user,
                )

            except Order.DoesNotExist:
                return Response(
                    {"error": "Order not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            if order.status not in DELIVERY_CHANGE_ALLOWED_STATUSES:
                return Response(
                    {
                        "error": (
                            "Delivery details can no longer be changed "
                            "for this order."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            existing_request = (
                OrderDeliveryChangeRequest.objects.filter(
                    order=order,
                    status="pending",
                ).first()
            )

            if existing_request:
                return Response(
                    {
                        "error": (
                            "You already have a pending delivery "
                            "change request for this order."
                        ),
                        "request": (
                            OrderDeliveryChangeRequestSerializer(
                                existing_request
                            ).data
                        ),
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            data = request.data

            full_name = str(
                data.get("full_name", order.full_name or "")
            ).strip()

            phone = str(
                data.get("phone", order.phone or "")
            ).strip()

            if not full_name:
                return Response(
                    {"error": "Recipient name is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not re.fullmatch(r"09\d{9}", phone):
                return Response(
                    {
                        "error": (
                            "Phone number must contain 11 digits "
                            "and start with 09."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Validate the address using the same resolver as checkout.
            try:
                profile = request.user.userprofile

                address = resolve_address(
                    data=data,
                    profile=profile,
                )

            except Exception as exc:
                return Response(
                    {
                        "error": (
                            "Unable to validate your delivery address."
                        ),
                        "details": str(exc),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            required_address_fields = [
                "street",
                "region_code",
                "city_code",
                "barangay_code",
            ]

            for field in required_address_fields:
                if not str(address.get(field) or "").strip():
                    return Response(
                        {
                            "error": (
                                f"Please provide a valid {field.replace('_', ' ')}."
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            postal_code = str(
                address.get("postal_code") or ""
            ).strip()

            if not re.fullmatch(r"\d{4}", postal_code):
                return Response(
                    {
                        "error": (
                            "Postal code must contain exactly 4 digits."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            delivery_date = data.get("delivery_date")
            delivery_time = data.get("delivery_time")

            schedule_error = validate_delivery_schedule(
                delivery_date,
                delivery_time,
                exclude_order_id=order.id,
            )

            if schedule_error:
                return Response(
                    {"error": schedule_error},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            requested_time = datetime.strptime(
                str(delivery_time),
                "%H:%M",
            ).strftime("%H:%M")

            requested_details = {
                "full_name": full_name,
                "phone": phone,
            }

            for field in DELIVERY_ADDRESS_FIELDS:
                requested_details[field] = (
                    address.get(field) or ""
                )

            requested_details["delivery_date"] = str(
                delivery_date
            )

            requested_details["delivery_time"] = requested_time

            original_details = get_order_delivery_details(order)

            if requested_details == original_details:
                return Response(
                    {
                        "error": (
                            "You haven't made any changes to your "
                            "delivery information."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            change_request = OrderDeliveryChangeRequest.objects.create(
                order=order,
                requested_by=request.user,
                original_details=original_details,
                requested_details=requested_details,
            )

        return Response(
            {
                "message": (
                    "Delivery change request submitted successfully. "
                    "Please wait for the bakery's approval."
                ),
                "request": OrderDeliveryChangeRequestSerializer(
                    change_request
                ).data,
            },
            status=status.HTTP_201_CREATED,
        )

    except IntegrityError:
        return Response(
            {
                "error": (
                    "A pending delivery change request already exists "
                    "for this order."
                )
            },
            status=status.HTTP_409_CONFLICT,
        )
        
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def customer_order_detail(request, order_id):
    try:
        order = Order.objects.get(id=order_id)

    except Order.DoesNotExist:
        return Response(
            {
                "error": "Order does not exist",
                "order_id": order_id,
            },
            status=status.HTTP_404_NOT_FOUND
        )

    if order.user_id != request.user.id:
        return Response(
            {
                "error": "You do not have access to this order",
                "order_id": order_id,
            },
            status=status.HTTP_403_FORBIDDEN
        )

    serializer = OrderSerializer(order)

    return Response(serializer.data)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def accept_quotation(request, order_id):

    try:
        order = Order.objects.get(
            id=order_id,
            user=request.user
        )

    except Order.DoesNotExist:
        return Response(
            {"error": "Order not found"},
            status=404
        )

    if not order.is_uploaded_cake:
        return Response(
            {"error": "Quotation acceptance is only available for uploaded cake orders."},
            status=400
        )

    if order.status != "awaiting_customer_response":
        return Response(
            {"error": "This order is not waiting for quotation acceptance."},
            status=400
        )

    quotation = order.quotations.filter(
        status="pending"
    ).order_by("-created_at").first()

    if not quotation:
        return Response(
            {"error": "No active quotation found for this order."},
            status=400
        )

    with transaction.atomic():

        quotation.status = "accepted"
        quotation.accepted_at = timezone.now()
        quotation.save(
            update_fields=[
                "status",
                "accepted_at",
            ]
        )

        order.quotations.filter(
            status="pending"
        ).exclude(
            id=quotation.id
        ).update(
            status="replaced"
        )

        order.quoted_price = quotation.amount
        order.total_amount = quotation.amount
        order.status = "awaiting_downpayment"

        order_item = order.items.filter(
            customization__uploaded_cake=True
        ).first()

        if order_item:
            order_item.price = quotation.amount
            order_item.save(
                update_fields=["price"]
            )

        order.save(
            update_fields=[
                "quoted_price",
                "total_amount",
                "status",
            ]
        )

        conversation, _ = Conversation.objects.get_or_create(
            order=order
        )

        system_message = ChatService.create_system_message(
            conversation=conversation,
            content=f"Quotation accepted · ₱{quotation.amount:,.2f}",
            metadata={
                "event": "quotation_accepted",
                "quotation_id": quotation.id,
                "order_id": order.id,
                "amount": str(quotation.amount),
                "status": "accepted",
            },
            read_by_customer=True,
            read_by_admin=False,
        )

        transaction.on_commit(
            lambda msg=system_message:
            ChatService.broadcast_message(msg)
        )

    return Response({
        "message": "Quotation accepted successfully.",
        "quotation": QuotationSerializer(quotation).data,
        "order": OrderSerializer(order).data,
    })

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancel_order(request, order_id):
    try:
        order = Order.objects.get(
            id=order_id,
            user=request.user
        )

    except Order.DoesNotExist:
        return Response(
            {"error": "Order not found"},
            status=404
        )

    total_paid = sum(
        payment.amount
        for payment in order.payments.filter(
            status__in=["partial", "paid"]
        )
    )

    can_cancel = (
        order.status == "pending_review"
        or order.status == "awaiting_customer_response"
        or (
            order.status == "awaiting_downpayment"
            and total_paid == 0
        )
    )

    if not can_cancel:
        return Response(
            {
                "error":
                    "This order can no longer be cancelled."
            },
            status=400
        )

    try:
        expire_pending_checkout_sessions(order)

    except PaymentAlreadyCompletedError:
        # Very important race-condition protection:
        #
        # PayMongo says this checkout already contains a paid
        # transaction even if our webhook hasn't reached us yet.
        return Response(
            {
                "error":
                    "A payment was already completed for this order. "
                    "Please refresh the order before cancelling."
            },
            status=409
        )

    except PaymentGatewayError:
        # Do not cancel locally if we cannot guarantee that the
        # existing PayMongo checkout has been closed.
        return Response(
            {
                "error":
                    "We could not safely close the active payment "
                    "checkout. Please try again."
            },
            status=503
        )

    order.status = "cancelled"
    order.payment_status = "cancelled"

    order.save(
        update_fields=[
            "status",
            "payment_status",
        ]
    )

    send_order_status_sms(order)

    return Response({
        "message": "Order cancelled successfully"
    })

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def product_review(request, order_id, item_id):

    try:
        order = Order.objects.get(
            id=order_id,
            user=request.user
        )

    except Order.DoesNotExist:
        return Response(
            {"error": "Order not found"},
            status=404
        )

    try:
        item = order.items.select_related("product").get(
            id=item_id
        )

    except order.items.model.DoesNotExist:
        return Response(
            {"error": "Order item not found"},
            status=404
        )

    if item.product is None:
        return Response(
            {"error": "This item is not a standard product."},
            status=400
        )

    existing_review = ProductReview.objects.filter(
        order_item=item
    ).first()

    if request.method == "GET":

        if not existing_review:
            return Response({
                "review": None
            })

        return Response({
            "review": ProductReviewSerializer(existing_review).data
        })

    if order.status != "delivered":
        return Response(
            {"error": "You can only review products from delivered orders."},
            status=400
        )

    if existing_review:
        return Response(
            {"error": "You already reviewed this product for this order."},
            status=400
        )

    serializer = ProductReviewSerializer(
        data=request.data
    )

    if serializer.is_valid():

        review = serializer.save(
            order_item=item,
            product=item.product,
            user=request.user
        )

        return Response({
            "message": "Product review submitted successfully.",
            "review": ProductReviewSerializer(review).data
        }, status=201)

    return Response(
        serializer.errors,
        status=400
    )

@api_view(["GET"])
@permission_classes([AllowAny])
def product_reviews(request, product_id):

    try:
        product = Product.objects.get(
            id=product_id
        )

    except Product.DoesNotExist:
        return Response(
            {"error": "Product not found"},
            status=404
        )

    reviews = ProductReview.objects.filter(
        product=product
    ).select_related(
        "user"
    ).order_by("-created_at")

    serializer = ProductReviewSerializer(
        reviews,
        many=True
    )

    average_rating = 0

    if reviews.exists():
        average_rating = round(
            sum(review.rating for review in reviews) / reviews.count(),
            1
        )

    return Response({
        "average_rating": average_rating,
        "review_count": reviews.count(),
        "reviews": serializer.data,
    })