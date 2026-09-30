# store/models.py (DO NOT DELETE THIS. LABELING PURPOSE)
from django.db import models
from django.contrib.auth.models import User
from django.core.validators import RegexValidator
from decimal import Decimal

phone_validator = RegexValidator(
    regex=r'^09\d{9}$',
    message="Phone number must be 11 digits and start with 09"
)

# CATEGORY
class Category(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True)

    def __str__(self):
        return self.name

# PRODUCT
class Product(models.Model):
    category = models.ForeignKey(Category, related_name='products', on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    description = models.TextField()
    price = models.DecimalField(max_digits=10, decimal_places=2)
    image = models.ImageField(upload_to='products/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

class CustomCakePricing(models.Model):
    SHAPE_CHOICES = [
        ("round", "Round"),
        ("rectangle", "Rectangle"),
    ]

    FLAVOR_CHOICES = [
        ("Choco Moist", "Choco Moist"),
        ("Vanilla Chiffon", "Vanilla Chiffon"),
        ("Ube Chiffon", "Ube Chiffon"),
    ]

    shape = models.CharField(max_length=20, choices=SHAPE_CHOICES, default="round")
    tier = models.CharField(max_length=50)
    size = models.CharField(max_length=100)
    flavor = models.CharField(max_length=50, choices=FLAVOR_CHOICES)
    price = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["shape", "tier", "size", "flavor"],
                name="unique_custom_cake_pricing",
            )
        ]
        ordering = ["shape", "tier", "size", "flavor"]

    def __str__(self):
        return f"{self.shape.capitalize()} - {self.tier} - {self.size} - {self.flavor}: {self.price}"

class AddonPricing(models.Model):
    key = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    price = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name}: {self.price}"

DEFAULT_CUSTOM_CAKE_PRICES = {
    "round": {
        "1 Tier Cake": {
            "sizes": ["Bento Cake", "Tall Bento Cake", "Standard", "Tall Cake"],
            "prices": {
                "Choco Moist": Decimal("1000.00"),
                "Vanilla Chiffon": Decimal("900.00"),
                "Ube Chiffon": Decimal("900.00"),
            },
        },
        "Mini 2 Tier": {
            "sizes": ["6x4 & 4x4", "6x6 Cake", "6x8 Cake", "8x5 Cake"],
            "prices": {
                "Choco Moist": Decimal("1800.00"),
                "Vanilla Chiffon": Decimal("1600.00"),
                "Ube Chiffon": Decimal("1600.00"),
            },
        },
        "3 Tier Cake": {
            "sizes": ["4x5, 6x6 & 8x5"],
            "prices": {
                "Choco Moist": Decimal("2800.00"),
                "Vanilla Chiffon": Decimal("2500.00"),
                "Ube Chiffon": Decimal("2500.00"),
            },
        },
        "4 Tier Cake": {
            "sizes": ["4x4 & 6x6, 8x5 & 10x4"],
            "prices": {
                "Choco Moist": Decimal("3800.00"),
                "Vanilla Chiffon": Decimal("3400.00"),
                "Ube Chiffon": Decimal("3400.00"),
            },
        },
    },
    "rectangle": {
        "1 Tier Cake": {
            "sizes": ["Bento Cake", "Tall Bento Cake", "Standard", "Tall Cake"],
            "prices": {
                "Choco Moist": Decimal("1150.00"),
                "Vanilla Chiffon": Decimal("1050.00"),
                "Ube Chiffon": Decimal("1050.00"),
            },
        },
        "Mini 2 Tier": {
            "sizes": ["6x4 & 4x4", "6x6 Cake", "6x8 Cake", "8x5 Cake"],
            "prices": {
                "Choco Moist": Decimal("2000.00"),
                "Vanilla Chiffon": Decimal("1800.00"),
                "Ube Chiffon": Decimal("1800.00"),
            },
        },
        "3 Tier Cake": {
            "sizes": ["4x5, 6x6 & 8x5"],
            "prices": {
                "Choco Moist": Decimal("3100.00"),
                "Vanilla Chiffon": Decimal("2800.00"),
                "Ube Chiffon": Decimal("2800.00"),
            },
        },
        "4 Tier Cake": {
            "sizes": ["4x4 & 6x6, 8x5 & 10x4"],
            "prices": {
                "Choco Moist": Decimal("4200.00"),
                "Vanilla Chiffon": Decimal("3800.00"),
                "Ube Chiffon": Decimal("3800.00"),
            },
        },
    }
}

DEFAULT_ADDON_PRICES = {
    "candle_single": Decimal("50.00"),
    "candle_number": Decimal("100.00"),
    "chocolate_small": Decimal("150.00"),
    "chocolate_medium": Decimal("200.00"),
    "chocolate_large": Decimal("250.00"),
    "balls_small": Decimal("75.00"),
    "balls_medium": Decimal("100.00"),
    "balls_large": Decimal("150.00"),
    "cherry_small": Decimal("40.00"),
    "cherry_medium": Decimal("50.00"),
    "cherry_large": Decimal("75.00"),
    "nuts": Decimal("75.00"),
    "sprinkles": Decimal("50.00"),
}

