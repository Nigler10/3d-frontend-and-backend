# store/serializers.py
from django.contrib.auth.models import User
from django.core.validators import RegexValidator
from django.db.models import Avg
from rest_framework import serializers

from .models import ( AddonPricing, CakeCustomization, Cart, CartItem, Category, CustomCakePricing, Product, UserProfile, UploadedCakeRequest, )

phone_validator = RegexValidator(
    regex=r'^09\d{9}$',
    message="Phone number must be 11 digits and start with 09"
)

class CustomCakePricingSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomCakePricing
        fields = ['id', 'shape', 'tier', 'size', 'flavor', 'price']
        read_only_fields = ['id']

class AddonPricingSerializer(serializers.ModelSerializer):
    class Meta:
        model = AddonPricing
        fields = ['id', 'key', 'name', 'price']
        read_only_fields = ['id']

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = '__all__'

class ProductSerializer(serializers.ModelSerializer):
    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all()
    )

    category_name = serializers.CharField(
        source="category.name",
        read_only=True
    )

    average_rating = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "category",
            "category_name",
            "name",
            "description",
            "price",
            "image",
            "average_rating",
            "review_count",
            "created_at",
            "updated_at",
        ]

    def get_average_rating(self, obj):
        value = obj.reviews.aggregate(
            average=Avg("rating")
        )["average"]

        return round(value or 0, 1)

    def get_review_count(self, obj):
        return obj.reviews.count()

class CakeCustomizationSerializer(serializers.ModelSerializer):
    price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = CakeCustomization
        fields = ['id', 'shape', 'cake_color', 'icing_color', 'flavor', 'tier', 'size',
                  'tier_flavors', 'inscription_text', 'text_font', 'inscription_color', 'topping_layout',
                  'candle_number', 'has_candle', 'has_chocolate', 'has_balls', 'has_nuts', 'has_cherry', 'has_sprinkles', 'price', 'created_at']
        read_only_fields = ['id', 'price', 'created_at']

class CartItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True, default=None)
    product_price = serializers.DecimalField(source='product.price', max_digits=10, decimal_places=2, read_only=True, default=None)
    product_image = serializers.ImageField(source='product.image', read_only=True, default=None)
    customization_detail = serializers.SerializerMethodField()
    item_name = serializers.SerializerMethodField()
    item_unit_price = serializers.SerializerMethodField()
    is_custom_cake = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = ['id', 'cart', 'product', 'customization', 'quantity',
                  'created_at',
                  'product_name', 'product_price', 'product_image',
                  'customization_detail', 'item_name', 'item_unit_price', 'is_custom_cake']
        
    def get_item_name(self, obj):
        if obj.product:
            return obj.product.name
        elif obj.customization:
            shape = obj.customization.get("shape", "")
            flavor = obj.customization.get("flavor", "")
            return f"Custom {shape} {flavor} Cake"
        return "Unknown Item"

    def get_item_unit_price(self, obj):
        if obj.product:
            return str(obj.product.price)
        elif obj.customization:
            return str(obj.customization.get("price", "0.00"))
        return "0.00"

    def get_is_custom_cake(self, obj):
        return obj.customization is not None

    def get_customization_detail(self, obj):
        return obj.customization

class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    total = serializers.ReadOnlyField()

    class Meta:
        model = Cart
        fields = '__all__'

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name']

class RegisterSerializer(serializers.ModelSerializer):
    phone = serializers.CharField(validators=[phone_validator])
    password2 = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ["username", "email", "first_name", "last_name", "password", "password2", "phone"]

    def validate(self, data):
        if data["password"] != data["password2"]:
            raise serializers.ValidationError("Passwords don't match")
        return data

    def create(self, validated_data):
        phone = validated_data.pop("phone")
        validated_data.pop("password2")

        user = User.objects.create_user(**validated_data)

        UserProfile.objects.create(
            user=user,
            phone=phone
        )

        return user

class UserProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = UserProfile
        fields = [
            "user", "middle_name", "phone",
            "street", "region", "region_code",
            "province", "province_code",
            "city", "city_code",
            "barangay", "barangay_code",
            "postal_code", "profile_picture",
        ]
class AdminCakeCustomizationSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    customer_username = serializers.SerializerMethodField()

    class Meta:
        model = CakeCustomization
        fields = [
            'id', 'customer_name', 'customer_username', 'shape', 'cake_color', 'icing_color',
            'flavor', 'tier', 'size', 'tier_flavors', 'inscription_text', 'text_font', 'inscription_color',
            'topping_layout', 'candle_number', 'has_candle', 'has_chocolate', 'has_balls',
            'has_nuts', 'has_cherry', 'has_sprinkles', 'price', 'created_at',
        ]

    def get_customer_name(self, obj):
        if not obj.user:
            return None

        return f"{obj.user.first_name} {obj.user.last_name}".strip()

    def get_customer_username(self, obj):
        return obj.user.username if obj.user else None

class UploadedCakeRequestSerializer(serializers.ModelSerializer):

    class Meta:
        model = UploadedCakeRequest
        fields = [
            "id",
            "image",
            "notes",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "created_at",
        ]
