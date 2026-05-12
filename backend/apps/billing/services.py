from __future__ import annotations

import hmac
import json
import os
import uuid
from hashlib import sha256

from django.db import transaction
from django.utils import timezone

from apps.users.models import AppUser
from .models import CreditBalance, CreditTransaction, PaymentSession


PRICE_TABLE = {
    "minutes_30": {
        "amount_jpy": 300,
        "minutes": 30,
    }
}


def generate_payment_session_id() -> str:
    return f"pay_{uuid.uuid4().hex}"


def generate_credit_transaction_id() -> str:
    return f"ctx_{uuid.uuid4().hex}"


def get_or_create_credit_balance(user: AppUser) -> CreditBalance:
    balance, _ = CreditBalance.objects.get_or_create(
        user=user,
        defaults={
            "balance_id": f"bal_{user.user_id}",
            "available_minutes": 0,
        },
    )
    return balance


def list_credit_transactions(user: AppUser):
    return CreditTransaction.objects.filter(user=user).order_by("-created_at")


def create_checkout_session(
    *,
    user: AppUser,
    plan_code: str,
    quantity: int,
    success_url: str,
    cancel_url: str,
    idempotency_key: str | None,
) -> PaymentSession:
    if plan_code not in PRICE_TABLE:
        raise ValueError("不正な plan_code です。")
    if quantity < 1:
        raise ValueError("quantity は 1 以上である必要があります。")

    if idempotency_key:
        existing = PaymentSession.objects.filter(user=user, stripe_checkout_session_id=idempotency_key).first()
        if existing:
            return existing

    price = PRICE_TABLE[plan_code]
    payment_session = PaymentSession.objects.create(
        payment_session_id=generate_payment_session_id(),
        user=user,
        stripe_checkout_session_id=idempotency_key or f"cs_{uuid.uuid4().hex}",
        status=PaymentSession.Status.CREATED,
        plan_code=plan_code,
        amount_jpy=price["amount_jpy"] * quantity,
        purchased_minutes=price["minutes"] * quantity,
    )
    payment_session.checkout_url = (
        f"https://checkout.stripe.example/session/{payment_session.stripe_checkout_session_id}"
        f"?success_url={success_url}&cancel_url={cancel_url}"
    )
    return payment_session


def verify_webhook_signature(payload: bytes, signature: str) -> bool:
    secret = os.getenv("STRIPE_WEBHOOK_SECRET", "test-webhook-secret").encode("utf-8")
    expected = hmac.new(secret, payload, sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@transaction.atomic
def handle_checkout_completed(*, session: PaymentSession) -> PaymentSession:
    locked = PaymentSession.objects.select_for_update().get(payment_session_id=session.payment_session_id)
    if locked.status == PaymentSession.Status.REFLECTED:
        return locked

    balance = get_or_create_credit_balance(locked.user)
    if locked.status != PaymentSession.Status.REFLECTED:
        balance.available_minutes += locked.purchased_minutes
        balance.save(update_fields=["available_minutes", "updated_at"])

        CreditTransaction.objects.create(
            transaction_id=generate_credit_transaction_id(),
            user=locked.user,
            payment_session=locked,
            transaction_type=CreditTransaction.TransactionType.PURCHASE,
            minutes_delta=locked.purchased_minutes,
            amount_jpy=locked.amount_jpy,
            reason=f"payment:{locked.payment_session_id}",
        )

    locked.status = PaymentSession.Status.REFLECTED
    locked.completed_at = locked.completed_at or timezone.now()
    locked.save(update_fields=["status", "completed_at"])
    return locked


def handle_stripe_webhook(payload: bytes, signature: str) -> dict:
    if not verify_webhook_signature(payload, signature):
        raise PermissionError("署名が不正です。")

    event = json.loads(payload.decode("utf-8"))
    event_type = event.get("type")
    session_id = ((event.get("data") or {}).get("object") or {}).get("id")
    if not session_id:
        raise ValueError("session id が見つかりません。")

    payment_session = PaymentSession.objects.get(stripe_checkout_session_id=session_id)

    if event_type == "checkout.session.completed":
        if payment_session.status != PaymentSession.Status.REFLECTED:
            payment_session.status = PaymentSession.Status.PAID
            payment_session.save(update_fields=["status"])
        payment_session = handle_checkout_completed(session=payment_session)
    elif event_type == "checkout.session.expired":
        payment_session.status = PaymentSession.Status.EXPIRED
        payment_session.save(update_fields=["status"])
    elif event_type == "checkout.session.async_payment_failed":
        payment_session.status = PaymentSession.Status.FAILED
        payment_session.save(update_fields=["status"])
    else:
        raise ValueError("未対応のイベントです。")

    return {
        "payment_session_id": payment_session.payment_session_id,
        "status": payment_session.status,
    }
