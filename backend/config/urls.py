from django.urls import path

from apps.interviews import views


urlpatterns = [
    path("api/me/", views.me),
    path("api/phone/start/", views.start_phone_verification),
    path("api/phone/verify/", views.verify_phone),
    path("api/sessions/", views.sessions),
    path("api/sessions/<int:session_id>/", views.session_detail),
    path("api/sessions/<int:session_id>/documents/", views.upload_document),
    path("api/sessions/<int:session_id>/messages/", views.add_message),
    path("api/sessions/<int:session_id>/feedback/", views.feedback),
    path("api/billing/checkout/", views.create_checkout),
    path("api/billing/webhook/", views.stripe_webhook),
]
