from __future__ import annotations

import json

from django.http import HttpRequest, HttpResponse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_http_methods

from apps.common.audit import log_audit_event
from apps.common.auth import require_principal
from apps.common.maintenance import is_system_maintenance
from apps.common.responses import json_error, json_success
from apps.integrations.ai import AIServiceError, OpenAIRealtimeService
from apps.resumes.models import ResumeFile
from apps.users.models import AppUser
from .models import InterviewMessage, InterviewSession
from .services import (
    complete_session,
    create_message_exchange,
    ensure_sufficient_credits,
    generate_reflection,
    generate_message_id,
    generate_session_id,
)


def _serialize_session(session: InterviewSession) -> dict:
    return {
        "session_id": session.session_id,
        "resume_id": session.resume_id,
        "status": session.status,
        "mode": session.mode,
        "job_role": session.job_role,
        "consumed_minutes": session.consumed_minutes,
        "remaining_credit_minutes_after": session.remaining_credit_minutes_after,
        "used_fallback": session.used_fallback,
        "started_at": session.started_at.isoformat(),
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
    }


def _get_user(request: HttpRequest) -> AppUser:
    return AppUser.objects.get(user_id=request.principal.user_id)


@require_http_methods(["GET", "POST"])
@require_principal
def interview_sessions(request: HttpRequest):
    user = _get_user(request)

    if request.method == "GET":
        sessions = InterviewSession.objects.filter(user=user).exclude(
            status=InterviewSession.Status.DELETED
        ).order_by("-started_at")
        return json_success(request, [_serialize_session(session) for session in sessions])

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except json.JSONDecodeError:
        return json_error(request, "INVALID_REQUEST", "JSON を解釈できません。", 400)

    resume_id = payload.get("resume_id")
    mode = payload.get("mode")
    job_role = payload.get("job_role")
    if not mode:
        return json_error(request, "INVALID_REQUEST", "mode は必須です。", 400)
    if is_system_maintenance():
        return json_error(
            request,
            "SYSTEM_MAINTENANCE",
            "午前1時から午前6時までは、システムメンテナンスのため面接を開始できません。",
            503,
        )

    try:
        balance = ensure_sufficient_credits(user)
    except ValueError as exc:
        return json_error(request, "INSUFFICIENT_CREDITS", str(exc), 422)

    resume = None
    if resume_id:
        try:
            resume = ResumeFile.objects.get(
                resume_id=resume_id,
                user=user,
                deleted_at__isnull=True,
            )
        except ResumeFile.DoesNotExist:
            return json_error(request, "NOT_FOUND", "RESUME が見つかりません。", 404)

    session = InterviewSession.objects.create(
        session_id=generate_session_id(),
        user=user,
        resume=resume,
        status=InterviewSession.Status.ACTIVE,
        mode=mode,
        job_role=job_role,
        started_at=timezone.now(),
    )
    log_audit_event(
        action_type="start",
        target_type="interview_session",
        target_id=session.session_id,
        user=user,
        metadata={"mode": mode, "resume_id": resume_id},
    )
    return json_success(
        request,
        {
            "session_id": session.session_id,
            "status": session.status,
            "remaining_credit_minutes": balance.available_minutes,
            "used_fallback": session.used_fallback,
            "realtime_session": None,
        },
        status=201,
    )


@require_http_methods(["GET", "DELETE"])
@require_principal
def interview_session_detail(request: HttpRequest, session_id: str):
    user = _get_user(request)
    try:
        session = InterviewSession.objects.get(session_id=session_id, user=user)
    except InterviewSession.DoesNotExist:
        return json_error(request, "NOT_FOUND", "面接セッションが見つかりません。", 404)

    if request.method == "GET":
        return json_success(request, _serialize_session(session))

    session.status = InterviewSession.Status.DELETED
    session.save(update_fields=["status"])
    log_audit_event(
        action_type="delete",
        target_type="interview_session",
        target_id=session.session_id,
        user=user,
        metadata={"from": "session_detail"},
    )
    return json_success(request, {"message": "deleted"})


