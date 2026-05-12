from __future__ import annotations

import json

from django.http import HttpRequest
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from apps.common.audit import log_audit_event
from apps.common.auth import require_principal
from apps.common.responses import json_error, json_success
from .models import AppUser, UserProfile


@require_POST
def demo_login(request: HttpRequest):
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except json.JSONDecodeError:
        return json_error(request, "INVALID_REQUEST", "JSON を解釈できません。", 400)

    demo_user_id = payload.get("demo_user_id")
    name = payload.get("name")
    if not demo_user_id or not name:
        return json_error(request, "INVALID_REQUEST", "demo_user_id と name は必須です。", 400)

    user, _ = AppUser.objects.get_or_create(
        user_id=demo_user_id,
        defaults={
            "name": name,
            "auth_provider": AppUser.AuthProvider.DEMO,
            "role": AppUser.Role.USER,
        },
    )
    log_audit_event(
        action_type="demo_login",
        target_type="user",
        target_id=user.user_id,
        user=user,
        metadata={"auth_provider": user.auth_provider},
    )
    return json_success(
        request,
        {
            "user": {
                "user_id": user.user_id,
                "name": user.name,
                "email": user.email,
                "phone_number": user.phone_number,
                "auth_provider": user.auth_provider,
                "roles": [user.role],
            },
            "token_type": "demo",
            "access_token": user.user_id,
        },
    )


@require_GET
@require_principal
def me(request: HttpRequest):
    principal = request.principal
    user = AppUser.objects.get(user_id=principal.user_id)
    return json_success(
        request,
        {
            "user_id": user.user_id,
            "name": user.name,
            "email": user.email,
            "phone_number": user.phone_number,
            "auth_provider": user.auth_provider,
            "roles": [user.role],
            "credit_balance_minutes": getattr(getattr(user, "credit_balance", None), "available_minutes", 0),
        },
    )


@require_http_methods(["POST"])
@require_principal
def logout(request: HttpRequest):
    return json_success(request, {"message": "logged out"})


@require_http_methods(["GET", "PATCH"])
@require_principal
def user_profile(request: HttpRequest):
    user = AppUser.objects.get(user_id=request.principal.user_id)
    profile, _ = UserProfile.objects.get_or_create(
        user=user,
        defaults={"user_profile_id": f"profile_{user.user_id}"},
    )

    if request.method == "PATCH":
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except json.JSONDecodeError:
            return json_error(request, "INVALID_REQUEST", "JSON を解釈できません。", 400)

        if "name" in payload:
            user.name = payload["name"]
        if "email" in payload:
            user.email = payload["email"]
        if "phone_number" in payload:
            user.phone_number = payload["phone_number"]
        if "display_name" in payload:
            profile.display_name = payload["display_name"]
        if "target_job_role" in payload:
            profile.target_job_role = payload["target_job_role"]
        if "interview_goal" in payload:
            profile.interview_goal = payload["interview_goal"]

        try:
            user.full_clean()
            profile.full_clean()
            user.save()
            profile.save()
            log_audit_event(
                action_type="update_profile",
                target_type="user_profile",
                target_id=profile.user_profile_id,
                user=user,
                metadata={"updated_fields": sorted(payload.keys())},
            )
        except Exception as exc:  # noqa: BLE001
            return json_error(request, "INVALID_REQUEST", str(exc), 400)

    return json_success(
        request,
        {
            "user_id": user.user_id,
            "name": user.name,
            "email": user.email,
            "phone_number": user.phone_number,
            "auth_provider": user.auth_provider,
            "roles": [user.role],
            "display_name": profile.display_name,
            "target_job_role": profile.target_job_role,
            "interview_goal": profile.interview_goal,
        },
    )
