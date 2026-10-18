# store/views.py
from rest_framework import status
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.views import TokenObtainPairView
from django.conf import settings
from .token_serializers import MyTokenObtainPairSerializer
from django.db import transaction
from django.db.models import Q, Sum
from django.core.files.storage import default_storage
from django.utils import timezone
from .models import (AddonPricing, CakeCustomization, Cart, CartItem, Category, CustomCakePricing, Order, OrderItem, Product, UserProfile, calculate_custom_cake_price, UploadedCakeRequest, DEFAULT_CUSTOM_CAKE_PRICES, DEFAULT_ADDON_PRICES,)
from .serializers import ProductSerializer, CategorySerializer, CartSerializer, CartItemSerializer
from .serializers import (AddonPricingSerializer, CakeCustomizationSerializer, CustomCakePricingSerializer, RegisterSerializer, UserProfileSerializer, UserSerializer, UploadedCakeRequestSerializer,)
from .models_verification import SMSVerification
from .address_utils import resolve_address
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.hashers import check_password
from django.core.exceptions import ValidationError

class MyTokenObtainPairView(TokenObtainPairView):
    serializer_class = MyTokenObtainPairSerializer

def _get_available_delivery_slots(requested_date):
    from datetime import datetime, time as time_type, timedelta
    from collections import Counter

    max_orders_per_slot = 3
    interval = timedelta(minutes=30)
    now = timezone.localtime()
    earliest_delivery = now + timedelta(
        minutes=settings.DELIVERY_BOOKING_BUFFER_MINUTES
    )

    current = datetime.combine(requested_date, time_type(8, 0))
    end = datetime.combine(requested_date, time_type(20, 0))
    slots = []
    while current < end:
        slot_datetime = timezone.make_aware(current, timezone.get_current_timezone())
        if requested_date != now.date() or slot_datetime > earliest_delivery:
            slots.append(current.time())
        current += interval

    booked_orders = (
        Order.objects.filter(delivery_date=requested_date)
        .exclude(status__in=["cancelled", "rejected"])
        .values_list("delivery_time", flat=True)
    )
    slot_counts = Counter(slot for slot in booked_orders if slot is not None)

    return [
        slot.strftime("%H:%M")
        for slot in slots
        if slot_counts.get(slot, 0) < max_orders_per_slot
    ]

def _delivery_schedule_error(date_value, time_value):
    from datetime import date as date_type, datetime

    try:
        requested_date = date_type.fromisoformat(date_value)
        requested_time = datetime.strptime(time_value, "%H:%M").time()
    except (TypeError, ValueError):
        return "Please select a valid delivery date and time."

    if requested_date < timezone.localdate():
        return "Delivery date cannot be in the past."

    if requested_time.strftime("%H:%M") not in _get_available_delivery_slots(
        requested_date
    ):
        return "The selected delivery time is no longer available. Please choose another slot."

    return None
    
# Product
@api_view(['GET'])
def get_products(request):
    products = Product.objects.all()
    serializer = ProductSerializer(products, many=True)
    return Response(serializer.data)

@api_view(['GET'])
def get_best_selling_products(request):
    products = Product.objects.annotate(
        total_sales=Sum(
            'orderitem__quantity',
            filter=Q(orderitem__order__status='delivered'),
            default=0,
        )
    ).order_by('-total_sales', 'id')[:3]
    serializer = ProductSerializer(products, many=True, context={'request': request})
    return Response(serializer.data)

@api_view(['GET'])
def get_product(request, pk):
    try:
        product = Product.objects.get(id=pk)
        serializer = ProductSerializer(product, context = {'request': request})
        return Response(serializer.data)
    except Product.DoesNotExist:
        return Response({'error': 'Product not found'}, status=404)

# Category
@api_view(['GET'])
def get_categories(request):
    categories = Category.objects.all()
    serializer = CategorySerializer(categories, many=True)
    return Response(serializer.data)

