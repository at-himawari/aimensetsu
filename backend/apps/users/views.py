from __future__ import annotations

import json
import os

from django.http import HttpRequest
from django.views.decorators.http import require_GET, require_http_methods, require_POST
import boto3

from apps.common.audit import log_audit_event
from apps.common.auth import require_principal
from apps.common.responses import json_error, json_success
from .models import AppUser, UserProfile


PLACEHOLDER_PHONE_NUMBER = "+819012345678"


def _normalize_japanese_phone_number(phone_number: str) -> str:
    normalized_digits = (
        str(phone_number or "")
        .strip()
        .translate(str.maketrans("０１２３４５６７８９", "0123456789"))
        .replace("-", "")
        .replace("ー", "")
        .replace("−", "")
        .replace(" ", "")
        .replace("　", "")
        .replace("(", "")
        .replace(")", "")
        .replace("（", "")
        .replace("）", "")
    )
    if normalized_digits.startswith("+81") and normalized_digits[3:].isdigit() and len(normalized_digits[3:]) in (9, 10):
        return normalized_digits
    if normalized_digits.startswith("0") and normalized_digits.isdigit() and len(normalized_digits) in (10, 11):
        return f"+81{normalized_digits[1:]}"
    raise ValueError("電話番号は国内の番号で入力してください。例: 090-1234-5678")


def _cognito_user_belongs_to_principal(cognito_user: dict, principal) -> bool:
    attributes = {
        item.get("Name"): item.get("Value")
        for item in cognito_user.get("Attributes", [])
    }
    return (
        attributes.get("sub") == principal.user_id
        or attributes.get("email") == principal.email
        or cognito_user.get("Username") in {principal.user_id, principal.email}
    )


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

    user, created = AppUser.objects.get_or_create(
        user_id=demo_user_id,
        defaults={
            "name": name,
            "auth_provider": AppUser.AuthProvider.DEMO,
            "role": AppUser.Role.USER,
        },
    )
    if created:
        from apps.billing.services import grant_initial_free_credits

        grant_initial_free_credits(user)
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


@require_POST
@require_principal
def prepare_phone_number_update(request: HttpRequest):
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except json.JSONDecodeError:
        return json_error(request, "INVALID_REQUEST", "JSON を解釈できません。", 400)

    try:
        phone_number = _normalize_japanese_phone_number(payload.get("phone_number", ""))
    except ValueError as exc:
        return json_error(request, "INVALID_REQUEST", str(exc), 400)

    if phone_number == PLACEHOLDER_PHONE_NUMBER:
        return json_error(request, "PHONE_NUMBER_UNAVAILABLE", "この電話番号は利用できません。", 409)

    principal = request.principal
    existing_user = AppUser.objects.filter(phone_number=phone_number).exclude(user_id=principal.user_id).first()
    if existing_user:
        return json_error(request, "PHONE_NUMBER_ALREADY_EXISTS", "この電話番号はすでに登録されています。", 409)

    if os.getenv("AUTH_MODE", "demo") == "cognito":
        user_pool_id = os.getenv("COGNITO_USER_POOL_ID")
        region = os.getenv("COGNITO_REGION")
        if not user_pool_id or not region:
            return json_error(request, "INVALID_AUTH_SETTINGS", "Cognito設定が不足しています。", 500)
        client = boto3.client("cognito-idp", region_name=region)
        response = client.list_users(
            UserPoolId=user_pool_id,
            Filter=f'phone_number = "{phone_number}"',
            Limit=2,
        )
        duplicate_user = next(
            (
                user
                for user in response.get("Users", [])
                if not _cognito_user_belongs_to_principal(user, principal)
            ),
            None,
        )
        if duplicate_user:
            return json_error(request, "PHONE_NUMBER_ALREADY_EXISTS", "この電話番号はすでに登録されています。", 409)

    return json_success(request, {"phone_number": phone_number})


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
