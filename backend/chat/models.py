# chat/models.py
from django.db import models
from django.contrib.auth.models import User
from store.models import Order

class Conversation(models.Model):
    order = models.OneToOneField(
        Order,
        on_delete=models.CASCADE,
        related_name="conversation"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Conversation for Order #{self.order.id}"

class Quotation(models.Model):

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("accepted", "Accepted"),
        ("replaced", "Replaced"),
    ]

    order = models.ForeignKey(
        Order,
        related_name="quotations",
        on_delete=models.CASCADE
    )

    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="pending"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Quotation #{self.id} - Order #{self.order.id} - {self.amount}"

class Message(models.Model):

    SENDER_CHOICES = [
        ("customer", "Customer"),
        ("admin", "Admin"),
        ("system", "System"),
    ]

    MESSAGE_TYPE_CHOICES = [
        ("text", "Text"),
        ("system", "System"),
        ("quotation", "Quotation"),
        ("image", "Image"),
        ("file", "File"),
    ]

    conversation = models.ForeignKey(
        Conversation,
        related_name="messages",
        on_delete=models.CASCADE
    )

    sender = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        blank=True,
        null=True
    )

    sender_type = models.CharField(
        max_length=20,
        choices=SENDER_CHOICES
    )

    message_type = models.CharField(
        max_length=20,
        choices=MESSAGE_TYPE_CHOICES,
        default="text"
    )

    content = models.TextField(blank=True)

    attachment = models.FileField(
        upload_to="chat/",
        blank=True,
        null=True
    )

    metadata = models.JSONField(
        default=dict,
        blank=True
    )

    created_at = models.DateTimeField(auto_now_add=True)

    read_by_customer = models.BooleanField(default=False)

    read_by_admin = models.BooleanField(default=False)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.sender_type} ({self.message_type})"
    

class SupportConversation(models.Model):

    STATUS_CHOICES = [
        ("open", "Open"),
        ("resolved", "Resolved"),
    ]

    # One persistent support conversation for each customer.
    customer = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="support_conversation",
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="open",
        db_index=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_message_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-last_message_at"]

    def __str__(self):
        return f"Support conversation with {self.customer.username}"

class SupportMessage(models.Model):

    SENDER_CHOICES = [
        ("customer", "Customer"),
        ("admin", "Admin"),
        ("system", "System"),
    ]

    MESSAGE_TYPE_CHOICES = [
        ("text", "Text"),
        ("image", "Image"),
        ("system", "System"),
    ]

    conversation = models.ForeignKey(
        SupportConversation,
        related_name="messages",
        on_delete=models.CASCADE,
    )

    sender = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )

    sender_type = models.CharField(
        max_length=20,
        choices=SENDER_CHOICES,
    )

    message_type = models.CharField(
        max_length=20,
        choices=MESSAGE_TYPE_CHOICES,
        default="text",
    )

    content = models.TextField(blank=True)

    # FileField allows us to validate the actual uploaded image
    # in the API before accepting it.
    attachment = models.FileField(
        upload_to="support/",
        blank=True,
        null=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    read_by_customer = models.BooleanField(default=False)
    read_by_admin = models.BooleanField(default=False)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(
                fields=["conversation", "created_at"],
                name="support_msg_convo_date_idx",
            ),
        ]

    def __str__(self):
        return f"{self.sender_type} ({self.message_type})"
