from __future__ import annotations

import hmac
import json
import os
import time
import uuid
from hashlib import sha256
from urllib import error, parse, request

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.users.models import AppUser
from .models import CreditBalance, CreditTransaction, PaymentSession


PRICE_TABLE = {
    "minutes_30": {
        "amount_jpy": 300,
        "minutes": 30,
        "name": "AI面接コーチ 30分クレジット",
        "stripe_price_env": "STRIPE_PRICE_ID_MINUTES_30",
    }
}
STRIPE_API_VERSION = "2026-02-25.clover"


def _is_stripe_test_mode() -> bool:
    explicit_mode = os.getenv("STRIPE_MODE", "").strip().lower()
    if explicit_mode in {"test", "live"}:
        return explicit_mode == "test"
    return settings.DEBUG


def _get_stripe_secret_key() -> str:
    is_test_mode = _is_stripe_test_mode()
    preferred_keys = (
        ["STRIPE_SECRET_KEY_TEST", "STRIPE_SECRET_KEY"]
        if is_test_mode
        else ["STRIPE_SECRET_KEY_LIVE", "STRIPE_SECRET_KEY"]
    )
    for env_name in preferred_keys:
        value = os.getenv(env_name, "").strip()
        if value:
            return value
    return ""


def _get_stripe_price_id(price: dict[str, str | int]) -> str:
    is_test_mode = _is_stripe_test_mode()
    base_env_name = str(price.get("stripe_price_env", "")).strip()
    if not base_env_name:
        return ""

    preferred_keys = (
        [f"{base_env_name}_TEST", base_env_name]
        if is_test_mode
        else [f"{base_env_name}_LIVE", base_env_name]
    )
    for env_name in preferred_keys:
        value = os.getenv(env_name, "").strip()
        if value:
            return value
    return ""


def _get_stripe_webhook_secret() -> str:
    is_test_mode = _is_stripe_test_mode()
    preferred_keys = (
        ["STRIPE_WEBHOOK_SECRET_TEST", "STRIPE_WEBHOOK_SECRET"]
        if is_test_mode
        else ["STRIPE_WEBHOOK_SECRET_LIVE", "STRIPE_WEBHOOK_SECRET"]
    )
    for env_name in preferred_keys:
        value = os.getenv(env_name, "").strip()
        if value:
            return value
    return "test-webhook-secret"


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


def _create_stripe_checkout_session(
    *,
    payment_session: PaymentSession,
    user: AppUser,
    quantity: int,
    success_url: str,
    cancel_url: str,
    idempotency_key: str | None,
) -> tuple[str, str]:
    secret_key = _get_stripe_secret_key()
    if not secret_key:
        allow_fake_checkout = os.getenv("STRIPE_ALLOW_FAKE_CHECKOUT", "false").lower() == "true"
        if not settings.DEBUG and not allow_fake_checkout:
            raise ValueError("Stripe が設定されていません。")
        checkout_session_id = f"cs_test_{uuid.uuid4().hex}"
        checkout_url = f"https://checkout.stripe.test/session/{checkout_session_id}"
        return checkout_session_id, checkout_url

    price = PRICE_TABLE[payment_session.plan_code]
    stripe_price_id = _get_stripe_price_id(price)
    data = {
        "mode": "payment",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "client_reference_id": user.user_id,
        "line_items[0][quantity]": str(quantity),
        "metadata[payment_session_id]": payment_session.payment_session_id,
        "metadata[user_id]": user.user_id,
        "metadata[plan_code]": payment_session.plan_code,
        "metadata[purchased_minutes]": str(payment_session.purchased_minutes),
        "payment_intent_data[metadata][payment_session_id]": payment_session.payment_session_id,
    }
    if stripe_price_id:
        data["line_items[0][price]"] = stripe_price_id
    else:
        data["line_items[0][price_data][currency]"] = "jpy"
        data["line_items[0][price_data][unit_amount]"] = str(price["amount_jpy"])
        data["line_items[0][price_data][product_data][name]"] = price["name"]

    headers = {
        "Authorization": f"Bearer {secret_key}",
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": STRIPE_API_VERSION,
    }
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key

    req = request.Request(
        "https://api.stripe.com/v1/checkout/sessions",
        data=parse.urlencode(data).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=15) as response:
            body = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise ValueError(f"Stripe Checkout の作成に失敗しました。{detail}") from exc
    except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise ValueError("Stripe Checkout の作成に失敗しました。") from exc

    checkout_session_id = body.get("id")
    checkout_url = body.get("url")
    if not checkout_session_id or not checkout_url:
        raise ValueError("Stripe Checkout の応答が不正です。")
    return checkout_session_id, checkout_url


