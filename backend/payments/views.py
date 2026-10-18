# payments/views.py
import hashlib
import hmac
import json
import logging
import time
import uuid
import requests

from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Payment
from store.models import Order
from .services import ( PaymentAlreadyCompletedError, PaymentGatewayError, expire_pending_checkout_sessions, )

logger = logging.getLogger(__name__)

CENT = Decimal("0.01")
WEBHOOK_TIMESTAMP_TOLERANCE = 300  # 5 minutes

def parse_money(value, field_name, *, allow_zero=False):
    try:
        money = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(
            f"{field_name} must be a valid amount."
        )

    if not money.is_finite():
        raise ValueError(
            f"{field_name} must be a valid amount."
        )

    if allow_zero:
        if money < 0:
            raise ValueError(
                f"{field_name} cannot be negative."
            )
    else:
        if money <= 0:
            raise ValueError(
                f"{field_name} must be greater than zero."
            )

    rounded = money.quantize(CENT)

    if money != rounded:
        raise ValueError(
            f"{field_name} can only have up to 2 decimal places."
        )

    return rounded


def get_total_paid(order):
    result = order.payments.filter(
        status__in=["partial", "paid"]
    ).aggregate(
        total=Sum("amount")
    )

    return result["total"] or Decimal("0.00")


def get_frontend_url():
    return getattr(
        settings,
        "FRONTEND_BASE_URL",
        "http://localhost:5173"
    ).rstrip("/")


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_checkout_session(request, order_id):
    try:
        amount = parse_money(
            request.data.get("amount"),
            "Amount"
        )

        tip = parse_money(
            request.data.get("tip", 0),
            "Tip",
            allow_zero=True
        )

    except ValueError as exc:
        return Response(
            {"error": str(exc)},
            status=400
        )

    try:
        with transaction.atomic():
            order = (
                Order.objects
                .select_for_update()
                .get(
                    id=order_id,
                    user=request.user
                )
            )

            # Payments should only be accepted:
            # - before first payment
            # - while completing the remaining balance
            if order.status not in {
                "awaiting_downpayment",
                "processing",
                "ready_for_delivery",
                "out_for_delivery",
            }:
                return Response(
                    {
                        "error":
                            "This order is not currently eligible for payment."
                    },
                    status=400
                )

            if order.payment_status == "paid":
                return Response(
                    {
                        "error":
                            "This order has already been fully paid."
                    },
                    status=400
                )

            total_amount = Decimal(
                str(order.total_amount)
            ).quantize(CENT)

            total_paid = get_total_paid(order)

            remaining_balance = (
                total_amount - total_paid
            ).quantize(CENT)

            if remaining_balance <= 0:
                return Response(
                    {
                        "error":
                            "This order has no remaining balance."
                    },
                    status=400
                )

            if amount > remaining_balance:
                return Response(
                    {
                        "error":
                            "Amount exceeds the remaining balance."
                    },
                    status=400
                )

            if total_paid == 0:
                minimum_amount = (
                    total_amount * Decimal("0.50")
                ).quantize(CENT)

                if amount < minimum_amount:
                    return Response(
                        {
                            "error":
                                f"Minimum first payment is "
                                f"₱{minimum_amount:,.2f}."
                        },
                        status=400
                    )

            pending_payment = (
                order.payments
                .select_for_update()
                .filter(status="pending")
                .order_by("-created_at")
                .first()
            )

            if pending_payment:
                same_request = (
                    pending_payment.amount == amount
                    and pending_payment.tip == tip
                )

                if not same_request:
                    return Response(
                        {
                            "needs_checkout_choice": True,
                            "message":
                                "An unfinished payment checkout already exists.",
                            "checkout_url":
                                pending_payment.checkout_url,
                            "existing_checkout": {
                                "amount":
                                    str(pending_payment.amount),
                                "tip":
                                    str(pending_payment.tip),
                            },
                        },
                        status=200
                    )

                payment = pending_payment

                if payment.checkout_url:
                    return Response({
                        "checkout_url":
                            payment.checkout_url,
                        "reused": True,
                    })

                if not payment.idempotency_key:
                    payment.idempotency_key = (
                        uuid.uuid4().hex
                    )
                    payment.save(
                        update_fields=[
                            "idempotency_key"
                        ]
                    )

            else:
                payment = Payment.objects.create(
                    order=order,
                    user=request.user,
                    amount=amount,
                    tip=tip,
                    status="pending",
                    idempotency_key=uuid.uuid4().hex,
                )

        frontend_url = get_frontend_url()

        line_items = [
            {
                "name": f"Order #{order.id} Payment",
                "amount": int(amount * 100),
                "currency": "PHP",
                "quantity": 1,
            }
        ]

        if tip > 0:
            line_items.append({
                "name": "Tip",
                "amount": int(tip * 100),
                "currency": "PHP",
                "quantity": 1,
            })

        payload = {
            "data": {
                "attributes": {
                    "billing": {
                        "email": request.user.email,
                        "name": order.full_name,
                    },

                    "line_items": line_items,

                    "payment_method_types": [
                        "gcash"
                    ],

                    "success_url":
                        f"{frontend_url}/orders/{order.id}"
                        "?checkout=returned",

                    "cancel_url":
                        f"{frontend_url}/orders/{order.id}"
                        "?checkout=cancelled",

                    "reference_number":
                        f"ORDER-{order.id}-PAYMENT-{payment.id}",

                    "metadata": {
                        "order_id": str(order.id),
                        "payment_id": str(payment.id),
                    },

                    "send_email_receipt": True,
                }
            }
        }

        headers = {
            "Content-Type": "application/json",

            # If the same request needs to be retried after a
            # network timeout, PayMongo can identify it.
            "Idempotency-Key":
                payment.idempotency_key,
        }

        try:
            response = requests.post(
                "https://api.paymongo.com/v1/checkout_sessions",
                json=payload,
                headers=headers,
                auth=(
                    settings.PAYMONGO_SECRET_KEY,
                    ""
                ),
                timeout=15,
            )

        except requests.RequestException:
            # DO NOT mark this failed.
            #
            # The request may have reached PayMongo even if our
            # server did not receive the response.
            #
            # Because we keep the same Payment + idempotency key,
            # the customer can safely retry.
            logger.exception(
                "PayMongo checkout request failed for "
                "payment %s",
                payment.id,
            )

            return Response(
                {
                    "error":
                        "Payment provider is temporarily unavailable. "
                        "Please try again."
                },
                status=502
            )

        if response.status_code >= 500:
            logger.error(
                "PayMongo server error for payment %s: %s",
                payment.id,
                response.text,
            )

            # Keep pending for safe retry with the same
            # idempotency key.
            return Response(
                {
                    "error":
                        "Payment provider is temporarily unavailable. "
                        "Please try again."
                },
                status=502
            )
            
        if response.status_code == 409:
            logger.warning(
                "PayMongo checkout creation is already "
                "in progress for payment %s.",
                payment.id,
            )

            return Response(
                {
                    "error":
                        "Your payment checkout is already being created. "
                        "Please try again in a moment."
                },
                status=409
            )

        if not response.ok:
            logger.warning(
                "PayMongo rejected checkout for payment %s: %s",
                payment.id,
                response.text,
            )

            Payment.objects.filter(
                id=payment.id,
                status="pending"
            ).update(
                status="failed"
            )

            return Response(
                {
                    "error":
                        "Unable to create the payment checkout."
                },
                status=400
            )

        try:
            data = response.json()

            checkout = data["data"]

            checkout_id = checkout["id"]

            checkout_url = (
                checkout["attributes"]["checkout_url"]
            )

        except (
            KeyError,
            TypeError,
            ValueError,
        ):
            logger.exception(
                "Unexpected PayMongo checkout response "
                "for payment %s",
                payment.id,
            )

            # Keep it pending. Same idempotency key may safely
            # be retried.
            return Response(
                {
                    "error":
                        "Unexpected response from payment provider."
                },
                status=502
            )

        Payment.objects.filter(
            id=payment.id
        ).update(
            transaction_id=checkout_id,
            checkout_url=checkout_url,
        )

        return Response({
            "checkout_url": checkout_url,
            "reused": False,
        })

    except Order.DoesNotExist:
        return Response(
            {"error": "Order not found"},
            status=404
        )