@api_view(['GET'])
def get_custom_pricing(request):
    for shape_key, shape_config in DEFAULT_CUSTOM_CAKE_PRICES.items():
        for tier_name, tier_info in shape_config.items():
            for size_name in tier_info["sizes"]:
                for flavor_name, price_val in tier_info["prices"].items():
                    CustomCakePricing.objects.get_or_create(
                        shape=shape_key,
                        tier=tier_name,
                        size=size_name,
                        flavor=flavor_name,
                        defaults={"price": price_val}
                    )

    addon_names = {
        "candle_single": "Candle (Single)",
        "candle_number": "Candle (Number)",
        "chocolate_small": "Chocolate (Small)",
        "chocolate_medium": "Chocolate (Medium)",
        "chocolate_large": "Chocolate (Large)",
        "balls_small": "Balls (Small)",
        "balls_medium": "Balls (Medium)",
        "balls_large": "Balls (Large)",
        "cherry_small": "Cherry (Small)",
        "cherry_medium": "Cherry (Medium)",
        "cherry_large": "Cherry (Large)",
        "nuts": "Nuts",
        "sprinkles": "Sprinkles",
        "candle": "Candle",
        "chocolate": "Chocolate",
        "balls": "Balls",
        "cherry": "Cherry",
    }
    for key, price_val in DEFAULT_ADDON_PRICES.items():
        AddonPricing.objects.get_or_create(
            key=key,
            defaults={"name": addon_names.get(key, key.capitalize()), "price": price_val}
        )

    base_prices = CustomCakePricing.objects.all().order_by('shape', 'tier', 'size', 'flavor')
    addon_prices = AddonPricing.objects.all().order_by('name')

    return Response({
        "base_prices": CustomCakePricingSerializer(base_prices, many=True).data,
        "addon_prices": AddonPricingSerializer(addon_prices, many=True).data,
    })

# Cart
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_cart(request):
    cart, created = Cart.objects.get_or_create(user=request.user)
    serializer = CartSerializer(cart)
    return Response(serializer.data)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_to_cart(request):
    product_id = request.data.get('product_id')
    product = Product.objects.get(id=product_id)
    cart, created = Cart.objects.get_or_create(user=request.user)
    item, created = CartItem.objects.get_or_create(cart=cart, product=product)
    if not created:
        item.quantity += 1
        item.created_at = timezone.now()
        item.save(update_fields=["quantity", "created_at"])
    return Response({'message': 'Product added to cart', "cart":CartSerializer(cart).data})

