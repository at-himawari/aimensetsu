from __future__ import annotations

import json

from django.http import HttpRequest
from django.views.decorators.http import require_GET, require_POST

from apps.common.audit import log_audit_event
from apps.common.auth import require_principal
from apps.common.responses import json_error, json_success
from apps.users.models import AppUser
from .models import PaymentSession
from .services import (
    create_checkout_session,
    get_or_create_credit_balance,
    handle_stripe_webhook,
    list_credit_transactions,
)


def _get_user(request: HttpRequest) -> AppUser:
    return AppUser.objects.get(user_id=request.principal.user_id)


@require_GET
@require_principal
def credit_balance(request: HttpRequest):
    balance = get_or_create_credit_balance(_get_user(request))
    return json_success(request, {"available_minutes": balance.available_minutes})


@require_GET
@require_principal
def credit_transactions(request: HttpRequest):
    transactions = list_credit_transactions(_get_user(request))
    data = [
        {
            "transaction_id": item.transaction_id,
            "payment_session_id": item.payment_session_id,
            "transaction_type": item.transaction_type,
            "minutes_delta": item.minutes_delta,
            "amount_jpy": item.amount_jpy,
            "reason": item.reason,
            "created_at": item.created_at.isoformat(),
        }
        for item in transactions
    ]
    return json_success(request, data)


@require_POST
@require_principal
def checkout_sessions(request: HttpRequest):
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except json.JSONDecodeError:
        return json_error(request, "INVALID_REQUEST", "JSON を解釈できません。", 400)

    try:
        payment_session = create_checkout_session(
            user=_get_user(request),
            plan_code=payload.get("plan_code"),
            quantity=int(payload.get("quantity", 1)),
            success_url=payload.get("success_url"),
            cancel_url=payload.get("cancel_url"),
            idempotency_key=request.headers.get("Idempotency-Key"),
        )
    except ValueError as exc:
        return json_error(request, "INVALID_REQUEST", str(exc), 400)

    log_audit_event(
        action_type="create_checkout_session",
        target_type="payment_session",
        target_id=payment_session.payment_session_id,
        user=_get_user(request),
        metadata={"plan_code": payment_session.plan_code, "amount_jpy": payment_session.amount_jpy},
    )

    return json_success(
        request,
        {
            "payment_session_id": payment_session.payment_session_id,
            "checkout_session_id": payment_session.stripe_checkout_session_id,
            "checkout_url": payment_session.checkout_url,
            "expires_at": None,
        },
        status=201,
    )


@require_GET
@require_principal
def checkout_session_detail(request: HttpRequest, session_id: str):
    try:
        payment_session = PaymentSession.objects.get(payment_session_id=session_id, user=_get_user(request))
    except PaymentSession.DoesNotExist:
        return json_error(request, "NOT_FOUND", "決済セッションが見つかりません。", 404)

    return json_success(
        request,
        {
            "payment_session_id": payment_session.payment_session_id,
            "stripe_checkout_session_id": payment_session.stripe_checkout_session_id,
            "status": payment_session.status,
            "amount_jpy": payment_session.amount_jpy,
            "purchased_minutes": payment_session.purchased_minutes,
            "completed_at": payment_session.completed_at.isoformat() if payment_session.completed_at else None,
        },
    )


@require_POST
def stripe_webhook(request: HttpRequest):
    signature = request.headers.get("Stripe-Signature")
    if not signature:
        return json_error(request, "INVALID_WEBHOOK_SIGNATURE", "Stripe-Signature が必要です。", 401)

    try:
        result = handle_stripe_webhook(request.body, signature)
    except PermissionError as exc:
        return json_error(request, "INVALID_WEBHOOK_SIGNATURE", str(exc), 401)
    except PaymentSession.DoesNotExist:
        return json_error(request, "NOT_FOUND", "決済セッションが見つかりません。", 404)
    except ValueError as exc:
        return json_error(request, "INVALID_REQUEST", str(exc), 400)

    payment_session = PaymentSession.objects.get(payment_session_id=result["payment_session_id"])
    log_audit_event(
        action_type="stripe_webhook",
        target_type="payment_session",
        target_id=payment_session.payment_session_id,
        user=payment_session.user,
        metadata={"status": payment_session.status},
    )

    return json_success(request, {"message": "processed", **result})