@require_http_methods(["POST"])
@require_principal
def interview_session_complete(request: HttpRequest, session_id: str):
    user = _get_user(request)
    try:
        session = InterviewSession.objects.get(session_id=session_id, user=user)
    except InterviewSession.DoesNotExist:
        return json_error(request, "NOT_FOUND", "面接セッションが見つかりません。", 404)

    try:
        session, balance = complete_session(session)
    except ValueError as exc:
        return json_error(request, "INVALID_STATE", str(exc), 409)

    log_audit_event(
        action_type="complete",
        target_type="interview_session",
        target_id=session.session_id,
        user=user,
        metadata={"consumed_minutes": session.consumed_minutes},
    )

    return json_success(
        request,
        {
            "session_id": session.session_id,
            "status": session.status,
            "consumed_minutes": session.consumed_minutes,
            "remaining_credit_minutes": balance.available_minutes,
        },
    )


@require_GET
@require_principal
def history_list(request: HttpRequest):
    user = _get_user(request)
    sessions = InterviewSession.objects.filter(user=user).exclude(
        status=InterviewSession.Status.DELETED
    ).order_by("-started_at")
    return json_success(request, [_serialize_session(session) for session in sessions])


@require_http_methods(["GET", "DELETE"])
@require_principal
def history_detail(request: HttpRequest, session_id: str):
    user = _get_user(request)
    try:
        session = InterviewSession.objects.prefetch_related("messages").select_related("reflection").get(
            session_id=session_id,
            user=user,
        )
    except InterviewSession.DoesNotExist:
        return json_error(request, "NOT_FOUND", "履歴が見つかりません。", 404)

    if request.method == "DELETE":
        session.status = InterviewSession.Status.DELETED
        session.save(update_fields=["status"])
        log_audit_event(
            action_type="delete",
            target_type="history",
            target_id=session.session_id,
            user=user,
            metadata={"from": "history_detail"},
        )
        return json_success(request, {"message": "deleted"})

    messages = [
        {
            "message_id": message.message_id,
            "sender_type": message.sender_type,
            "message_type": message.message_type,
            "content": message.content,
            "ai_mode": message.ai_mode,
            "created_at": message.created_at.isoformat(),
        }
        for message in session.messages.all().order_by("created_at")
    ]
    reflection = None
    if hasattr(session, "reflection"):
        reflection = {
            "reflection_id": session.reflection.reflection_id,
            "strengths": session.reflection.strengths.splitlines() if session.reflection.strengths else [],
            "improvements": session.reflection.improvements.splitlines() if session.reflection.improvements else [],
            "advice": session.reflection.advice,
            "ai_mode": session.reflection.ai_mode,
            "created_at": session.reflection.created_at.isoformat(),
        }

    return json_success(
        request,
        {
            "session": _serialize_session(session),
            "messages": messages,
            "reflection": reflection,
        },
    )


