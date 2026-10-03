from django.contrib import admin
from .models import *
from .models_verification import SMSVerification

admin.site.register(Category)
admin.site.register(Product)
admin.site.register(CustomCakePricing)
admin.site.register(AddonPricing)
admin.site.register(UserProfile)


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
	class Media:
		js = ("store/js/order_status_notifications.js",)
		css = {"all": ("store/css/order_status_notifications.css",)}


admin.site.register(OrderItem)
admin.site.register(CakeCustomization)

admin.site.register(SMSVerification)