def _retrieve_stripe_checkout_session(stripe_checkout_session_id: str) -> dict:
    secret_key = _get_stripe_secret_key()
    if not secret_key:
        raise ValueError("Stripe が設定されていません。")

    req = request.Request(
        f"https://api.stripe.com/v1/checkout/sessions/{parse.quote(stripe_checkout_session_id)}",
        headers={
            "Authorization": f"Bearer {secret_key}",
            "Stripe-Version": STRIPE_API_VERSION,
        },
        method="GET",
    )
    try:
        with request.urlopen(req, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise ValueError(f"Stripe Checkout の確認に失敗しました。{detail}") from exc
    except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise ValueError("Stripe Checkout の確認に失敗しました。") from exc


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
        existing = PaymentSession.objects.filter(user=user, idempotency_key=idempotency_key).first()
        if existing:
            return existing

    price = PRICE_TABLE[plan_code]
    payment_session = PaymentSession.objects.create(
        payment_session_id=generate_payment_session_id(),
        user=user,
        stripe_checkout_session_id=f"pending_{uuid.uuid4().hex}",
        idempotency_key=idempotency_key,
        status=PaymentSession.Status.CREATED,
        plan_code=plan_code,
        amount_jpy=price["amount_jpy"] * quantity,
        purchased_minutes=price["minutes"] * quantity,
    )
    checkout_session_id, checkout_url = _create_stripe_checkout_session(
        payment_session=payment_session,
        user=user,
        quantity=quantity,
        success_url=success_url,
        cancel_url=cancel_url,
        idempotency_key=idempotency_key,
    )
    payment_session.stripe_checkout_session_id = checkout_session_id
    payment_session.checkout_url = checkout_url
    payment_session.save(update_fields=["stripe_checkout_session_id", "checkout_url"])
    return payment_session


def verify_webhook_signature(payload: bytes, signature: str) -> bool:
    secret = _get_stripe_webhook_secret().encode("utf-8")
    signature_parts = {}
    for item in signature.split(","):
        key, separator, value = item.partition("=")
        if separator:
            signature_parts.setdefault(key, []).append(value)

    timestamps = signature_parts.get("t", [])
    signatures = signature_parts.get("v1", [])
    if timestamps and signatures:
        try:
            timestamp = int(timestamps[0])
        except ValueError:
            return False
        tolerance_seconds = int(os.getenv("STRIPE_WEBHOOK_TOLERANCE_SECONDS", "300"))
        if abs(int(time.time()) - timestamp) > tolerance_seconds:
            return False

        signed_payload = f"{timestamp}.".encode("utf-8") + payload
        expected = hmac.new(secret, signed_payload, sha256).hexdigest()
        return any(hmac.compare_digest(expected, item) for item in signatures)

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


def confirm_checkout_session(*, user: AppUser, stripe_checkout_session_id: str) -> PaymentSession:
    payment_session = PaymentSession.objects.get(
        user=user,
        stripe_checkout_session_id=stripe_checkout_session_id,
    )
    if payment_session.status == PaymentSession.Status.REFLECTED:
        return payment_session

    stripe_session = _retrieve_stripe_checkout_session(stripe_checkout_session_id)
    payment_status = stripe_session.get("payment_status")
    session_status = stripe_session.get("status")
    if payment_status != "paid" and session_status != "complete":
        raise ValueError("Stripe Checkout はまだ完了していません。")

    if payment_session.status != PaymentSession.Status.REFLECTED:
        payment_session.status = PaymentSession.Status.PAID
        payment_session.save(update_fields=["status"])
    return handle_checkout_completed(session=payment_session)