def build_customization_snapshot(data, price, customization_id=None):
    snapshot = {
        "shape": data.get("shape", "round"),
        "cake_color": data.get("cake_color", "#683434"),
        "icing_color": data.get("icing_color", "#FFF7EA"),
        "flavor": data.get("flavor", "Choco Moist"),
        "tier": data.get("tier"),
        "size": data.get("size"),
        "tier_flavors": data.get("tier_flavors") or {},
        "inscription_text": data.get("inscription_text") or "",
        "text_font": data.get("text_font") or "",
        "inscription_color": data.get("inscription_color") or "#EF4444",
        "topping_layout": data.get("topping_layout") or {},
        "candle_number": int(data.get("candle_number", 1)),
        "candle_mode": data.get("candle_mode") or data.get("topping_layout", {}).get("candle", {}).get("mode", "gold"),
        "candle_color": data.get("candle_color") or data.get("topping_layout", {}).get("candle", {}).get("color", "gold"),
        "has_candle": bool(data.get("has_candle", False)),
        "has_chocolate": bool(data.get("has_chocolate", False)),
        "has_balls": bool(data.get("has_balls", False)),
        "has_nuts": bool(data.get("has_nuts", False)),
        "has_cherry": bool(data.get("has_cherry", False)),
        "has_sprinkles": bool(data.get("has_sprinkles", False)),
        "price": str(price),
    }
    if customization_id is not None:
        snapshot["id"] = customization_id
    return snapshot

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_cart_quantity(request):
    item_id = request.data.get('item_id')
    quantity = request.data.get('quantity')
    
    if not item_id or quantity is None:
        return Response({'error': 'Item ID and quantity are required'}, status=400)
    
    try:
        item = CartItem.objects.get(id=item_id)
        if int(quantity) < 1:
            item.delete()
            return Response({'error': 'Quantity must be at least 1'}, status=400)
        item.quantity = quantity
        item.save()
        serializer = CartItemSerializer(item)
        return Response(serializer.data)
    
    except CartItem.DoesNotExist:
        return Response({'error': 'Cart item not found'}, status=400)
    
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def remove_from_cart(request):
    item_id = request.data.get('item_id')
    CartItem.objects.filter(id=item_id).delete()
    return Response({'message': 'Item removed from cart'})

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def delivery_slots(request):
    """
    Return available 30-minute delivery time slots for a given date.

    Query params:
        date  – ISO date string (YYYY-MM-DD), required.

    Business rules:
        • Operating hours: 08:00 – 20:00 (8 AM to 8 PM), 30-min intervals.
        • Each slot can hold at most MAX_ORDERS_PER_SLOT active orders.
        • Same-day slots must be later than the configured booking buffer.
        • Only today and future dates are accepted.
    """
    from datetime import date as date_type

    date_str = request.GET.get("date")
    if not date_str:
        return Response(
            {"error": "The 'date' query parameter is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        requested_date = date_type.fromisoformat(date_str)
    except ValueError:
        return Response(
            {"error": "Invalid date format. Use YYYY-MM-DD."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    today = timezone.localdate()

    if requested_date < today:
        return Response(
            {"error": "Cannot select a date in the past."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    available = _get_available_delivery_slots(requested_date)

    return Response({
        "date": date_str,
        "slots": available,
        "buffer_minutes": settings.DELIVERY_BOOKING_BUFFER_MINUTES,
        "time_zone": settings.TIME_ZONE,
    })

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_order(request):

    try:
        data = request.data
        profile = request.user.userprofile

        address = resolve_address(
            data=data,
            profile=profile
        )

        full_name = (
            profile.user.first_name
            + " "
            + profile.user.last_name
        ).strip()
        phone = profile.phone
        delivery_date = data.get("delivery_date")
        delivery_time = data.get("delivery_time")
        notes = data.get("notes")

        schedule_error = _delivery_schedule_error(delivery_date, delivery_time)
        if schedule_error:
            return Response({"error": schedule_error}, status=400)

        if (
            not full_name
            or not phone
            or not address["street"]
        ):
            return Response({"error": "Missing required fields"}, status=400)

        selected_id = data.get("cart_item_id")
        if "cart_item_id" in data:
            if (isinstance(selected_id, bool) or not isinstance(selected_id, (int, str))
                    or not str(selected_id).isascii() or not str(selected_id).isdigit()
                    or len(str(selected_id)) > 19
                    or int(selected_id) <= 0 or int(selected_id) > 9223372036854775807):
                return Response({"error": "Invalid cake selection"}, status=400)
            selected_id = int(selected_id)

        with transaction.atomic():
            cart, _ = Cart.objects.select_for_update().get_or_create(user=request.user)
            selected_items = cart.items.select_for_update()
            if selected_id is not None:
                selected_items = selected_items.filter(pk=selected_id)
            items = list(selected_items)
            if not items:
                message = "The selected cake is no longer in your cart" if selected_id is not None else "Cart is empty"
                return Response({"error": message}, status=400)

            total = sum(item.subtotal for item in items)
            order = Order.objects.create(
                user=request.user,
                full_name=full_name,
                phone=phone,
                **address,
                delivery_date=delivery_date,
                delivery_time=delivery_time,
                order_notes=notes,
                total_amount=total,
                status="pending_review",
                payment_status="pending"
            )

            for item in items:
                if item.product:
                    OrderItem.objects.create(
                        order=order,
                        product=item.product,
                        quantity=item.quantity,
                        price=item.product.price
                    )
                elif item.customization:
                    OrderItem.objects.create(
                        order=order,
                        product=None,
                        quantity=item.quantity,
                        price=item.item_price,
                        customization=item.customization
                    )

            cart.items.filter(pk__in=[item.pk for item in items]).delete()

        return Response({
            "message": "Order submitted for review",
            "order_id": order.id
        })

    except Exception as e:
        return Response({"error": str(e)}, status=500)
            
# REGISTER
@api_view(["POST"])
@permission_classes([AllowAny])
def register_view(request):
    phone = str(
        request.data.get("phone", "")
    ).strip()

    serializer = RegisterSerializer(
        data=request.data
    )

    if not serializer.is_valid():
        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        verification = (
            SMSVerification.objects
            .select_for_update()
            .filter(
                phone=phone,
                is_verified=True,
            )
            .order_by(
                "-verified_at",
                "-created_at",
            )
            .first()
        )

        if not verification:
            return Response(
                {
                    "error":
                        "Phone number has not been verified."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if verification.is_verification_expired():
            verification.delete()

            return Response(
                {
                    "error":
                        "Phone verification expired. "
                        "Please verify your phone again."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = serializer.save()

        # Verification is single-use.
        SMSVerification.objects.filter(
            phone=phone
        ).delete()

    return Response(
        {
            "message":
                "User Created Successfully",

            "user":
                UserSerializer(user).data,
        },
        status=status.HTTP_201_CREATED,
    )

# USER PROFILE
@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated])
def profile_view(request):
    profile, created = UserProfile.objects.get_or_create(user=request.user)

    if request.method == 'GET':
        serializer = UserProfileSerializer(profile)
        return Response(serializer.data)

    elif request.method == 'PUT':
        serializer = UserProfileSerializer(profile, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            request.user.first_name = request.data.get('first_name', request.user.first_name)
            request.user.last_name = request.data.get('last_name', request.user.last_name)
            request.user.email = request.data.get('email', request.user.email)
            request.user.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
# CHANGE PASSWORD
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    current_password = request.data.get("current_password", "")
    new_password = request.data.get("new_password", "")
    confirm_password = request.data.get("confirm_password", "")

    # Check that all fields are provided.
    if not current_password or not new_password or not confirm_password:
        return Response(
            {"detail": "Please complete all password fields."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Verify the customer's current password.
    if not check_password(current_password, request.user.password):
        return Response(
            {"current_password": ["Your current password is incorrect."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Confirm that both new-password fields match.
    if new_password != confirm_password:
        return Response(
            {"confirm_password": ["The new passwords do not match."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Require at least 8 characters.
    if len(new_password) < 8:
        return Response(
            {"new_password": ["Your new password must contain at least 8 characters."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Prevent reusing the current password.
    if check_password(new_password, request.user.password):
        return Response(
            {"new_password": ["Your new password must be different from your current password."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Apply Django's configured password validators.
    try:
        validate_password(new_password, user=request.user)
    except ValidationError as exc:
        return Response(
            {"new_password": list(exc.messages)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Save securely using Django's password-hashing mechanism.
    request.user.set_password(new_password)
    request.user.save(update_fields=["password"])

    return Response(
        {"detail": "Your password has been changed successfully."},
        status=status.HTTP_200_OK,
    )

# CAKE CUSTOMIZATION → Add Custom Cake to Cart
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_custom_cake_to_cart(request):
    """
    Saves a custom cake as JSON and adds it to the user's cart as a CartItem.
    """
    serializer = CakeCustomizationSerializer(data=request.data)
    if serializer.is_valid():
        data = serializer.validated_data

        try:
            price = calculate_custom_cake_price(
                tier=data.get("tier"),
                size=data.get("size"),
                flavor=data.get("flavor"),
                has_candle=data.get("has_candle", False),
                has_chocolate=data.get("has_chocolate", False),
                has_balls=data.get("has_balls", False),
                has_nuts=data.get("has_nuts", False),
                has_cherry=data.get("has_cherry", False),
                cherry_count=(
                    len((data.get("topping_layout") or {}).get("cherry"))
                    if isinstance((data.get("topping_layout") or {}).get("cherry"), list)
                    else 1
                ),
                has_sprinkles=data.get("has_sprinkles", False),
            )
        except CustomCakePricing.DoesNotExist:
            return Response({
                "error": "No price is configured for the selected tier, size, and flavor."
            }, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            customization_record = serializer.save(user=request.user, price=price)
            customization_snapshot = build_customization_snapshot(
                data,
                price,
                customization_id=customization_record.id,
            )

            # Get or create the user's cart and add the custom cake atomically.
            cart, _ = Cart.objects.get_or_create(user=request.user)
            CartItem.objects.create(
                cart=cart,
                customization=customization_snapshot,
                quantity=1,
            )
        
        return Response({
            "message": "Custom cake added to cart",
            "cart": CartSerializer(cart).data,
        }, status=status.HTTP_201_CREATED)
    
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def upload_sample_cake(request):

    images = request.FILES.getlist("images")
    notes = request.data.get("notes", "")

    if not images:
        return Response(
            {"error": "Please upload at least one image."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Prevent an excessive number of reference images in one upload.
    if len(images) > 10:
        return Response(
            {"error": "You can upload a maximum of 10 images."},
            status=status.HTTP_400_BAD_REQUEST
        )

    uploaded_requests = []

    try:
        # Save every uploaded image as its own UploadedCakeRequest record.
        for image in images:
            serializer = UploadedCakeRequestSerializer(
                data={
                    "image": image,
                    "notes": notes,
                }
            )

            if not serializer.is_valid():
                return Response(
                    serializer.errors,
                    status=status.HTTP_400_BAD_REQUEST
                )

            upload = serializer.save(user=request.user)
            uploaded_requests.append(upload)

        profile = request.user.userprofile
        address = resolve_address(profile=profile)

        order = Order.objects.create(
            user=request.user,
            full_name=f"{request.user.first_name} {request.user.last_name}".strip(),
            phone=profile.phone,
            **address,
            delivery_date=request.data.get("delivery_date"),
            delivery_time=request.data.get("delivery_time"),
            order_notes=notes,
            total_amount=0,
            quoted_price=None,
            status="pending_review",
            payment_status="pending",
            is_uploaded_cake=True,
        )

        images_data = [
            {
                "upload_id": upload.id,
                "image": upload.image.url,
            }
            for upload in uploaded_requests
        ]

        OrderItem.objects.create(
            order=order,
            quantity=1,
            price=0,
            customization={
                "uploaded_cake": True,
                "upload_ids": [upload.id for upload in uploaded_requests],
                "images": images_data,
                "notes": notes,
                "price_pending": True,
            },
        )

        return Response({
            "message": "Cake uploaded successfully.",
            "order_id": order.id,
            "images": images_data,
        })

    except Exception as e:
        return Response(
            {"error": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def add_uploaded_cake_samples(request, order_id):

    images = request.FILES.getlist("images")

    if not images:
        return Response(
            {"error": "Please upload at least one image."},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        order = Order.objects.get(
            id=order_id,
            user=request.user,
            is_uploaded_cake=True,
        )

    except Order.DoesNotExist:
        return Response(
            {"error": "Uploaded cake order not found."},
            status=status.HTTP_404_NOT_FOUND
        )

    if order.status in ["delivered", "cancelled", "rejected"]:
        return Response(
            {"error": "Reference images can no longer be added to this order."},
            status=status.HTTP_400_BAD_REQUEST
        )

    order_item = order.items.filter(
        product=None,
        customization__uploaded_cake=True
    ).first()

    if not order_item:
        return Response(
            {"error": "Uploaded cake customization not found."},
            status=status.HTTP_404_NOT_FOUND
        )

    customization = order_item.customization or {}

    existing_images = customization.get("images", [])
    existing_upload_ids = customization.get("upload_ids", [])

    if not existing_images and customization.get("image"):
        existing_images = [{
            "upload_id": customization.get("upload_id"),
            "image": customization.get("image"),
        }]

    existing_upload_ids = [
        image.get("upload_id")
        for image in existing_images
        if image.get("upload_id") is not None
    ]

    if len(existing_images) + len(images) > 10:
        remaining_slots = 10 - len(existing_images)

        return Response(
            {
                "error": (
                    f"You can have a maximum of 10 reference images. "
                    f"This order currently has {len(existing_images)} image(s), "
                    f"so you can add {max(remaining_slots, 0)} more."
                )
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    new_images = []

    try:
        for image in images:
            serializer = UploadedCakeRequestSerializer(
                data={
                    "image": image,
                    "notes": customization.get("notes", ""),
                }
            )

            if not serializer.is_valid():
                return Response(
                    serializer.errors,
                    status=status.HTTP_400_BAD_REQUEST
                )

            upload = serializer.save(user=request.user)

            image_data = {
                "upload_id": upload.id,
                "image": upload.image.url,
            }

            new_images.append(image_data)
            existing_images.append(image_data)
            existing_upload_ids.append(upload.id)

        customization["uploaded_cake"] = True
        customization["upload_ids"] = existing_upload_ids
        customization["images"] = existing_images
        customization["price_pending"] = customization.get(
            "price_pending",
            True
        )

        if existing_images:
            customization["upload_id"] = existing_images[0]["upload_id"]
            customization["image"] = existing_images[0]["image"]

        order_item.customization = customization
        order_item.save(update_fields=["customization"])

        return Response({
            "message": "Reference images added successfully.",
            "order_id": order.id,
            "images": existing_images,
            "new_images": new_images,
        })

    except Exception as e:
        return Response(
            {"error": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
        
@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def remove_uploaded_cake_sample(request, order_id, upload_id):

    try:
        order = Order.objects.get(
            id=order_id,
            user=request.user,
            is_uploaded_cake=True,
        )

    except Order.DoesNotExist:
        return Response(
            {"error": "Uploaded cake order not found."},
            status=status.HTTP_404_NOT_FOUND
        )

    if order.status in ["delivered", "cancelled", "rejected"]:
        return Response(
            {"error": "Reference images can no longer be removed from this order."},
            status=status.HTTP_400_BAD_REQUEST
        )

    order_item = order.items.filter(
        product=None,
        customization__uploaded_cake=True
    ).first()

    if not order_item:
        return Response(
            {"error": "Uploaded cake customization not found."},
            status=status.HTTP_404_NOT_FOUND
        )

    customization = order_item.customization or {}

    existing_images = customization.get("images", [])

    if not existing_images and customization.get("image"):
        existing_images = [{
            "upload_id": customization.get("upload_id"),
            "image": customization.get("image"),
        }]

    matching_image = next(
        (
            image
            for image in existing_images
            if str(image.get("upload_id")) == str(upload_id)
        ),
        None
    )

    if not matching_image:
        return Response(
            {"error": "Reference image not found in this order."},
            status=status.HTTP_404_NOT_FOUND
        )

    try:
        upload = UploadedCakeRequest.objects.get(
            id=upload_id,
            user=request.user,
        )

    except UploadedCakeRequest.DoesNotExist:
        return Response(
            {"error": "Uploaded reference image not found."},
            status=status.HTTP_404_NOT_FOUND
        )

    with transaction.atomic():

        remaining_images = [
            image
            for image in existing_images
            if str(image.get("upload_id")) != str(upload_id)
        ]

        remaining_upload_ids = [
            image.get("upload_id")
            for image in remaining_images
            if image.get("upload_id") is not None
        ]

        customization["images"] = remaining_images
        customization["upload_ids"] = remaining_upload_ids
        customization["uploaded_cake"] = True

        if remaining_images:
            customization["upload_id"] = remaining_images[0]["upload_id"]
            customization["image"] = remaining_images[0]["image"]
        else:
            customization.pop("upload_id", None)
            customization.pop("image", None)

        order_item.customization = customization
        order_item.save(update_fields=["customization"])

        if upload.image:
            upload.image.delete(save=False)

        upload.delete()

    return Response({
        "message": "Reference image removed successfully.",
        "order_id": order.id,
        "removed_upload_id": upload_id,
        "images": remaining_images,
        "upload_ids": remaining_upload_ids,
    })
    
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def update_uploaded_order(request, order_id):

    try:
        order = Order.objects.get(
            id=order_id,
            user=request.user,
            is_uploaded_cake=True,
        )

    except Order.DoesNotExist:
        return Response(
            {"error": "Uploaded order not found."},
            status=404,
        )

    profile = request.user.userprofile
    data = request.data

    address = resolve_address(data=data, profile=profile)

    delivery_date = data.get("delivery_date")
    delivery_time = data.get("delivery_time")
    schedule_error = _delivery_schedule_error(delivery_date, delivery_time)
    if schedule_error:
        return Response({"error": schedule_error}, status=400)

    for field, value in address.items():
        setattr(order, field, value)

    order.delivery_date = delivery_date
    order.delivery_time = delivery_time
    order.order_notes = data.get("notes")

    order.save()

    return Response({
        "message": "Uploaded cake order updated.",
        "order_id": order.id,
    })
    