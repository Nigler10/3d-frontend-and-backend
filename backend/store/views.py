# store/views.py
from rest_framework import status
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.views import TokenObtainPairView
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

class MyTokenObtainPairView(TokenObtainPairView):
    serializer_class = MyTokenObtainPairSerializer
    
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
        • Past slots are hidden when the requested date is today.
        • Only today and future dates are accepted.
    """
    from datetime import datetime, date as date_type, time as time_type, timedelta as td
    from collections import Counter

    MAX_ORDERS_PER_SLOT = 3
    OPEN_HOUR = 8    # 08:00 AM
    CLOSE_HOUR = 20  # 08:00 PM

    date_str = request.GET.get("date")
    if not date_str:
        return Response(
            {"error": "The 'date' query parameter is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        requested_date = datetime.strptime(date_str, "%Y-%m-%d").date()
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

    # Build every 30-min slot in the operating window.
    all_slots = []
    current = datetime.combine(requested_date, time_type(OPEN_HOUR, 0))
    end = datetime.combine(requested_date, time_type(CLOSE_HOUR, 0))

    while current < end:
        all_slots.append(current.time())
        current += td(minutes=30)

    # If the date is today, drop any slot whose time has already passed.
    if requested_date == today:
        now_time = timezone.localtime().time()
        all_slots = [s for s in all_slots if s > now_time]

    # Count existing active bookings per slot for this date.
    booked_orders = (
        Order.objects.filter(delivery_date=requested_date)
        .exclude(status__in=["cancelled", "rejected"])
        .values_list("delivery_time", flat=True)
    )
    slot_counts = Counter(t for t in booked_orders if t is not None)

    # Filter to only available slots.
    available = []
    for slot in all_slots:
        if slot_counts.get(slot, 0) < MAX_ORDERS_PER_SLOT:
            available.append(slot.strftime("%H:%M"))

    return Response({
        "date": date_str,
        "slots": available,
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

        if (
            not full_name
            or not phone
            or not address["street"]
        ):
            return Response({"error": "Missing required fields"}, status=400)

        cart, created = Cart.objects.get_or_create(user=request.user)

        if not cart.items.exists():
            return Response({"error": "Cart is empty"}, status=400)

        total = sum(item.subtotal for item in cart.items.all())
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

        for item in cart.items.all():
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

        cart.items.all().delete()

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

    for field, value in address.items():
        setattr(order, field, value)

    order.delivery_date = data.get("delivery_date")
    order.delivery_time = data.get("delivery_time")
    order.order_notes = data.get("notes")

    order.save()

    return Response({
        "message": "Uploaded cake order updated.",
        "order_id": order.id,
    })
    