def verify_paymongo_signature(
    raw_payload,
    signature_header,
):
    if not signature_header:
        return False

    parts = {}

    for part in signature_header.split(","):
        key, separator, value = (
            part.strip().partition("=")
        )

        if separator:
            parts[key] = value

    timestamp = parts.get("t")

    if not timestamp:
        return False

    try:
        timestamp_int = int(timestamp)
    except (TypeError, ValueError):
        return False

    # Helps reject replayed old webhook requests.
    if abs(
        int(time.time()) - timestamp_int
    ) > WEBHOOK_TIMESTAMP_TOLERANCE:
        return False

    is_live = settings.PAYMONGO_SECRET_KEY.startswith(
        "sk_live_"
    )

    signature_key = (
        "li"
        if is_live
        else "te"
    )

    received_signature = parts.get(
        signature_key
    )

    if not received_signature:
        return False

    signed_payload = (
        timestamp.encode("utf-8")
        + b"."
        + raw_payload
    )

    expected_signature = hmac.new(
        settings.PAYMONGO_WEBHOOK_SECRET.encode(
            "utf-8"
        ),
        signed_payload,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(
        received_signature,
        expected_signature,
    )


def extract_checkout_event(body):
    """
    Supports the legacy/current PayMongo webhook
    envelope styles used by Checkout Sessions.
    """

    event_data = body.get("data", {})

    # Legacy/event-resource envelope:
    #
    # data.attributes.type
    # data.attributes.data
    attributes = event_data.get(
        "attributes",
        {}
    )

    if attributes.get("type"):
        return (
            event_data.get("id"),
            attributes.get("type"),
            attributes.get("data") or {},
        )

    # Current Hosted Checkout documentation:
    #
    # data.type
    # data.data
    if event_data.get("type"):
        return (
            event_data.get("id"),
            event_data.get("type"),
            event_data.get("data") or {},
        )

    return None, None, {}

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancel_pending_checkout(request, order_id):
    try:
        order = Order.objects.get(
            id=order_id,
            user=request.user,
        )

    except Order.DoesNotExist:
        return Response(
            {"error": "Order not found"},
            status=404,
        )

    pending_exists = order.payments.filter(
        status="pending"
    ).exists()

    if not pending_exists:
        return Response({
            "message": "No unfinished checkout found."
        })

    try:
        expire_pending_checkout_sessions(order)

    except PaymentAlreadyCompletedError:
        return Response(
            {
                "error":
                    "This checkout has already been paid. "
                    "Please refresh the order."
            },
            status=409,
        )

    except PaymentGatewayError:
        return Response(
            {
                "error":
                    "Unable to safely close the unfinished checkout. "
                    "Please try again."
            },
            status=503,
        )

    return Response({
        "message": "Unfinished checkout expired successfully."
    })

@csrf_exempt
def paymongo_webhook(request):
    if request.method != "POST":
        return JsonResponse(
            {"message": "Method not allowed"},
            status=405
        )

    raw_payload = request.body

    signature_header = request.headers.get(
        "Paymongo-Signature",
        ""
    )

    if not verify_paymongo_signature(
        raw_payload,
        signature_header,
    ):
        logger.warning(
            "Rejected PayMongo webhook with "
            "invalid signature."
        )

        return JsonResponse(
            {"error": "Invalid signature"},
            status=401
        )

    try:
        body = json.loads(
            raw_payload.decode("utf-8")
        )
    except (
        json.JSONDecodeError,
        UnicodeDecodeError,
    ):
        return JsonResponse(
            {"error": "Invalid JSON"},
            status=400
        )

    (
        event_id,
        event_type,
        checkout_session,
    ) = extract_checkout_event(body)

    if event_type != "checkout_session.payment.paid":
        return JsonResponse(
            {"message": "Ignored"},
            status=200
        )

    checkout_id = checkout_session.get("id")

    attributes = checkout_session.get(
        "attributes",
        {}
    )

    metadata = attributes.get(
        "metadata",
        {}
    ) or {}

    if not checkout_id:
        logger.error(
            "Paid checkout webhook had no "
            "Checkout Session ID."
        )

        return JsonResponse(
            {"message": "Ignored"},
            status=200
        )

    try:
        with transaction.atomic():

            payment = (
                Payment.objects
                .select_for_update()
                .select_related("order")
                .filter(
                    transaction_id=checkout_id
                )
                .first()
            )

            # Recovery path in case a webhook arrives before
            # transaction_id was persisted.
            if not payment:
                payment_id = metadata.get(
                    "payment_id"
                )

                if payment_id:
                    payment = (
                        Payment.objects
                        .select_for_update()
                        .select_related("order")
                        .filter(
                            id=payment_id
                        )
                        .first()
                    )

                    if (
                        payment
                        and not payment.transaction_id
                    ):
                        payment.transaction_id = (
                            checkout_id
                        )

            if not payment:
                logger.error(
                    "No local Payment matched PayMongo "
                    "checkout %s",
                    checkout_id,
                )

                # Valid signed webhook, but it doesn't belong
                # to a payment this application knows about.
                return JsonResponse(
                    {"message": "Unmatched checkout ignored"},
                    status=200
                )

            # CRITICAL IDEMPOTENCY FIX:
            #
            # Both "partial" and "paid" mean this particular
            # Payment has already been processed successfully.
            if payment.status in {
                "partial",
                "paid",
            }:
                return JsonResponse(
                    {
                        "message":
                            "Payment already processed"
                    },
                    status=200
                )

            order = (
                Order.objects
                .select_for_update()
                .get(id=payment.order_id)
            )
            
            if (
                payment.status == "expired"
                or order.status in {
                    "cancelled",
                    "rejected",
                }
            ):
                logger.critical(
                    "Received a paid PayMongo webhook for an "
                    "expired or cancelled payment. "
                    "Payment=%s Order=%s PaymentStatus=%s "
                    "OrderStatus=%s Checkout=%s",
                    payment.id,
                    order.id,
                    payment.status,
                    order.status,
                    checkout_id,
                )

                return JsonResponse(
                    {
                        "message":
                            "Payment requires manual reconciliation"
                    },
                    status=200
                )

            expected_reference = (
                f"ORDER-{order.id}-PAYMENT-{payment.id}"
            )

            reference_number = attributes.get(
                "reference_number"
            )

            if (
                reference_number
                and reference_number != expected_reference
            ):
                logger.critical(
                    "PayMongo reference mismatch. "
                    "Payment=%s Expected=%s Received=%s",
                    payment.id,
                    expected_reference,
                    reference_number,
                )

                return JsonResponse(
                    {
                        "message":
                            "Reference mismatch logged"
                    },
                    status=200
                )

            # Validate actual PayMongo payment amount when
            # included in the webhook payload.
            remote_payments = attributes.get(
                "payments",
                []
            ) or []

            remote_payment = next(
                (
                    item
                    for item in remote_payments
                    if (
                        item.get(
                            "attributes",
                            {}
                        ).get("status")
                        == "paid"
                    )
                ),
                None,
            )

            if remote_payment:
                remote_attributes = (
                    remote_payment.get(
                        "attributes",
                        {}
                    )
                )

                received_centavos = (
                    remote_attributes.get("amount")
                )

                expected_centavos = int(
                    (
                        payment.amount
                        + payment.tip
                    ) * 100
                )

                if (
                    received_centavos is not None
                    and received_centavos
                    != expected_centavos
                ):
                    logger.critical(
                        "PayMongo amount mismatch. "
                        "Payment=%s Expected=%s Received=%s",
                        payment.id,
                        expected_centavos,
                        received_centavos,
                    )

                    # Money may already have moved.
                    # Do not credit an unexpected amount
                    # automatically.
                    return JsonResponse(
                        {
                            "message":
                                "Amount mismatch logged"
                        },
                        status=200
                    )

                payment.paymongo_payment_id = (
                    remote_payment.get("id")
                )

            previous_paid = get_total_paid(
                order
            )

            total_paid = (
                previous_paid
                + payment.amount
            ).quantize(CENT)

            total_amount = Decimal(
                str(order.total_amount)
            ).quantize(CENT)

            if total_paid < total_amount:
                payment.status = "partial"
                order.payment_status = "partial"
            else:
                payment.status = "paid"
                order.payment_status = "paid"

            payment.processed_at = timezone.now()

            payment.save(
                update_fields=[
                    "transaction_id",
                    "paymongo_payment_id",
                    "status",
                    "processed_at",
                    "updated_at",
                ]
            )

            # Only first successful payment moves the order
            # into processing.
            #
            # A delayed checkout should never resurrect a
            # cancelled/rejected/delivered order.
            if order.status == "awaiting_downpayment":
                order.status = "processing"

                order.save(
                    update_fields=[
                        "payment_status",
                        "status",
                    ]
                )

            else:
                order.save(
                    update_fields=[
                        "payment_status",
                    ]
                )

            if total_paid > total_amount:
                logger.critical(
                    "Order %s received an overpayment. "
                    "Paid=%s Total=%s",
                    order.id,
                    total_paid,
                    total_amount,
                )

        logger.info(
            "PayMongo payment processed. "
            "Payment=%s Order=%s Event=%s",
            payment.id,
            payment.order_id,
            event_id,
        )

        return JsonResponse(
            {"message": "Success"},
            status=200
        )

    except Exception:
        logger.exception(
            "Unexpected PayMongo webhook error."
        )

        return JsonResponse(
            {"error": "Webhook processing failed"},
            status=500
        )