import json
import hashlib
import hmac
import random
import re

from django.conf import settings
from django.contrib.auth.models import User
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_POST
import os

from apps.integrations.ai import get_coach
from apps.integrations.billing import create_checkout_session
from apps.integrations.sms import get_sms_sender
from apps.interviews.auth import get_request_user
from apps.interviews.models import FeedbackReport, PracticeMessage, PracticeSession, QuotaLedger, UploadedDocument
from apps.users.models import PhoneVerificationCode, UserProfile


def payload(request: HttpRequest) -> dict:
    if not request.body:
        return {}
    return json.loads(request.body.decode("utf-8"))


def quota_remaining(user: User) -> int:
    credits = sum(entry.minutes for entry in user.quota_entries.filter(kind=QuotaLedger.CREDIT))
    debits = sum(entry.minutes for entry in user.quota_entries.filter(kind=QuotaLedger.DEBIT))
    if credits == 0:
        credits = settings.PRACTICE_BLOCK_MINUTES
    return max(credits - debits, 0)


def serialize_session(session: PracticeSession) -> dict:
    return {
        "id": session.id,
        "title": session.title,
        "role": session.role,
        "minutesUsed": session.minutes_used,
        "createdAt": session.created_at.isoformat(),
        "updatedAt": session.updated_at.isoformat(),
        "messageCount": session.messages.count(),
        "documentCount": session.documents.count(),
    }


def require_user(request: HttpRequest) -> User:
    try:
        return get_request_user(request)
    except PermissionError as exc:
        raise PermissionError(str(exc))


def unauthorized(message: str) -> JsonResponse:
    return JsonResponse({"error": "unauthorized", "message": message}, status=401)


def phone_required() -> JsonResponse:
    return JsonResponse(
        {"error": "phone_verification_required", "message": "電話番号認証を完了してください。"},
        status=403,
    )


def require_phone_verified(user: User) -> None:
    if not user.profile.is_phone_verified:
        raise PermissionError("phone_verification_required")


def normalize_jp_phone_number(value: str) -> str:
    compact = re.sub(r"[\s\-()]", "", value)
    if compact.startswith("+"):
        normalized = compact
    elif compact.startswith("0"):
        normalized = f"+81{compact[1:]}"
    else:
        normalized = compact
    if not re.fullmatch(r"\+[1-9]\d{7,14}", normalized):
        raise ValueError("電話番号はE.164形式、または09012345678のような国内形式で入力してください。")
    return normalized


def hash_verification_code(code: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode("utf-8"), code.encode("utf-8"), hashlib.sha256).hexdigest()


@require_http_methods(["GET"])
def me(request: HttpRequest) -> JsonResponse:
    try:
        user = require_user(request)
    except PermissionError as exc:
        return unauthorized(str(exc))
    profile = user.profile
    return JsonResponse(
        {
            "email": user.email,
            "name": profile.display_name,
            "phoneNumber": profile.phone_number,
            "phoneVerified": profile.is_phone_verified,
            "requiresPhoneVerification": not profile.is_phone_verified,
            "quotaMinutes": quota_remaining(user),
            "blockPriceJpy": settings.PRACTICE_BLOCK_PRICE_JPY,
            "blockMinutes": settings.PRACTICE_BLOCK_MINUTES,
        }
    )


@csrf_exempt
@require_http_methods(["GET", "POST"])
def sessions(request: HttpRequest) -> JsonResponse:
    try:
        user = require_user(request)
    except PermissionError as exc:
        return unauthorized(str(exc))
    if request.method == "GET":
        return JsonResponse({"sessions": [serialize_session(item) for item in user.practice_sessions.all()]})
    try:
        require_phone_verified(user)
    except PermissionError:
        return phone_required()

    data = payload(request)
    session = PracticeSession.objects.create(
        user=user,
        title=data.get("title") or "新しい面接練習",
        role=data.get("role", ""),
    )
    PracticeMessage.objects.create(session=session, role=PracticeMessage.ASSISTANT, content="今日はよろしくお願いします。まず自己紹介をお願いします。")
    return JsonResponse({"session": serialize_session(session)}, status=201)


