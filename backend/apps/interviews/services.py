from __future__ import annotations

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.billing.models import CreditBalance, CreditTransaction
from apps.integrations.ai import InterviewAIService
from apps.users.models import AppUser
from .models import InterviewMessage, InterviewSession, Reflection


def generate_session_id() -> str:
    import uuid

    return f"ses_{uuid.uuid4().hex}"


def generate_credit_transaction_id() -> str:
    import uuid

    return f"ctx_{uuid.uuid4().hex}"


def generate_message_id() -> str:
    import uuid

    return f"msg_{uuid.uuid4().hex}"


def generate_reflection_id() -> str:
    import uuid

    return f"ref_{uuid.uuid4().hex}"


def get_or_create_credit_balance(user: AppUser) -> CreditBalance:
    balance, _ = CreditBalance.objects.get_or_create(
        user=user,
        defaults={
            "balance_id": f"bal_{user.user_id}",
            "available_minutes": 0,
        },
    )
    return balance


def allows_interview_without_credits() -> bool:
    return bool(getattr(settings, "ALLOW_INTERVIEW_WITHOUT_CREDITS", False))


def ensure_sufficient_credits(user: AppUser) -> CreditBalance:
    balance = get_or_create_credit_balance(user)
    if balance.available_minutes <= 0 and not allows_interview_without_credits():
        raise ValueError("利用可能クレジットが不足しています。")
    return balance


def build_transcript(session: InterviewSession) -> str:
    lines: list[str] = []
    for message in session.messages.order_by("created_at"):
        lines.append(f"{message.sender_type}: {message.content}")
    return "\n".join(lines)


@transaction.atomic
def create_message_exchange(session: InterviewSession, content: str, message_type: str):
    if session.status != InterviewSession.Status.ACTIVE:
        raise ValueError("active 状態のセッションのみメッセージ送信できます。")

    user_message = InterviewMessage.objects.create(
        message_id=generate_message_id(),
        session=session,
        sender_type=InterviewMessage.SenderType.USER,
        message_type=message_type,
        content=content,
    )

    ai_service = InterviewAIService()
    ai_reply = ai_service.generate_reply(content)
    assistant_message = InterviewMessage.objects.create(
        message_id=generate_message_id(),
        session=session,
        sender_type=InterviewMessage.SenderType.ASSISTANT,
        message_type=InterviewMessage.MessageType.TEXT,
        content=ai_reply.content,
        ai_mode=ai_reply.ai_mode,
    )
    if ai_reply.used_fallback and not session.used_fallback:
        session.used_fallback = True
        session.save(update_fields=["used_fallback"])

    return user_message, assistant_message, ai_reply


@transaction.atomic
def generate_reflection(session: InterviewSession) -> Reflection:
    if session.status != InterviewSession.Status.COMPLETED:
        raise ValueError("completed 状態のセッションのみ振り返り生成できます。")

    if hasattr(session, "reflection"):
        return session.reflection

    transcript = build_transcript(session)
    ai_service = InterviewAIService()
    result = ai_service.generate_reflection(transcript)

    reflection = Reflection.objects.create(
        reflection_id=generate_reflection_id(),
        session=session,
        strengths="\n".join(result.strengths),
        improvements="\n".join(result.improvements),
        advice=result.advice,
        ai_mode=result.ai_mode,
    )
    if result.ai_mode == "fallback" and not session.used_fallback:
        session.used_fallback = True
        session.save(update_fields=["used_fallback"])

    return reflection


@transaction.atomic
def complete_session(session: InterviewSession) -> tuple[InterviewSession, CreditBalance]:
    if session.status != InterviewSession.Status.ACTIVE:
        raise ValueError("active 状態のセッションのみ終了できます。")

    balance = get_or_create_credit_balance(session.user)
    end_time = timezone.now()
    consumed_minutes = max(1, int((end_time - session.started_at).total_seconds() // 60))

    if session.used_fallback or allows_interview_without_credits():
        consumed_minutes = 0

    if consumed_minutes > 0:
        balance = CreditBalance.objects.select_for_update().get(user=session.user)
    balance.available_minutes = max(0, balance.available_minutes - consumed_minutes)
    balance.save(update_fields=["available_minutes", "updated_at"])

    session.status = InterviewSession.Status.COMPLETED
    session.ended_at = end_time
    session.consumed_minutes = consumed_minutes
    session.remaining_credit_minutes_after = balance.available_minutes
    session.save(
        update_fields=[
            "status",
            "ended_at",
            "consumed_minutes",
            "remaining_credit_minutes_after",
        ]
    )

    CreditTransaction.objects.create(
        transaction_id=generate_credit_transaction_id(),
        user=session.user,
        transaction_type=CreditTransaction.TransactionType.CONSUME,
        minutes_delta=-consumed_minutes,
        amount_jpy=None,
        reason=f"session:{session.session_id}",
    )

    return session, balance
