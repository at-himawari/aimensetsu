from django.urls import path

from .views import (
    checkout_session_detail,
    checkout_sessions,
    credit_balance,
    credit_transactions,
    stripe_webhook,
)


urlpatterns = [
    path("credits/balance", credit_balance, name="credit-balance"),
    path("credits/transactions", credit_transactions, name="credit-transactions"),
    path("billing/checkout-sessions", checkout_sessions, name="checkout-sessions"),
    path("billing/checkout-sessions/", checkout_sessions, name="checkout-sessions-slash"),
    path(
        "billing/checkout-sessions/<str:session_id>",
        checkout_session_detail,
        name="checkout-session-detail",
    ),
    path("billing/webhooks/stripe", stripe_webhook, name="stripe-webhook"),
]
