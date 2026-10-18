# store/models_verification.py
from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone

from datetime import timedelta
import secrets

OTP_EXPIRY_MINUTES = 5
VERIFICATION_VALID_MINUTES = 10
MAX_OTP_ATTEMPTS = 5

class SMSVerification(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    phone = models.CharField(
        max_length=11
    )

    code = models.CharField(
        max_length=6
    )

    is_verified = models.BooleanField(
        default=False
    )

    failed_attempts = models.PositiveSmallIntegerField(
        default=0
    )

    verified_at = models.DateTimeField(
        null=True,
        blank=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    def generate_code(self):
        self.code = str(
            secrets.randbelow(900000) + 100000
        )

    def is_expired(self):
        return (
            timezone.now()
            >
            self.created_at
            + timedelta(
                minutes=OTP_EXPIRY_MINUTES
            )
        )

    def is_verification_expired(self):
        if not self.verified_at:
            return True

        return (
            timezone.now()
            >
            self.verified_at
            + timedelta(
                minutes=VERIFICATION_VALID_MINUTES
            )
        )

    def __str__(self):
        return f"{self.phone} - {self.created_at}"
    
class PasswordResetOTP(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="password_reset_otps",
    )

    # Store hashes instead of the actual OTP or reset token.
    code_hash = models.CharField(max_length=128)
    reset_token_hash = models.CharField(
        max_length=128,
        blank=True,
        default="",
    )

    failed_attempts = models.PositiveSmallIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    consumed_at = models.DateTimeField(null=True, blank=True)

    def is_expired(self):
        return timezone.now() > (
            self.created_at + timedelta(minutes=OTP_EXPIRY_MINUTES)
        )

    def is_reset_token_expired(self):
        if not self.verified_at:
            return True

        return timezone.now() > (
            self.verified_at
            + timedelta(minutes=VERIFICATION_VALID_MINUTES)
        )

    def __str__(self):
        return f"Password reset for {self.user.username}"