@csrf_exempt
@require_http_methods(["DELETE"])
def session_detail(request: HttpRequest, session_id: int) -> JsonResponse:
    try:
        user = require_user(request)
    except PermissionError as exc:
        return unauthorized(str(exc))
    session = get_object_or_404(PracticeSession, id=session_id, user=user)
    session.delete()
    return JsonResponse({"ok": True})


@csrf_exempt
@require_POST
def upload_document(request: HttpRequest, session_id: int) -> JsonResponse:
    try:
        user = require_user(request)
    except PermissionError as exc:
        return unauthorized(str(exc))
    try:
        require_phone_verified(user)
    except PermissionError:
        return phone_required()
    session = get_object_or_404(PracticeSession, id=session_id, user=user)
    uploaded = request.FILES["file"]
    text = uploaded.read().decode("utf-8", errors="ignore")[:12000]
    uploaded.seek(0)
    document = UploadedDocument.objects.create(session=session, file=uploaded, extracted_text=text)
    return JsonResponse({"id": document.id, "filename": uploaded.name, "chars": len(text)}, status=201)


@csrf_exempt
@require_POST
def add_message(request: HttpRequest, session_id: int) -> JsonResponse:
    try:
        user = require_user(request)
    except PermissionError as exc:
        return unauthorized(str(exc))
    try:
        require_phone_verified(user)
    except PermissionError:
        return phone_required()
    session = get_object_or_404(PracticeSession, id=session_id, user=user)
    if quota_remaining(user) <= 0:
        return JsonResponse({"error": "quota_required", "message": "練習時間を追加してください。"}, status=402)

    data = payload(request)
    PracticeMessage.objects.create(session=session, role=PracticeMessage.USER, content=data["content"])
    transcript = [{"role": item.role, "content": item.content} for item in session.messages.all()]
    document_text = "\n".join(item.extracted_text for item in session.documents.all())
    reply = get_coach().ask(transcript, document_text, session.role)
    message = PracticeMessage.objects.create(session=session, role=PracticeMessage.ASSISTANT, content=reply.message)
    session.minutes_used += max(1, int(data.get("minutes", 1)))
    session.save(update_fields=["minutes_used", "updated_at"])
    QuotaLedger.objects.create(user=user, kind=QuotaLedger.DEBIT, minutes=max(1, int(data.get("minutes", 1))), amount_jpy=0)
    return JsonResponse({"message": {"id": message.id, "role": message.role, "content": message.content}, "quotaMinutes": quota_remaining(user)})


@csrf_exempt
@require_POST
def feedback(request: HttpRequest, session_id: int) -> JsonResponse:
    try:
        user = require_user(request)
    except PermissionError as exc:
        return unauthorized(str(exc))
    try:
        require_phone_verified(user)
    except PermissionError:
        return phone_required()
    session = get_object_or_404(PracticeSession, id=session_id, user=user)
    transcript = [{"role": item.role, "content": item.content} for item in session.messages.all()]
    document_text = "\n".join(item.extracted_text for item in session.documents.all())
    reply = get_coach().ask(transcript, document_text, session.role)
    report, _ = FeedbackReport.objects.update_or_create(
        session=session,
        defaults={
            "strengths": reply.strengths,
            "improvements": reply.improvements,
            "next_questions": reply.next_questions,
            "summary": reply.summary,
        },
    )
    return JsonResponse(
        {
            "summary": report.summary,
            "strengths": report.strengths,
            "improvements": report.improvements,
            "nextQuestions": report.next_questions,
        }
    )


@csrf_exempt
@require_POST
def create_checkout(request: HttpRequest) -> JsonResponse:
    try:
        user = require_user(request)
    except PermissionError as exc:
        return unauthorized(str(exc))
    try:
        require_phone_verified(user)
    except PermissionError:
        return phone_required()
    return JsonResponse(create_checkout_session(user))


