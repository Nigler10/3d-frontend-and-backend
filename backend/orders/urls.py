# orders/urls.py
from django.urls import path
from . import views
from . import admin_views
from . import schedule_views
from orders.views import cancel_order

urlpatterns = [
    # Customer
    path('history/', views.order_history, name='order_history'),
    path('<int:order_id>/', views.order_detail, name='order_detail'),
    path('customer/orders/', views.customer_orders),
    path('customer/orders/<int:order_id>/', views.customer_order_detail, name='customer_order_detail'),
    path('<int:order_id>/accept-quotation/', views.accept_quotation, name='accept_quotation'),
    path('<int:order_id>/cancel/', cancel_order, name='cancel_order'),
    path('customer/orders/<int:order_id>/delivery-change-requests/', views.create_delivery_change_request, name='create_delivery_change_request'),
    
    # Customer Feedback
    path('<int:order_id>/items/<int:item_id>/product-review/', views.product_review, name='product_review'),
    path('products/<int:product_id>/reviews/', views.product_reviews, name='product_reviews'),
    
    # Admin Orders
    path('admin/orders/', admin_views.admin_orders),
    path('admin/orders/<int:order_id>/', admin_views.admin_order_detail),
    path('admin/orders/<int:order_id>/review/', admin_views.admin_review_order),
    path('admin/orders/<int:order_id>/quotation/', admin_views.admin_send_quotation),
    path('admin/dashboard/', admin_views.admin_dashboard),
    path('admin/schedule/calendar/', schedule_views.admin_schedule_calendar, name='admin_schedule_calendar'),
    path('admin/schedule/day/', schedule_views.admin_schedule_day, name='admin_schedule_day'),
    path('admin/orders/<int:order_id>/update-status/', admin_views.admin_update_order_status),
    path('admin/orders/<int:order_id>/delivery-change-requests/<int:request_id>/review/', admin_views.admin_review_delivery_change_request, name='admin_review_delivery_change_request'),
]