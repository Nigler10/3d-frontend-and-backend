# store/views_verification.py
import math
import re
import secrets

from django.db import transaction
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models_verification import ( SMSVerification, MAX_OTP_ATTEMPTS )
from utils.sms import send_sms

from django.contrib.auth.models import User
from django.contrib.auth.hashers import make_password, check_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError

from .models import UserProfile
from .models_verification import PasswordResetOTP

RESEND_COOLDOWN_SECONDS = 60
OTP_EXPIRY_SECONDS = 300

PHONE_PATTERN = re.compile(
    r"^09\d{9}$"
)

def validate_phone(phone):
    if not phone:
        return None

    phone = str(phone).strip()

    if not PHONE_PATTERN.fullmatch(phone):
        return None

    return phone


@api_view(["POST"])
@permission_classes([AllowAny])
def send_verification_code(request):
    phone = validate_phone(
        request.data.get("phone")
    )

    if not phone:
        return Response(
            {
                "error":
                    "Enter a valid Philippine mobile number "
                    "using 09XXXXXXXXX."
            },
            status=400,
        )

    latest = (
        SMSVerification.objects
        .filter(
            phone=phone,
            is_verified=False,
        )
        .order_by("-created_at")
        .first()
    )

    if latest:
        seconds_since_sent = (
            timezone.now()
            - latest.created_at
        ).total_seconds()

        if (
            seconds_since_sent
            < RESEND_COOLDOWN_SECONDS
        ):
            retry_after = math.ceil(
                RESEND_COOLDOWN_SECONDS
                - seconds_since_sent
            )

            return Response(
                {
                    "error":
                        f"Please wait {retry_after} "
                        f"second(s) before requesting "
                        f"another OTP.",

                    "retry_after":
                        retry_after,
                },
                status=429,
            )

    verification = SMSVerification(
        phone=phone
    )

    verification.generate_code()
    verification.save()

    sms_response = send_sms(
        phone,
        (
            "Smiley Page Corner verification code: "
            f"{verification.code}. "
            "This code expires in 5 minutes."
        ),
    )

    if (
        not sms_response
        or
        sms_response.get("success")
        is not True
    ):
        verification.delete()

        return Response(
            {
                "error":
                    (
                        sms_response.get(
                            "error"
                        )
                        if sms_response
                        else
                        "SMS service unavailable."
                    )
            },
            status=503,
        )

    SMSVerification.objects.filter(
        phone=phone
    ).exclude(
        id=verification.id
    ).delete()

    return Response(
        {
            "message":
                "Verification code sent.",

            "expires_in":
                OTP_EXPIRY_SECONDS,

            "resend_after":
                RESEND_COOLDOWN_SECONDS,
        }
    )

@api_view(["POST"])
@permission_classes([AllowAny])
def verify_code(request):
    phone = validate_phone(
        request.data.get("phone")
    )

    code = str(
        request.data.get("code", "")
    ).strip()

    if not phone:
        return Response(
            {
                "error":
                    "Enter a valid Philippine mobile number."
            },
            status=400,
        )

    if (
        not code.isdigit()
        or len(code) != 6
    ):
        return Response(
            {
                "error":
                    "OTP must contain exactly 6 digits."
            },
            status=400,
        )

    with transaction.atomic():
        verification = (
            SMSVerification.objects
            .select_for_update()
            .filter(
                phone=phone,
                is_verified=False,
            )
            .order_by("-created_at")
            .first()
        )

        if not verification:
            return Response(
                {
                    "error":
                        "No active OTP was found. "
                        "Please request a new code."
                },
                status=400,
            )

        if verification.is_expired():
            verification.delete()

            return Response(
                {
                    "error":
                        "OTP expired. "
                        "Please request a new code."
                },
                status=400,
            )

        if (
            verification.failed_attempts
            >= MAX_OTP_ATTEMPTS
        ):
            return Response(
                {
                    "error":
                        "Too many incorrect attempts. "
                        "Please request a new OTP."
                },
                status=429,
            )

        if not secrets.compare_digest(
            verification.code,
            code,
        ):
            verification.failed_attempts += 1

            verification.save(
                update_fields=[
                    "failed_attempts",
                ]
            )

            attempts_remaining = max(
                MAX_OTP_ATTEMPTS
                - verification.failed_attempts,
                0,
            )

            if attempts_remaining == 0:
                return Response(
                    {
                        "error":
                            "Too many incorrect attempts. "
                            "Please request a new OTP."
                    },
                    status=429,
                )

            return Response(
                {
                    "error":
                        "Invalid OTP.",

                    "attempts_remaining":
                        attempts_remaining,
                },
                status=400,
            )

        verification.is_verified = True
        verification.verified_at = (
            timezone.now()
        )

        verification.save(
            update_fields=[
                "is_verified",
                "verified_at",
            ]
        )

        SMSVerification.objects.filter(
            phone=phone
        ).exclude(
            id=verification.id
        ).delete()

    return Response(
        {
            "message":
                "Phone verified."
        }
    )
    