@require_http_methods(["GET", "POST"])
@require_principal
def session_messages(request: HttpRequest, session_id: str):
    user = _get_user(request)
    try:
        session = InterviewSession.objects.prefetch_related("messages").select_related("resume").get(
            session_id=session_id,
            user=user,
        )
    except InterviewSession.DoesNotExist:
        return json_error(request, "NOT_FOUND", "面接セッションが見つかりません。", 404)

    if request.method == "GET":
        messages = [
            {
                "message_id": message.message_id,
                "sender_type": message.sender_type,
                "message_type": message.message_type,
                "content": message.content,
                "ai_mode": message.ai_mode,
                "created_at": message.created_at.isoformat(),
            }
            for message in session.messages.all().order_by("created_at")
        ]
        return json_success(request, messages)

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except json.JSONDecodeError:
        return json_error(request, "INVALID_REQUEST", "JSON を解釈できません。", 400)

    content = payload.get("message")
    message_type = payload.get("message_type")
    if not content or not message_type:
        return json_error(request, "INVALID_REQUEST", "message と message_type は必須です。", 400)

    if payload.get("record_only"):
        sender_type = payload.get("sender_type")
        if sender_type not in {
            InterviewMessage.SenderType.USER,
            InterviewMessage.SenderType.ASSISTANT,
        }:
            return json_error(request, "INVALID_REQUEST", "sender_type が不正です。", 400)

        message = InterviewMessage.objects.create(
            message_id=generate_message_id(),
            session=session,
            sender_type=sender_type,
            message_type=message_type,
            content=content,
        )
        log_audit_event(
            action_type="record_message",
            target_type="interview_session",
            target_id=session.session_id,
            user=user,
            metadata={"sender_type": sender_type, "record_only": True},
        )
        return json_success(
            request,
            {
                "message": {
                    "message_id": message.message_id,
                    "sender_type": message.sender_type,
                    "message_type": message.message_type,
                    "content": message.content,
                },
            },
            status=201,
        )

    try:
        user_message, assistant_message, ai_reply = create_message_exchange(session, content, message_type)
    except ValueError as exc:
        return json_error(request, "INVALID_STATE", str(exc), 409)

    log_audit_event(
        action_type="message",
        target_type="interview_session",
        target_id=session.session_id,
        user=user,
        metadata={"used_fallback": ai_reply.used_fallback},
    )

    return json_success(
        request,
        {
            "user_message": {
                "message_id": user_message.message_id,
                "sender_type": user_message.sender_type,
                "message_type": user_message.message_type,
                "content": user_message.content,
            },
            "assistant_message": {
                "message_id": assistant_message.message_id,
                "sender_type": assistant_message.sender_type,
                "message_type": assistant_message.message_type,
                "content": assistant_message.content,
                "ai_mode": assistant_message.ai_mode,
            },
            "used_fallback": ai_reply.used_fallback,
        },
    )


@require_http_methods(["POST"])
@require_principal
def realtime_call(request: HttpRequest, session_id: str):
    user = _get_user(request)
    try:
        session = InterviewSession.objects.select_related("resume").get(session_id=session_id, user=user)
    except InterviewSession.DoesNotExist:
        return json_error(request, "NOT_FOUND", "面接セッションが見つかりません。", 404)

    if session.status != InterviewSession.Status.ACTIVE:
        return json_error(request, "INVALID_STATE", "進行中の面接セッションではありません。", 409)

    sdp_offer = request.body.decode("utf-8", errors="replace")
    resume_text = session.resume.extracted_text if session.resume_id and session.resume else None
    try:
        sdp_answer = OpenAIRealtimeService().create_call_answer(
            sdp_offer,
            job_role=session.job_role,
            resume_text=resume_text,
        )
    except AIServiceError as exc:
        return json_error(request, "REALTIME_UNAVAILABLE", str(exc), 503)

    log_audit_event(
        action_type="realtime_call",
        target_type="interview_session",
        target_id=session.session_id,
        user=user,
        metadata={"model": "gpt-realtime-2"},
    )
    return HttpResponse(sdp_answer, content_type="application/sdp", status=201)


@require_http_methods(["GET", "POST"])
@require_principal
def session_reflection(request: HttpRequest, session_id: str):
    user = _get_user(request)
    try:
        session = InterviewSession.objects.select_related("reflection").get(session_id=session_id, user=user)
    except InterviewSession.DoesNotExist:
        return json_error(request, "NOT_FOUND", "面接セッションが見つかりません。", 404)

    if request.method == "GET":
        if not hasattr(session, "reflection"):
            return json_error(request, "NOT_FOUND", "振り返りが見つかりません。", 404)
        reflection = session.reflection
    else:
        try:
            reflection = generate_reflection(session)
        except ValueError as exc:
            return json_error(request, "INVALID_STATE", str(exc), 409)
        log_audit_event(
            action_type="generate_reflection",
            target_type="interview_session",
            target_id=session.session_id,
            user=user,
            metadata={"ai_mode": reflection.ai_mode},
        )

    return json_success(
        request,
        {
            "reflection_id": reflection.reflection_id,
            "strengths": reflection.strengths.splitlines() if reflection.strengths else [],
            "improvements": reflection.improvements.splitlines() if reflection.improvements else [],
            "advice": reflection.advice,
            "ai_mode": reflection.ai_mode,
            "created_at": reflection.created_at.isoformat(),
        },
    )
