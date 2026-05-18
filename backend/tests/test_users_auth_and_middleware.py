from __future__ import annotations

import os
import time
from unittest.mock import MagicMock, patch

import jwt
from django.test import RequestFactory, TestCase

from apps.billing.models import CreditTransaction
from apps.common.auth import AuthenticatedPrincipal, AuthenticationError, require_role
from apps.users.auth import CognitoJwtAuthAdapter, DemoAuthAdapter, build_auth_adapter, load_auth_settings
from apps.users.middleware import AuthenticationMiddleware
from apps.users.models import AppUser


class UsersAuthAndMiddlewareTestCase(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        os.environ.pop("AUTH_MODE", None)
        os.environ.pop("COGNITO_REGION", None)
        os.environ.pop("COGNITO_USER_POOL_ID", None)
        os.environ.pop("COGNITO_ISSUER", None)
        os.environ.pop("COGNITO_APP_CLIENT_ID", None)
        os.environ.pop("COGNITO_JWT_SECRET", None)

    def test_load_auth_settings_builds_issuer(self):
        os.environ["COGNITO_REGION"] = "ap-northeast-1"
        os.environ["COGNITO_USER_POOL_ID"] = "pool"
        settings = load_auth_settings()
        self.assertIn("pool", settings.cognito_issuer or "")

    def test_demo_auth_adapter_missing_header(self):
        with self.assertRaises(AuthenticationError):
            DemoAuthAdapter().authenticate(self.factory.get("/"))

    def test_demo_auth_adapter_creates_user(self):
        request = self.factory.get("/", HTTP_X_DEMO_USER="demo_auth")
        principal = DemoAuthAdapter().authenticate(request)
        self.assertEqual(principal.user_id, "demo_auth")
        user = AppUser.objects.get(user_id="demo_auth")
        self.assertEqual(user.credit_balance.available_minutes, 15)
        self.assertEqual(CreditTransaction.objects.get(user=user).minutes_delta, 15)

    def test_cognito_auth_adapter_missing_token_and_secret(self):
        settings = load_auth_settings()
        adapter = CognitoJwtAuthAdapter(settings)
        with self.assertRaises(AuthenticationError):
            adapter.authenticate(self.factory.get("/"))

        request = self.factory.get("/", HTTP_AUTHORIZATION="Bearer token")
        with self.assertRaises(AuthenticationError):
            adapter.authenticate(request)

    def test_cognito_auth_adapter_validates_payload(self):
        os.environ["AUTH_MODE"] = "cognito"
        os.environ["COGNITO_APP_CLIENT_ID"] = "client"
        os.environ["COGNITO_JWT_SECRET"] = "secret"
        os.environ["COGNITO_ISSUER"] = "issuer"
        token = jwt.encode(
            {
                "sub": "sub_1",
                "email": "user@example.com",
                "name": "User Name",
                "exp": int(time.time()) + 3600,
                "aud": "client",
                "iss": "issuer",
                "cognito:groups": ["admin"],
            },
            "secret",
            algorithm="HS256",
        )
        adapter = CognitoJwtAuthAdapter(load_auth_settings())
        principal = adapter.authenticate(self.factory.get("/", HTTP_AUTHORIZATION=f"Bearer {token}"))
        self.assertEqual(principal.roles, ["admin"])
        user = AppUser.objects.get(user_id="sub_1")
        self.assertEqual(user.credit_balance.available_minutes, 15)
        self.assertEqual(CreditTransaction.objects.get(user=user).minutes_delta, 15)

    def test_cognito_auth_adapter_ignores_duplicate_phone_number(self):
        AppUser.objects.create(
            user_id="existing_user",
            name="Existing User",
            phone_number="+819012345678",
            auth_provider=AppUser.AuthProvider.COGNITO,
            role=AppUser.Role.USER,
        )
        os.environ["AUTH_MODE"] = "cognito"
        os.environ["COGNITO_APP_CLIENT_ID"] = "client"
        os.environ["COGNITO_JWT_SECRET"] = "secret"
        os.environ["COGNITO_ISSUER"] = "issuer"
        token = jwt.encode(
            {
                "sub": "sub_duplicate_phone",
                "email": "duplicate@example.com",
                "name": "Duplicate Phone",
                "phone_number": "+819012345678",
                "token_use": "access",
                "client_id": "client",
                "exp": int(time.time()) + 3600,
                "iss": "issuer",
            },
            "secret",
            algorithm="HS256",
        )

        principal = CognitoJwtAuthAdapter(load_auth_settings()).authenticate(
            self.factory.get("/", HTTP_AUTHORIZATION=f"Bearer {token}")
        )

        self.assertEqual(principal.user_id, "sub_duplicate_phone")
        self.assertIsNone(AppUser.objects.get(user_id="sub_duplicate_phone").phone_number)

    def test_cognito_auth_adapter_rejects_missing_subject(self):
        os.environ["AUTH_MODE"] = "cognito"
        os.environ["COGNITO_APP_CLIENT_ID"] = "client"
        os.environ["COGNITO_JWT_SECRET"] = "secret"
        os.environ["COGNITO_ISSUER"] = "issuer"
        token = jwt.encode(
            {"exp": int(time.time()) + 3600, "aud": "client", "iss": "issuer"},
            "secret",
            algorithm="HS256",
        )
        adapter = CognitoJwtAuthAdapter(load_auth_settings())
        with self.assertRaises(AuthenticationError):
            adapter.authenticate(self.factory.get("/", HTTP_AUTHORIZATION=f"Bearer {token}"))

    def test_build_auth_adapter_switches_by_mode(self):
        os.environ["AUTH_MODE"] = "demo"
        self.assertIsInstance(build_auth_adapter(), DemoAuthAdapter)
        os.environ["AUTH_MODE"] = "cognito"
        self.assertIsInstance(build_auth_adapter(), CognitoJwtAuthAdapter)

    def test_authentication_middleware_sets_principal_and_ignores_failure(self):
        user = AppUser.objects.create(
            user_id="mw_demo",
            name="Middleware User",
            auth_provider=AppUser.AuthProvider.DEMO,
            role=AppUser.Role.USER,
        )
        os.environ["AUTH_MODE"] = "demo"
        middleware = AuthenticationMiddleware(lambda request: request)
        request = self.factory.get("/", HTTP_X_DEMO_USER=user.user_id)
        response = middleware(request)
        self.assertEqual(response.principal.user_id, user.user_id)

        with patch("apps.users.middleware.DemoAuthAdapter") as mocked_adapter:
            mocked_adapter.return_value.authenticate.side_effect = AuthenticationError("bad")
            request = self.factory.get("/", HTTP_X_DEMO_USER=user.user_id)
            response = middleware(request)
            self.assertIsNone(response.principal)

    @patch("apps.users.middleware.CognitoJwtAuthAdapter")
    def test_authentication_middleware_uses_cognito_for_authorization_header(self, mocked_adapter):
        os.environ["AUTH_MODE"] = "demo"
        principal = AuthenticatedPrincipal("cognito_sub", "user@example.com", "cognito", ["user"])
        mocked_adapter.return_value.authenticate.return_value = principal

        middleware = AuthenticationMiddleware(lambda request: request)
        request = self.factory.get("/", HTTP_AUTHORIZATION="Bearer token")
        response = middleware(request)

        self.assertEqual(response.principal, principal)
        mocked_adapter.return_value.authenticate.assert_called_once_with(request)

    def test_require_role_success_path(self):
        @require_role("admin")
        def protected(_request):
            return "ok"

        request = self.factory.get("/")
        request.principal = AuthenticatedPrincipal("u", None, "demo", ["admin"])
        self.assertEqual(protected(request), "ok")
