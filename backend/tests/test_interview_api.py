import json
from unittest.mock import Mock, patch

from django.test import Client, TestCase, override_settings

from apps.users.models import PhoneVerificationCode, UserProfile
from apps.interviews.models import PracticeSession, QuotaLedger


class InterviewApiTests(TestCase):
    def setUp(self) -> None:
        self.client = Client(headers={"X-Demo-User": "demo@example.com"})

    def test_creates_session_and_initial_message(self) -> None:
        response = self.client.post(
            "/api/sessions/",
            data=json.dumps({"title": "一次面接", "role": "エンジニア"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        session = PracticeSession.objects.get()
        self.assertEqual(session.messages.count(), 1)
        self.assertEqual(response.json()["session"]["title"], "一次面接")

    def test_message_consumes_quota_and_returns_ai_reply(self) -> None:
        created = self.client.post(
            "/api/sessions/",
            data=json.dumps({"title": "一次面接", "role": "エンジニア"}),
            content_type="application/json",
        ).json()

        response = self.client.post(
            f"/api/sessions/{created['session']['id']}/messages/",
            data=json.dumps({"content": "私は業務改善を担当しました。", "minutes": 3}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["quotaMinutes"], 27)
        self.assertEqual(QuotaLedger.objects.filter(kind=QuotaLedger.DEBIT).count(), 1)

    def test_deletes_own_session(self) -> None:
        created = self.client.post(
            "/api/sessions/",
            data=json.dumps({"title": "削除対象"}),
            content_type="application/json",
        ).json()

        response = self.client.delete(f"/api/sessions/{created['session']['id']}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(PracticeSession.objects.count(), 0)

    def test_checkout_webhook_adds_credit(self) -> None:
        self.client.get("/api/me/")
        payload = {
            "type": "checkout.session.completed",
            "data": {"object": {"id": "cs_test_123", "client_reference_id": "1"}},
        }

        response = self.client.post("/api/billing/webhook/", data=json.dumps(payload), content_type="application/json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(QuotaLedger.objects.filter(kind=QuotaLedger.CREDIT, stripe_session_id="cs_test_123").count(), 1)

    def test_phone_verification_flow(self) -> None:
        client = Client(headers={"X-Demo-User": "phone-flow@example.com", "X-Demo-Phone": "+810000000099"})
        response = client.post(
            "/api/phone/start/",
            data=json.dumps({"phoneNumber": "09012345678"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        code = response.json()["verificationCode"]
        verify_response = client.post(
            "/api/phone/verify/",
            data=json.dumps({"phoneNumber": "+819012345678", "code": code}),
            content_type="application/json",
        )

        self.assertEqual(verify_response.status_code, 200)
        profile = UserProfile.objects.get(user__username="phone-flow@example.com")
        self.assertEqual(profile.phone_number, "+819012345678")
        self.assertTrue(profile.is_phone_verified)
        self.assertEqual(PhoneVerificationCode.objects.filter(consumed_at__isnull=False).count(), 1)

    def test_unverified_phone_cannot_create_session(self) -> None:
        client = Client(headers={"X-Demo-User": "needs-phone@example.com", "X-Demo-Phone": "+810000000098"})
        client.get("/api/me/")
        profile = UserProfile.objects.get(user__username="needs-phone@example.com")
        profile.phone_verified_at = None
        profile.phone_number = None
        profile.save(update_fields=["phone_verified_at", "phone_number"])

        response = client.post(
            "/api/sessions/",
            data=json.dumps({"title": "未認証"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"], "phone_verification_required")


class CognitoAuthTests(TestCase):
    @override_settings(AUTH_MODE="cognito")
    @patch.dict(
        "os.environ",
        {
            "COGNITO_REGION": "ap-northeast-1",
            "COGNITO_USER_POOL_ID": "ap-northeast-1_example",
            "COGNITO_APP_CLIENT_ID": "client123",
        },
    )
    def test_requires_bearer_token(self) -> None:
        response = Client().get("/api/me/")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"], "unauthorized")

    @override_settings(AUTH_MODE="cognito")
    @patch.dict(
        "os.environ",
        {
            "COGNITO_REGION": "ap-northeast-1",
            "COGNITO_USER_POOL_ID": "ap-northeast-1_example",
            "COGNITO_APP_CLIENT_ID": "client123",
        },
    )
    @patch("apps.interviews.auth.jwks_client")
    @patch("jwt.decode")
    def test_creates_user_from_verified_cognito_id_token(self, decode: Mock, jwks_client: Mock) -> None:
        jwks_client.return_value.get_signing_key_from_jwt.return_value.key = "public-key"
        decode.return_value = {
            "sub": "user-sub-1",
            "aud": "client123",
            "iss": "https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_example",
            "iat": 1,
            "exp": 9999999999,
            "token_use": "id",
            "email": "user@example.com",
            "name": "面接 花子",
        }

        response = Client(headers={"Authorization": "Bearer token"}).get("/api/me/")

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["phoneNumber"])
        self.assertTrue(response.json()["requiresPhoneVerification"])

    @override_settings(AUTH_MODE="cognito")
    @patch.dict(
        "os.environ",
        {
            "COGNITO_REGION": "ap-northeast-1",
            "COGNITO_USER_POOL_ID": "ap-northeast-1_example",
            "COGNITO_APP_CLIENT_ID": "client123",
        },
    )
    @patch("apps.interviews.auth.jwks_client")
    @patch("jwt.decode")
    def test_accepts_id_token_without_phone_and_requires_app_phone_verification(self, decode: Mock, jwks_client: Mock) -> None:
        jwks_client.return_value.get_signing_key_from_jwt.return_value.key = "public-key"
        decode.return_value = {
            "sub": "user-sub-1",
            "aud": "client123",
            "iss": "https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_example",
            "iat": 1,
            "exp": 9999999999,
            "token_use": "id",
            "email": "user@example.com",
            "name": "面接 花子",
        }

        response = Client(headers={"Authorization": "Bearer token"}).get("/api/me/")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["requiresPhoneVerification"])