def get_default_custom_cake_price(*, shape="round", tier, size, flavor):
    shape_config = DEFAULT_CUSTOM_CAKE_PRICES.get(shape, DEFAULT_CUSTOM_CAKE_PRICES["round"])
    tier_config = shape_config.get(tier)
    if not tier_config or size not in tier_config["sizes"]:
        raise CustomCakePricing.DoesNotExist

    try:
        return tier_config["prices"][flavor]
    except KeyError:
        raise CustomCakePricing.DoesNotExist

def calculate_custom_cake_price(*, shape="round", tier, size, flavor, has_candle=False, candle_mode="gold",
                                has_chocolate=False, chocolate_size="medium",
                                has_balls=False, balls_size="medium",
                                has_nuts=False,
                                has_cherry=False, cherry_size="medium", cherry_count=1,
                                has_sprinkles=False):
    try:
        base_price = CustomCakePricing.objects.get(
            shape=shape,
            tier=tier,
            size=size,
            flavor=flavor,
        ).price
    except CustomCakePricing.DoesNotExist:
        base_price = get_default_custom_cake_price(
            shape=shape,
            tier=tier,
            size=size,
            flavor=flavor,
        )

    selected_addons = []
    if has_candle:
        selected_addons.append("candle_number" if candle_mode == "number" else "candle_single")
    if has_chocolate:
        selected_addons.append(f"chocolate_{chocolate_size}")
    if has_balls:
        selected_addons.append(f"balls_{balls_size}")
    if has_nuts:
        selected_addons.append("nuts")
    if has_cherry:
        selected_addons.append(f"cherry_{cherry_size}")
    if has_sprinkles:
        selected_addons.append("sprinkles")

    configured_addon_prices = dict(
        AddonPricing.objects
        .filter(key__in=selected_addons)
        .values_list("key", "price")
    )
    addon_total = sum(
        configured_addon_prices.get(key, DEFAULT_ADDON_PRICES.get(key, Decimal("0.00")))
        * (max(1, int(cherry_count)) if "cherry" in key else 1)
        for key in selected_addons
    )

    return base_price + addon_total

# USER
class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    middle_name = models.CharField(max_length=30, blank=True, null=True)
    phone = models.CharField(max_length=11, validators=[phone_validator], blank=True, null=True)

    # Address
    street = models.CharField(max_length=150, blank=True, null=True)
    region = models.CharField(max_length=100, blank=True, null=True)
    region_code = models.CharField(max_length=10, blank=True, null=True)
    province = models.CharField(max_length=50, blank=True, null=True)
    province_code = models.CharField(max_length=10, blank=True, null=True)
    city = models.CharField(max_length=50, blank=True, null=True)
    city_code = models.CharField(max_length=10, blank=True, null=True)
    barangay = models.CharField(max_length=100, blank=True, null=True)
    barangay_code = models.CharField(max_length=10, blank=True, null=True)
    postal_code = models.CharField(max_length=10, blank=True, null=True)

    profile_picture = models.ImageField(upload_to="profile_pics/", blank=True, null=True)
    dob = models.DateField(blank=True, null=True)
    newsletter_subscribed = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.user} Profile"
    
