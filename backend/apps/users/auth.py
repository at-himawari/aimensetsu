from __future__ import annotations

import os
import time
from dataclasses import dataclass

import jwt
from jwt import PyJWKClient
from django.db import IntegrityError
from django.http import HttpRequest

from apps.common.auth import AuthenticatedPrincipal, AuthenticationError
from .models import AppUser


PLACEHOLDER_PHONE_NUMBER = "+819012345678"


@dataclass
class AuthSettings:
    mode: str
    cognito_user_pool_id: str | None
    cognito_region: str | None
    cognito_audience: str | None
    cognito_issuer: str | None
    jwt_secret: str | None
    jwt_algorithm: str


def load_auth_settings() -> AuthSettings:
    region = os.getenv("COGNITO_REGION")
    pool_id = os.getenv("COGNITO_USER_POOL_ID")
    issuer = os.getenv("COGNITO_ISSUER")
    jwt_secret = os.getenv("COGNITO_JWT_SECRET")
    if not issuer and region and pool_id:
        issuer = f"https://cognito-idp.{region}.amazonaws.com/{pool_id}"

    return AuthSettings(
        mode=os.getenv("AUTH_MODE", "demo"),
        cognito_user_pool_id=pool_id,
        cognito_region=region,
        cognito_audience=os.getenv("COGNITO_APP_CLIENT_ID"),
        cognito_issuer=issuer,
        jwt_secret=jwt_secret,
        jwt_algorithm=os.getenv("COGNITO_JWT_ALGORITHM", "HS256" if jwt_secret else "RS256"),
    )


class DemoAuthAdapter:
    def authenticate(self, request: HttpRequest) -> AuthenticatedPrincipal:
        demo_user_id = request.headers.get("X-Demo-User")
        if not demo_user_id:
            raise AuthenticationError("demo user header is missing")

        user, created = AppUser.objects.get_or_create(
            user_id=demo_user_id,
            defaults={
                "name": f"Demo {demo_user_id}",
                "auth_provider": AppUser.AuthProvider.DEMO,
                "role": AppUser.Role.USER,
            },
        )
        if created:
            from apps.billing.services import grant_initial_free_credits

            grant_initial_free_credits(user)
        return AuthenticatedPrincipal(
            user_id=user.user_id,
            email=user.email,
            auth_provider=user.auth_provider,
            roles=[user.role],
        )


class CognitoJwtAuthAdapter:
    def __init__(self, settings: AuthSettings):
        self.settings = settings

    def authenticate(self, request: HttpRequest) -> AuthenticatedPrincipal:
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            raise AuthenticationError("bearer token is missing")

        token = auth_header.removeprefix("Bearer ").strip()
        if not token:
            raise AuthenticationError("bearer token is empty")

        try:
            unverified_payload = jwt.decode(token, options={"verify_signature": False})
        except jwt.PyJWTError as exc:
            raise AuthenticationError(f"invalid cognito token: {exc}") from exc
        token_use = unverified_payload.get("token_use")
        decode_options = {}
        decode_kwargs = {
            "algorithms": [self.settings.jwt_algorithm],
            "issuer": self.settings.cognito_issuer,
        }
        if token_use == "access":
            decode_options["verify_aud"] = False
        else:
            decode_kwargs["audience"] = self.settings.cognito_audience

        try:
            if self.settings.jwt_secret:
                payload = jwt.decode(
                    token,
                    self.settings.jwt_secret,
                    options=decode_options,
                    **decode_kwargs,
                )
            else:
                if not self.settings.cognito_issuer:
                    raise AuthenticationError("cognito issuer is not configured")
                jwks_url = f"{self.settings.cognito_issuer}/.well-known/jwks.json"
                signing_key = PyJWKClient(jwks_url).get_signing_key_from_jwt(token)
                payload = jwt.decode(
                    token,
                    signing_key.key,
                    options=decode_options,
                    **decode_kwargs,
                )
        except jwt.PyJWTError as exc:
            raise AuthenticationError(f"invalid cognito token: {exc}") from exc

        issuer = payload.get("iss")
        if self.settings.cognito_issuer and issuer != self.settings.cognito_issuer:
            raise AuthenticationError("token issuer is invalid")

        if token_use == "access" and self.settings.cognito_audience:
            client_id = payload.get("client_id")
            if client_id != self.settings.cognito_audience:
                raise AuthenticationError("token client id is invalid")
        if token_use != "access" and self.settings.cognito_audience:
            audience = payload.get("aud")
            if audience != self.settings.cognito_audience:
                raise AuthenticationError("token audience is invalid")

        exp = payload.get("exp")
        if exp is not None and exp < int(time.time()):
            raise AuthenticationError("token expired")

        subject = payload.get("sub")
        if not subject:
            raise AuthenticationError("token subject is missing")

        email = payload.get("email")
        phone_number = payload.get("phone_number")
        role = AppUser.Role.ADMIN if "admin" in payload.get("cognito:groups", []) else AppUser.Role.USER
        defaults = {
            "name": payload.get("name") or email or subject,
            "email": email,
            "phone_number": self._safe_phone_number(phone_number, subject),
            "auth_provider": AppUser.AuthProvider.COGNITO,
            "external_subject": subject,
            "role": role,
        }
        try:
            user, created = AppUser.objects.get_or_create(user_id=subject, defaults=defaults)
        except IntegrityError:
            defaults["phone_number"] = None
            user, created = AppUser.objects.get_or_create(user_id=subject, defaults=defaults)
        if created:
            from apps.billing.services import grant_initial_free_credits

            grant_initial_free_credits(user)
        return AuthenticatedPrincipal(
            user_id=user.user_id,
            email=user.email,
            auth_provider=user.auth_provider,
            roles=[user.role],
        )

    def _safe_phone_number(self, phone_number: str | None, subject: str) -> str | None:
        if not phone_number or phone_number == PLACEHOLDER_PHONE_NUMBER:
            return None
        if AppUser.objects.filter(phone_number=phone_number).exclude(user_id=subject).exists():
            return None
        return phone_number


def build_auth_adapter():
    settings = load_auth_settings()
    if settings.mode == "demo":
        return DemoAuthAdapter()
    return CognitoJwtAuthAdapter(settings)
