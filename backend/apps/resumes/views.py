from __future__ import annotations

from django.http import HttpRequest
from django.db import transaction
from django.views.decorators.http import require_http_methods

from apps.common.audit import log_audit_event
from apps.common.auth import require_principal
from apps.common.responses import json_error, json_success
from apps.users.models import AppUser
from .models import ResumeFile
from .services import (
    MAX_ACTIVE_RESUME_FILES_PER_USER,
    MAX_RESUME_FILE_SIZE_BYTES,
    delete_resume_file,
    extract_resume_text,
    generate_resume_id,
    upload_resume_file,
    validate_resume_file,
)


def _serialize_resume(resume: ResumeFile) -> dict:
    return {
        "resume_id": resume.resume_id,
        "title": resume.title,
        "file_name": resume.file_name,
        "file_path": resume.file_path,
        "content_type": resume.content_type,
        "file_size": resume.file_size,
        "has_extracted_text": bool(resume.extracted_text.strip()),
        "extracted_text_preview": resume.extracted_text[:240],
        "uploaded_at": resume.uploaded_at.isoformat(),
        "deleted_at": resume.deleted_at.isoformat() if resume.deleted_at else None,
    }


@require_http_methods(["GET", "POST"])
@require_principal
def resumes(request: HttpRequest):
    if request.method == "GET":
        resumes_qs = ResumeFile.objects.filter(
            user_id=request.principal.user_id,
            deleted_at__isnull=True,
        ).order_by("-uploaded_at")
        return json_success(request, [_serialize_resume(resume) for resume in resumes_qs])

    active_resume_count = ResumeFile.objects.filter(
        user_id=request.principal.user_id,
        deleted_at__isnull=True,
    ).count()
    if active_resume_count >= MAX_ACTIVE_RESUME_FILES_PER_USER:
        return json_error(
            request,
            "RESUME_LIMIT_EXCEEDED",
            f"履歴書・職務経歴書は{MAX_ACTIVE_RESUME_FILES_PER_USER}件まで登録できます。",
            400,
        )

    uploaded_file = request.FILES.get("file")
    if uploaded_file is None:
        return json_error(request, "INVALID_REQUEST", "file は必須です。", 400)

    try:
        validate_resume_file(uploaded_file)
    except ValueError as exc:
        error_code = "FILE_TOO_LARGE" if uploaded_file.size > MAX_RESUME_FILE_SIZE_BYTES else "INVALID_FILE_TYPE"
        return json_error(request, error_code, str(exc), 400)

    resume_id = generate_resume_id()
    extracted_text = extract_resume_text(uploaded_file)
    try:
        file_path = upload_resume_file(request.principal.user_id, resume_id, uploaded_file)
    except Exception:  # noqa: BLE001
        return json_error(request, "S3_UPLOAD_FAILED", "S3 への保存に失敗しました。", 503)

    with transaction.atomic():
        user = AppUser.objects.select_for_update().get(user_id=request.principal.user_id)
        active_resume_count = ResumeFile.objects.filter(
            user_id=request.principal.user_id,
            deleted_at__isnull=True,
        ).count()
        if active_resume_count >= MAX_ACTIVE_RESUME_FILES_PER_USER:
            try:
                delete_resume_file(file_path)
            except Exception:  # noqa: BLE001
                pass
            return json_error(
                request,
                "RESUME_LIMIT_EXCEEDED",
                f"履歴書・職務経歴書は{MAX_ACTIVE_RESUME_FILES_PER_USER}件まで登録できます。",
                400,
            )

        resume = ResumeFile.objects.create(
            resume_id=resume_id,
            user_id=request.principal.user_id,
            title=request.POST.get("title"),
            file_name=uploaded_file.name,
            file_path=file_path,
            content_type=uploaded_file.content_type,
            file_size=uploaded_file.size,
            extracted_text=extracted_text,
        )
        log_audit_event(
            action_type="upload",
            target_type="resume",
            target_id=resume.resume_id,
            user=user,
            metadata={"file_name": resume.file_name},
        )
    return json_success(request, _serialize_resume(resume), status=201)


@require_http_methods(["GET"])
@require_principal
def resume_detail(request: HttpRequest, resume_id: str):
    try:
        resume = ResumeFile.objects.get(resume_id=resume_id, user_id=request.principal.user_id)
    except ResumeFile.DoesNotExist:
        return json_error(request, "NOT_FOUND", "RESUME が見つかりません。", 404)
    return json_success(request, _serialize_resume(resume))


@require_http_methods(["DELETE"])
@require_principal
def resume_delete(request: HttpRequest, resume_id: str):
    try:
        resume = ResumeFile.objects.get(resume_id=resume_id, user_id=request.principal.user_id, deleted_at__isnull=True)
    except ResumeFile.DoesNotExist:
        return json_error(request, "NOT_FOUND", "RESUME が見つかりません。", 404)

    try:
        delete_resume_file(resume.file_path)
    except Exception:  # noqa: BLE001
        return json_error(request, "STORAGE_DELETE_FAILED", "保存済みファイルの削除に失敗しました。", 503)

    from django.utils import timezone
    resume.deleted_at = timezone.now()
    resume.save(update_fields=["deleted_at"])
    user = AppUser.objects.get(user_id=request.principal.user_id)
    log_audit_event(
        action_type="delete",
        target_type="resume",
        target_id=resume.resume_id,
        user=user,
        metadata={"deleted": True},
    )
    return json_success(request, {"message": "deleted"})
