# backend/chat/diagnostics.py
import os

from django.http import JsonResponse
from django.views.decorators.http import require_GET
from django.contrib.admin.views.decorators import staff_member_required

@require_GET
@staff_member_required
def redis_health(request):
    redis_url = os.getenv("REDIS_URL")

    if not redis_url:
        return JsonResponse(
            {
                "ok": False,
                "error": "REDIS_URL is not configured",
            },
            status=503,
        )

    try:
        from redis import Redis

        client = Redis.from_url(
            redis_url,
            socket_connect_timeout=3,
            socket_timeout=3,
        )

        try:
            client.ping()
        finally:
            client.close()

        return JsonResponse({
            "ok": True,
            "redis": "connected",
        })

    except Exception:
        return JsonResponse(
            {
                "ok": False,
                "error": "Redis connection failed; inspect server logs.",
            },
            status=503,
        )