# ORDER
class Order(models.Model):

    STATUS_CHOICES = [
        ("pending_review", "Pending Review"),
        ("awaiting_customer_response", "Awaiting Customer Response"),
        ("awaiting_downpayment", "Awaiting Downpayment"),
        ("processing", "Processing"),
        ("ready_for_delivery", "Ready for Delivery"),
        ("out_for_delivery", "Out for Delivery"),
        ("delivered", "Delivered"),
        ("cancelled", "Cancelled"),
        ("rejected", "Rejected"),
    ]

    PAYMENT_STATUS_CHOICES = [
        ("pending", "Pending"),
        ("partial", "Partial"),
        ("paid", "Paid"),
        ("cancelled", "Cancelled"),
        ("failed", "Failed"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    full_name = models.CharField(max_length=150, blank=True, null=True)
    phone = models.CharField(max_length=11, validators=[phone_validator], blank=True, null=True)

    # Delivery address snapshot
    street = models.CharField(max_length=200, blank=True, null=True)
    region = models.CharField(max_length=100, blank=True, null=True)
    region_code = models.CharField(max_length=10, blank=True, null=True)
    province = models.CharField(max_length=100, blank=True, null=True)
    province_code = models.CharField(max_length=10, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    city_code = models.CharField(max_length=10, blank=True, null=True)
    barangay = models.CharField(max_length=100, blank=True, null=True)
    barangay_code = models.CharField(max_length=10, blank=True, null=True)
    postal_code = models.CharField(max_length=20, blank=True, null=True)

    delivery_date = models.DateField(blank=True, null=True)
    delivery_time = models.TimeField(blank=True, null=True)
    order_notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="pending_review")
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default="pending")
    rejection_reason = models.TextField(blank=True, null=True)
    is_uploaded_cake = models.BooleanField(default=False)
    quoted_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    def __str__(self):
        return f"Order {self.id} - {self.user}"
    
class OrderItem(models.Model):
    order = models.ForeignKey(Order, related_name='items', on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, null=True, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    customization = models.JSONField(blank=True, null=True)  # placeholder for 3D cake customization

    def __str__(self):
        if self.product:
            return f"{self.quantity} x {self.product.name}"
        elif self.customization:
            return f"{self.quantity} x Custom Cake"
        return f"OrderItem {self.id}" 
    
    @property
    def subtotal(self):
        return self.quantity * self.price
    
# CART
class Cart(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"Cart {self.id} for {self.user}"
    
    @property
    def total(self):
        return sum(item.subtotal for item in self.items.all())
    
class CartItem(models.Model):
    cart = models.ForeignKey(Cart, related_name='items', on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, null=True, blank=True)
    customization = models.JSONField(blank=True, null=True)
    quantity = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
    
    def __str__(self):
        if self.product:
            return f"{self.quantity} x {self.product.name}"
        elif self.customization:
            shape = self.customization.get("shape", "")
            flavor = self.customization.get("flavor", "")
            return f"{self.quantity} x Custom {shape} {flavor} Cake"
        return f"CartItem {self.id}"
    
    @property
    def item_price(self):
        if self.product:
            return self.product.price
        elif self.customization:
            return Decimal(str(self.customization.get("price", "0.00")))
        return Decimal("0.00")
    
    @property
    def subtotal(self):
        return self.quantity * self.item_price
    
# CAKE CUSTOMIZATION
class CakeCustomization(models.Model):
    SHAPE_CHOICES = [
        ("round", "Round"),
        ("rectangle", "Rectangle"),
    ]

    FLAVOR_CHOICES = [
        ("Choco Moist", "Choco Moist"),
        ("Vanilla Chiffon", "Vanilla Chiffon"),
        ("Ube Chiffon", "Ube Chiffon"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    shape = models.CharField(max_length=20, choices=SHAPE_CHOICES, default="round")
    cake_color = models.CharField(max_length=20, default="#683434")
    flavor = models.CharField(max_length=50, choices=FLAVOR_CHOICES, default="Choco Moist")
    tier = models.CharField(max_length=50, blank=True, null=True)
    size = models.CharField(max_length=100, blank=True, null=True)
    tier_flavors = models.JSONField(blank=True, default=dict)
    inscription_text = models.CharField(max_length=80, blank=True, default="")
    inscription_size = models.CharField(max_length=50, blank=True, default="")  # ← ADD THIS
    inscription_font = models.CharField(max_length=50, blank=True, default="")  # ← ADD THIS
    text_font = models.CharField(max_length=50, blank=True, default="")
    inscription_color = models.CharField(max_length=20, blank=True, default="#EF4444")
    topping_layout = models.JSONField(blank=True, default=dict)
    icing_color = models.CharField(max_length=20, default="#FFF7EA")
    candle_number = models.PositiveIntegerField(default=1)
    has_candle = models.BooleanField(default=False)
    has_chocolate = models.BooleanField(default=False)
    has_balls = models.BooleanField(default=False)
    has_nuts = models.BooleanField(default=False)
    has_cherry = models.BooleanField(default=False)
    has_sprinkles = models.BooleanField(default=False)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=500.00)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"CakeCustomization {self.id} - {self.shape} {self.flavor}"
    
    def get_customization_dict(self):
        """Return customization details as a dictionary"""
        return {
            "id": self.id,
            "shape": self.shape,
            "cake_color": self.cake_color,
            "flavor": self.flavor,
            "tier": self.tier,
            "size": self.size,
            "tier_flavors": self.tier_flavors,
            "inscription_text": self.inscription_text,
            "inscription_size": self.inscription_size,  # ← ADD THIS
            "inscription_font": self.inscription_font,  # ← ADD THIS
            "text_font": self.text_font,
            "inscription_color": self.inscription_color,
            "topping_layout": self.topping_layout,
            "icing_color": self.icing_color,
            "candle_number": self.candle_number,
            "has_candle": self.has_candle,
            "has_chocolate": self.has_chocolate,
            "has_balls": self.has_balls,
            "has_nuts": self.has_nuts,
            "has_cherry": self.has_cherry,
            "has_sprinkles": self.has_sprinkles,
            "price": str(self.price),
        }
        
class UploadedCakeRequest(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    image = models.ImageField(upload_to="uploaded_cakes/")
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Uploaded Cake #{self.id}"
        
from .models_verification import SMSVerification
