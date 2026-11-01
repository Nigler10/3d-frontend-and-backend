# chat/serializers.py
from rest_framework import serializers
from .models import ( Conversation, Message, SupportConversation, SupportMessage )
from store.models import UserProfile

class MessageSerializer(serializers.ModelSerializer):

    sender_name = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ["id", "conversation", "sender", "sender_name", "sender_type", "message_type", "content", "attachment", "metadata", "created_at", "read_by_customer", "read_by_admin"]
        read_only_fields = ("conversation", "sender", "sender_type", "created_at", "read_by_customer", "read_by_admin")

    def get_sender_name(self, obj):
        if obj.sender:
            return obj.sender.username
        return "System"

class ConversationSerializer(serializers.ModelSerializer):

    messages = MessageSerializer(
        many=True,
        read_only=True
    )

    class Meta:
        model = Conversation
        fields = ["id", "order", "created_at", "messages"]
        
class SendMessageSerializer(serializers.ModelSerializer):

    class Meta:
        model = Message
        fields = ["content", "attachment"]

class SupportMessageSerializer(serializers.ModelSerializer):

    sender_name = serializers.SerializerMethodField()
    attachment = serializers.SerializerMethodField()

    class Meta:
        model = SupportMessage
        fields = [
            "id",
            "sender",
            "sender_name",
            "sender_type",
            "message_type",
            "content",
            "attachment",
            "created_at",
            "read_by_customer",
            "read_by_admin",
        ]
        read_only_fields = fields

    def get_sender_name(self, obj):
        if obj.sender:
            return obj.sender.username
        return "System"

    def get_attachment(self, obj):
        if not obj.attachment:
            return None

        try:
            url = obj.attachment.url
            request = self.context.get("request")

            if request:
                return request.build_absolute_uri(url)

            return url

        except Exception:
            return None

class SupportConversationDetailSerializer(serializers.ModelSerializer):

    customer_id = serializers.IntegerField(
        source="customer.id",
        read_only=True,
    )

    customer_username = serializers.CharField(
        source="customer.username",
        read_only=True,
    )

    customer_name = serializers.SerializerMethodField()

    customer_email = serializers.EmailField(
        source="customer.email",
        read_only=True,
    )

    messages = SupportMessageSerializer(
        many=True,
        read_only=True,
    )

    class Meta:
        model = SupportConversation
        fields = [
            "id",
            "customer_id",
            "customer_username",
            "customer_name",
            "customer_email",
            "status",
            "created_at",
            "updated_at",
            "last_message_at",
            "messages",
        ]

    def get_customer_name(self, obj):
        full_name = (
            f"{obj.customer.first_name} "
            f"{obj.customer.last_name}"
        ).strip()

        return full_name or obj.customer.username

class SupportInboxSerializer(serializers.ModelSerializer):

    customer_id = serializers.IntegerField(
        source="customer.id",
        read_only=True,
    )
    customer_username = serializers.CharField(
        source="customer.username",
        read_only=True,
    )
    customer_name = serializers.SerializerMethodField()
    customer_profile_picture = serializers.SerializerMethodField()
    customer_email = serializers.EmailField(
        source="customer.email",
        read_only=True,
    )
    last_message_content = serializers.CharField(
        read_only=True,
        allow_null=True,
    )
    last_message_type = serializers.CharField(
        read_only=True,
        allow_null=True,
    )
    last_message_sender_type = serializers.CharField(
        read_only=True,
        allow_null=True,
    )
    unread_count = serializers.IntegerField(
        read_only=True,
    )

    class Meta:
        model = SupportConversation
        fields = [
            "id",
            "customer_id",
            "customer_username",
            "customer_name",
            "customer_email",
            "customer_profile_picture",
            "status",
            "created_at",
            "updated_at",
            "last_message_at",
            "last_message_content",
            "last_message_type",
            "last_message_sender_type",
            "unread_count",
        ]

    def get_customer_name(self, obj):
        full_name = (
            f"{obj.customer.first_name} "
            f"{obj.customer.last_name}"
        ).strip()

        return full_name or obj.customer.username
    
    def get_customer_profile_picture(self, obj):
        try:
            profile = obj.customer.userprofile

            if profile.profile_picture and profile.profile_picture.name:
                return profile.profile_picture.url

        except (UserProfile.DoesNotExist, ValueError, OSError):
            return None

        return None

class SendSupportMessageSerializer(serializers.Serializer):

    content = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=2000,
        trim_whitespace=True,
    )

    attachment = serializers.ImageField(
        required=False,
        allow_null=True,
    )

    def validate(self, attrs):
        content = (attrs.get("content") or "").strip()
        attachment = attrs.get("attachment")

        if not content and not attachment:
            raise serializers.ValidationError(
                "Enter a message or attach an image."
            )

        if attachment and attachment.size > 5 * 1024 * 1024:
            raise serializers.ValidationError({
                "attachment": "Image size cannot exceed 5 MB."
            })

        attrs["content"] = content

        return attrs

class SupportConversationStatusSerializer(serializers.Serializer):

    status = serializers.ChoiceField(
        choices=SupportConversation.STATUS_CHOICES,
    )
