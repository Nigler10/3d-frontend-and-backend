# backend/orders/serializers_feedback.py
from rest_framework import serializers
from .models import ProductReview
from store.models import UserProfile

class ProductReviewSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(
        source="user.username",
        read_only=True
    )

    user_full_name = serializers.SerializerMethodField()
    user_profile_picture = serializers.SerializerMethodField()

    product_name = serializers.CharField(
        source="product.name",
        read_only=True
    )

    class Meta:
        model = ProductReview
        fields = [
            "id",
            "order_item",
            "product",
            "product_name",
            "user",
            "user_name",
            "user_full_name",
            "user_profile_picture",
            "rating",
            "comment",
            "created_at",
        ]

        read_only_fields = [
            "id",
            "order_item",
            "product",
            "product_name",
            "user",
            "user_name",
            "user_full_name",
            "user_profile_picture",
            "created_at",
        ]

    def get_user_full_name(self, obj):
        full_name = (
            f"{obj.user.first_name} "
            f"{obj.user.last_name}"
        ).strip()

        return full_name or obj.user.username

    def get_user_profile_picture(self, obj):
        try:
            profile = obj.user.userprofile
        except UserProfile.DoesNotExist:
            return None

        if not profile.profile_picture:
            return None

        return profile.profile_picture.url