# store/token_serializers.py
from functools import partial

from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .login_rate_limit import authenticate_with_rate_limit


class LoginStatusSerializer(serializers.Serializer):
    username = serializers.CharField()


class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        return authenticate_with_rate_limit(
            attrs[self.username_field],
            partial(super().validate, attrs),
        )

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        # Add custom claims
        token['is_staff'] = user.is_staff
        token['username'] = user.username
        token['email'] = user.email

        return token