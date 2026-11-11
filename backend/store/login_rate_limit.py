from datetime import timedelta
from math import ceil

from django.db import transaction
from django.utils import timezone
from django.utils.crypto import salted_hmac
from rest_framework.exceptions import AuthenticationFailed

from .models import LoginAttempt


LOGIN_LOCK_THRESHOLD = 6
LOGIN_LOCK_DURATION = timedelta(minutes=15)


class LoginRejected(Exception):
    def __init__(self, *, attempts_remaining=0, retry_after=0):
        self.attempts_remaining = attempts_remaining
        self.retry_after = retry_after


def identifier_hash(username):
    return salted_hmac('store.login_attempt', username, algorithm='sha256').hexdigest()


def remaining_lock_seconds(locked_until):
    if locked_until is None:
        return 0
    return max(0, ceil((locked_until - timezone.now()).total_seconds()))


def get_login_retry_after(username):
    locked_until = LoginAttempt.objects.filter(
        pk=identifier_hash(username),
    ).values_list('locked_until', flat=True).first()
    return remaining_lock_seconds(locked_until)


def authenticate_with_rate_limit(username, validate_credentials):
    # Serialize credential checks and updates for the same username across workers.
    with transaction.atomic():
        attempt, _ = LoginAttempt.objects.select_for_update().get_or_create(
            pk=identifier_hash(username),
        )
        retry_after = remaining_lock_seconds(attempt.locked_until)
        if retry_after:
            raise LoginRejected(retry_after=retry_after)

        try:
            tokens = validate_credentials()
        except AuthenticationFailed:
            attempt.failed_attempts = 1 if attempt.locked_until is not None else attempt.failed_attempts + 1
            attempt.locked_until = None
            attempts_remaining = LOGIN_LOCK_THRESHOLD - attempt.failed_attempts
            if attempts_remaining == 0:
                attempt.locked_until = timezone.now() + LOGIN_LOCK_DURATION
                retry_after = remaining_lock_seconds(attempt.locked_until)
            attempt.save(update_fields=['failed_attempts', 'locked_until'])
        else:
            if attempt.failed_attempts or attempt.locked_until is not None:
                attempt.failed_attempts = 0
                attempt.locked_until = None
                attempt.save(update_fields=['failed_attempts', 'locked_until'])
            return tokens

    # Raise after the transaction commits so rejected logins still count.
    raise LoginRejected(attempts_remaining=attempts_remaining, retry_after=retry_after)
