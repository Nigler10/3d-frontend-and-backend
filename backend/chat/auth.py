# chat/auth.py
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken

@database_sync_to_async
def get_user(token):

    from django.contrib.auth.models import User

    try:
        access_token = AccessToken(token)

        user = User.objects.get(
            id=access_token["user_id"]
        )

        return user

    except Exception:
        return AnonymousUser()

class JWTAuthMiddleware:

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):

        query_string = parse_qs(
            scope["query_string"].decode()
        )

        token = query_string.get("token")

        if token:
            scope["user"] = await get_user(token[0])
        elif "user" not in scope:
            scope["user"] = AnonymousUser()

        return await self.app(
            scope,
            receive,
            send,
        )