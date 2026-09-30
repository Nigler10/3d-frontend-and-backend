# store/admin_views.py
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from .models import CakeCustomization
from .serializers import AdminCakeCustomizationSerializer
from .models import AddonPricing, CustomCakePricing, Product, DEFAULT_CUSTOM_CAKE_PRICES, DEFAULT_ADDON_PRICES
from .serializers import (
    AddonPricingSerializer,
    CustomCakePricingSerializer,
    ProductSerializer,
)

@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_get_products(request):
    products = Product.objects.all().order_by('-created_at')
    serializer = ProductSerializer(products, many=True)
    return Response(serializer.data)

@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_create_product(request):
    serializer = ProductSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['PUT', 'PATCH'])
@permission_classes([IsAdminUser])
def admin_update_product(request, pk):
    try:
        product = Product.objects.get(id=pk)
    except Product.DoesNotExist:
        return Response({"error": "Product not found"}, status=status.HTTP_404_NOT_FOUND)

    serializer = ProductSerializer(product, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['DELETE'])
@permission_classes([IsAdminUser])
def admin_delete_product(request, pk):
    try:
        product = Product.objects.get(id=pk)
    except Product.DoesNotExist:
        return Response({"error": "Product not found"}, status=status.HTTP_404_NOT_FOUND)

    product.delete()
    return Response({"message": "Product deleted"})

@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_get_custom_pricing(request):
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
    pricing = CustomCakePricing.objects.all().order_by('shape', 'tier', 'size', 'flavor')
    serializer = CustomCakePricingSerializer(pricing, many=True)
    return Response(serializer.data)

@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_create_custom_pricing(request):
    serializer = CustomCakePricingSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['PUT', 'PATCH'])
@permission_classes([IsAdminUser])
def admin_update_custom_pricing(request, pk):
    try:
        pricing = CustomCakePricing.objects.get(id=pk)
    except CustomCakePricing.DoesNotExist:
        return Response({"error": "Custom pricing not found"}, status=status.HTTP_404_NOT_FOUND)

    serializer = CustomCakePricingSerializer(pricing, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['DELETE'])
@permission_classes([IsAdminUser])
def admin_delete_custom_pricing(request, pk):
    try:
        pricing = CustomCakePricing.objects.get(id=pk)
    except CustomCakePricing.DoesNotExist:
        return Response({"error": "Custom pricing not found"}, status=status.HTTP_404_NOT_FOUND)

    pricing.delete()
    return Response({"message": "Custom pricing deleted"})

@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_get_addon_pricing(request):
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
    addons = AddonPricing.objects.all().order_by('name')
    serializer = AddonPricingSerializer(addons, many=True)
    return Response(serializer.data)

@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_create_addon_pricing(request):
    serializer = AddonPricingSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['PUT', 'PATCH'])
@permission_classes([IsAdminUser])
def admin_update_addon_pricing(request, pk):
    try:
        addon = AddonPricing.objects.get(id=pk)
    except AddonPricing.DoesNotExist:
        return Response({"error": "Addon not found"}, status=status.HTTP_404_NOT_FOUND)

    serializer = AddonPricingSerializer(addon, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['DELETE'])
@permission_classes([IsAdminUser])
def admin_delete_addon_pricing(request, pk):
    try:
        addon = AddonPricing.objects.get(id=pk)
    except AddonPricing.DoesNotExist:
        return Response({"error": "Addon not found"}, status=status.HTTP_404_NOT_FOUND)

    addon.delete()
    return Response({"message": "Addon pricing deleted"})

@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_get_custom_cakes(request):

    cakes = CakeCustomization.objects.all().order_by('-created_at')

    serializer = AdminCakeCustomizationSerializer(
        cakes,
        many=True
    )

    return Response(serializer.data)

@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_get_custom_cake(request, pk):

    try:
        cake = CakeCustomization.objects.get(id=pk)

    except CakeCustomization.DoesNotExist:
        return Response(
            {"error": "Custom cake not found"},
            status=status.HTTP_404_NOT_FOUND
        )

    serializer = AdminCakeCustomizationSerializer(cake)

    return Response(serializer.data)