@api_view(["POST"])
@permission_classes([AllowAny])
def request_password_reset(request):
    username = str(request.data.get("username", "")).strip()

    # Use the same response regardless of whether the account exists.
    generic_response = {
        "message": (
            "If an account with that username has a registered "
            "mobile number, a recovery code will be sent."
        ),
        "resend_after": RESEND_COOLDOWN_SECONDS,
    }

    if not username:
        return Response(generic_response, status=200)

    user = User.objects.filter(username=username).first()

    if not user:
        return Response(generic_response, status=200)

    profile = UserProfile.objects.filter(user=user).first()

    if not profile:
        return Response(generic_response, status=200)

    phone = validate_phone(profile.phone)

    if not phone:
        return Response(generic_response, status=200)

    latest = PasswordResetOTP.objects.filter(
        user=user
    ).order_by("-created_at").first()

    if latest:
        seconds_since_sent = (
            timezone.now() - latest.created_at
        ).total_seconds()

        if seconds_since_sent < RESEND_COOLDOWN_SECONDS:
            return Response(generic_response, status=200)

    code = str(secrets.randbelow(900000) + 100000)

    verification = PasswordResetOTP.objects.create(
        user=user,
        code_hash=make_password(code),
    )

    try:
        sms_response = send_sms(
            phone,
            (
                "Smiley Page Corner password reset code: "
                f"{code}. This code expires in 5 minutes. "
                "Do not share this code with anyone."
            ),
        )
    except Exception:
        verification.delete()
        return Response(
            {"error": "SMS service is temporarily unavailable."},
            status=503,
        )

    if not sms_response or sms_response.get("success") is not True:
        verification.delete()

        return Response(
            {"error": "SMS service is temporarily unavailable."},
            status=503,
        )

    return Response(generic_response, status=200)

@api_view(["POST"])
@permission_classes([AllowAny])
def verify_password_reset_otp(request):
    username = str(request.data.get("username", "")).strip()
    code = str(request.data.get("code", "")).strip()

    if not username or not code.isdigit() or len(code) != 6:
        return Response(
            {"error": "Enter your username and the six-digit code."},
            status=400,
        )

    user = User.objects.filter(username=username).first()

    if not user:
        return Response(
            {"error": "Invalid or expired recovery code."},
            status=400,
        )

    with transaction.atomic():
        verification = (
            PasswordResetOTP.objects
            .select_for_update()
            .filter(
                user=user,
                verified_at__isnull=True,
                consumed_at__isnull=True,
            )
            .order_by("-created_at")
            .first()
        )

        if not verification or verification.is_expired():
            return Response(
                {"error": "Invalid or expired recovery code. Request a new one."},
                status=400,
            )

        if verification.failed_attempts >= MAX_OTP_ATTEMPTS:
            return Response(
                {"error": "Too many attempts. Request a new code."},
                status=429,
            )

        if not check_password(code, verification.code_hash):
            verification.failed_attempts += 1
            verification.save(update_fields=["failed_attempts"])

            if verification.failed_attempts >= MAX_OTP_ATTEMPTS:
                return Response(
                    {"error": "Too many attempts. Request a new code."},
                    status=429,
                )

            return Response(
                {"error": "Incorrect recovery code."},
                status=400,
            )

        reset_token = secrets.token_urlsafe(32)

        verification.verified_at = timezone.now()
        verification.reset_token_hash = make_password(reset_token)
        verification.save(
            update_fields=["verified_at", "reset_token_hash"]
        )

    return Response({
        "message": "Code verified.",
        "reset_token": reset_token,
    })
    
@api_view(["POST"])
@permission_classes([AllowAny])
def confirm_password_reset(request):
    username = str(request.data.get("username", "")).strip()
    reset_token = str(request.data.get("reset_token", ""))
    new_password = request.data.get("new_password", "")
    confirm_password = request.data.get("confirm_password", "")

    if not all([username, reset_token, new_password, confirm_password]):
        return Response(
            {"error": "Please complete all fields."},
            status=400,
        )

    if new_password != confirm_password:
        return Response(
            {"confirm_password": ["The passwords do not match."]},
            status=400,
        )

    user = User.objects.filter(username=username).first()

    if not user:
        return Response(
            {"error": "The password reset session is invalid or expired."},
            status=400,
        )

    with transaction.atomic():
        verification = (
            PasswordResetOTP.objects
            .select_for_update()
            .filter(
                user=user,
                verified_at__isnull=False,
                consumed_at__isnull=True,
            )
            .order_by("-verified_at")
            .first()
        )

        if (
            not verification
            or verification.is_reset_token_expired()
            or not verification.reset_token_hash
            or not check_password(
                reset_token,
                verification.reset_token_hash,
            )
        ):
            return Response(
                {"error": "The password reset session is invalid or expired. Start again."},
                status=400,
            )

        try:
            validate_password(new_password, user=user)
        except ValidationError as exc:
            return Response(
                {"new_password": exc.messages},
                status=400,
            )

        user.set_password(new_password)
        user.save(update_fields=["password"])

        verification.consumed_at = timezone.now()
        verification.reset_token_hash = ""
        verification.save(
            update_fields=["consumed_at", "reset_token_hash"]
        )

    return Response({
        "message": "Password reset successfully. You can now log in."
    })