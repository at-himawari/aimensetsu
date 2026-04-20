from django.conf import settings
from django.contrib.auth.models import User
from django.urls import reverse
import os


def create_checkout_session(user: User) -> dict[str, str]:
    price_id = os.getenv("STRIPE_PRICE_ID_30MIN")
    secret_key = os.getenv("STRIPE_SECRET_KEY")
    if not price_id or not secret_key:
        return {
            "mode": "mock",
            "url": f"{os.getenv('STRIPE_SUCCESS_URL', 'http://localhost:5173/billing/success')}?mock=true",
        }

    import stripe

    stripe.api_key = secret_key
    stripe.api_version = "2026-02-25.clover"
    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=os.getenv("STRIPE_SUCCESS_URL"),
        cancel_url=os.getenv("STRIPE_CANCEL_URL"),
        client_reference_id=str(user.id),
        metadata={"user_id": str(user.id), "minutes": str(settings.PRACTICE_BLOCK_MINUTES)},
    )
    return {"mode": "stripe", "url": session.url, "id": session.id}

