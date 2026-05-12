from __future__ import annotations

import os
import time
from dataclasses import dataclass

import jwt
from django.http import HttpRequest

from apps.common.auth import AuthenticatedPrincipal, AuthenticationError
from .models import AppUser


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
    if not issuer and region and pool_id:
        issuer = f"https://cognito-idp.{region}.amazonaws.com/{pool_id}"

    return AuthSettings(
        mode=os.getenv("AUTH_MODE", "demo"),
        cognito_user_pool_id=pool_id,
        cognito_region=region,
        cognito_audience=os.getenv("COGNITO_APP_CLIENT_ID"),
        cognito_issuer=issuer,
        jwt_secret=os.getenv("COGNITO_JWT_SECRET"),
        jwt_algorithm=os.getenv("COGNITO_JWT_ALGORITHM", "HS256"),
    )


class DemoAuthAdapter:
    def authenticate(self, request: HttpRequest) -> AuthenticatedPrincipal:
        demo_user_id = request.headers.get("X-Demo-User")
        if not demo_user_id:
            raise AuthenticationError("demo user header is missing")

        user, _ = AppUser.objects.get_or_create(
            user_id=demo_user_id,
            defaults={
                "name": f"Demo {demo_user_id}",
                "auth_provider": AppUser.AuthProvider.DEMO,
                "role": AppUser.Role.USER,
            },
        )
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

        if not self.settings.jwt_secret:
            raise AuthenticationError("jwt secret is not configured")

        payload = jwt.decode(
            token,
            self.settings.jwt_secret,
            algorithms=[self.settings.jwt_algorithm],
            audience=self.settings.cognito_audience,
            issuer=self.settings.cognito_issuer,
        )
        exp = payload.get("exp")
        if exp is not None and exp < int(time.time()):
            raise AuthenticationError("token expired")

        subject = payload.get("sub")
        if not subject:
            raise AuthenticationError("token subject is missing")

        email = payload.get("email")
        role = AppUser.Role.ADMIN if "admin" in payload.get("cognito:groups", []) else AppUser.Role.USER
        user, _ = AppUser.objects.get_or_create(
            user_id=subject,
            defaults={
                "name": payload.get("name") or email or subject,
                "email": email,
                "auth_provider": AppUser.AuthProvider.COGNITO,
                "external_subject": subject,
                "role": role,
            },
        )
        return AuthenticatedPrincipal(
            user_id=user.user_id,
            email=user.email,
            auth_provider=user.auth_provider,
            roles=[user.role],
        )


def build_auth_adapter():
    settings = load_auth_settings()
    if settings.mode == "demo":
        return DemoAuthAdapter()
    return CognitoJwtAuthAdapter(settings)
