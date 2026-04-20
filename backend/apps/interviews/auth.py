from django.conf import settings
from django.contrib.auth.models import User
from django.http import HttpRequest
from django.db import IntegrityError
from django.utils import timezone
from functools import lru_cache
import os

from apps.users.models import UserProfile


def cognito_issuer() -> str:
    configured = os.getenv("COGNITO_ISSUER")
    if configured:
        return configured.rstrip("/")
    return f"https://cognito-idp.{os.environ['COGNITO_REGION']}.amazonaws.com/{os.environ['COGNITO_USER_POOL_ID']}"


@lru_cache(maxsize=4)
def jwks_client(issuer: str):
    import jwt

    return jwt.PyJWKClient(f"{issuer}/.well-known/jwks.json")


def get_bearer_token(request: HttpRequest) -> str:
    header = request.headers.get("Authorization", "")
    prefix = "Bearer "
    if not header.startswith(prefix):
        raise PermissionError("Authorization bearer token is required.")
    return header[len(prefix) :].strip()


def get_cognito_user(request: HttpRequest) -> User:
    import jwt

    token = get_bearer_token(request)
    issuer = cognito_issuer()
    client_id = os.environ["COGNITO_APP_CLIENT_ID"]
    signing_key = jwks_client(issuer).get_signing_key_from_jwt(token)
    claims = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=client_id,
        issuer=issuer,
        options={"require": ["exp", "iat", "iss", "sub", "aud"]},
    )

    if claims.get("token_use") != "id":
        raise PermissionError("Cognito ID token is required.")
    subject = claims["sub"]
    email = claims.get("email", "")
    name = claims.get("name") or claims.get("cognito:username") or email or subject
    phone = claims.get("phone_number")

    user, _ = User.objects.get_or_create(username=subject, defaults={"email": email, "first_name": name})
    updated_fields = []
    if email and user.email != email:
        user.email = email
        updated_fields.append("email")
    if name and user.first_name != name:
        user.first_name = name
        updated_fields.append("first_name")
    if updated_fields:
        user.save(update_fields=updated_fields)

    try:
        profile, _ = UserProfile.objects.get_or_create(
            user=user,
            defaults={"phone_number": phone or None, "display_name": name},
        )
    except IntegrityError as exc:
        raise PermissionError("Phone number is already registered.") from exc

    profile_updates = []
    if phone and claims.get("phone_number_verified") is True and profile.phone_number != phone:
        profile.phone_number = phone
        profile_updates.append("phone_number")
    if phone and claims.get("phone_number_verified") is True and profile.phone_verified_at is None:
        from django.utils import timezone

        profile.phone_verified_at = timezone.now()
        profile_updates.append("phone_verified_at")
    if profile.display_name != name:
        profile.display_name = name
        profile_updates.append("display_name")
    if profile_updates:
        try:
            profile.save(update_fields=profile_updates)
        except IntegrityError as exc:
            raise PermissionError("Phone number is already registered.") from exc
    return user


def get_request_user(request: HttpRequest) -> User:
    if settings.AUTH_MODE == "demo":
        email = request.headers.get("X-Demo-User", "demo@example.com")
        name = request.headers.get("X-Demo-Name", "面接 太郎")
        phone = request.headers.get("X-Demo-Phone", "+810000000000")
        user, _ = User.objects.get_or_create(username=email, defaults={"email": email, "first_name": name})
        UserProfile.objects.get_or_create(
            user=user,
            defaults={"phone_number": phone, "display_name": name, "phone_verified_at": timezone.now()},
        )
        return user
    if settings.AUTH_MODE == "cognito":
        return get_cognito_user(request)
    raise PermissionError("Unsupported AUTH_MODE.")