@csrf_exempt
@require_POST
def start_phone_verification(request: HttpRequest) -> JsonResponse:
    try:
        user = require_user(request)
    except PermissionError as exc:
        return unauthorized(str(exc))

    data = payload(request)
    try:
        phone_number = normalize_jp_phone_number(data.get("phoneNumber", ""))
    except ValueError as exc:
        return JsonResponse({"error": "invalid_phone_number", "message": str(exc)}, status=400)

    if UserProfile.objects.filter(phone_number=phone_number).exclude(user=user).exists():
        return JsonResponse({"error": "phone_number_taken", "message": "この電話番号はすでに登録されています。"}, status=409)

    code = f"{random.SystemRandom().randint(0, 999999):06d}"
    PhoneVerificationCode.objects.filter(user=user, phone_number=phone_number, consumed_at__isnull=True).update(
        consumed_at=timezone.now()
    )
    PhoneVerificationCode.objects.create(
        user=user,
        phone_number=phone_number,
        code_hash=hash_verification_code(code),
        expires_at=timezone.now() + timezone.timedelta(minutes=10),
    )
    result = get_sms_sender().send_verification_code(phone_number, code)
    response = {"phoneNumber": phone_number, "expiresInSeconds": 600, "delivery": result["mode"]}
    if result["mode"] == "local":
        response["verificationCode"] = code
    return JsonResponse(response, status=201)


@csrf_exempt
@require_POST
def verify_phone(request: HttpRequest) -> JsonResponse:
    try:
        user = require_user(request)
    except PermissionError as exc:
        return unauthorized(str(exc))

    data = payload(request)
    try:
        phone_number = normalize_jp_phone_number(data.get("phoneNumber", ""))
    except ValueError as exc:
        return JsonResponse({"error": "invalid_phone_number", "message": str(exc)}, status=400)

    code = str(data.get("code", "")).strip()
    verification = (
        PhoneVerificationCode.objects.filter(user=user, phone_number=phone_number, consumed_at__isnull=True)
        .order_by("-created_at")
        .first()
    )
    if not verification or not verification.is_active:
        return JsonResponse({"error": "verification_expired", "message": "確認コードの有効期限が切れています。"}, status=400)
    if not hmac.compare_digest(verification.code_hash, hash_verification_code(code)):
        return JsonResponse({"error": "invalid_verification_code", "message": "確認コードが正しくありません。"}, status=400)
    if UserProfile.objects.filter(phone_number=phone_number).exclude(user=user).exists():
        return JsonResponse({"error": "phone_number_taken", "message": "この電話番号はすでに登録されています。"}, status=409)

    verification.consumed_at = timezone.now()
    verification.save(update_fields=["consumed_at"])
    user.profile.mark_phone_verified(phone_number)
    return JsonResponse({"phoneNumber": phone_number, "phoneVerified": True})


@csrf_exempt
@require_POST
def stripe_webhook(request: HttpRequest) -> HttpResponse:
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    try:
        if webhook_secret:
            import stripe

            data = stripe.Webhook.construct_event(
                request.body,
                request.headers.get("Stripe-Signature", ""),
                webhook_secret,
            )
        else:
            data = json.loads(request.body.decode("utf-8"))
    except (ValueError, json.JSONDecodeError):
        return HttpResponse(status=400)

    if data.get("type") == "checkout.session.completed":
        session = data["data"]["object"]
        user_id = session.get("client_reference_id") or session.get("metadata", {}).get("user_id")
        stripe_session_id = session.get("id", "")
        if user_id:
            user = User.objects.get(id=user_id)
            QuotaLedger.objects.get_or_create(
                user=user,
                kind=QuotaLedger.CREDIT,
                stripe_session_id=stripe_session_id,
                defaults={"minutes": settings.PRACTICE_BLOCK_MINUTES, "amount_jpy": settings.PRACTICE_BLOCK_PRICE_JPY},
            )
    return HttpResponse(status=200)
