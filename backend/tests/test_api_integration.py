from __future__ import annotations

import hmac
import json
import os
from hashlib import sha256
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase

from apps.billing.models import AuditLog, CreditBalance
from apps.resumes.models import ResumeFile
from apps.users.models import AppUser


class APIIntegrationTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user_id = "api_user"
        self.headers = {"HTTP_X_DEMO_USER": self.user_id}
        os.environ["STRIPE_ALLOW_FAKE_CHECKOUT"] = "true"

    def _login(self) -> dict:
        response = self.client.post(
            "/api/auth/demo-login",
            data=json.dumps({"demo_user_id": self.user_id, "name": "API User"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        return response.json()["data"]

    def _user(self) -> AppUser:
        user, _ = AppUser.objects.get_or_create(
            user_id=self.user_id,
            defaults={
                "name": "API User",
                "auth_provider": AppUser.AuthProvider.DEMO,
                "role": AppUser.Role.USER,
            },
        )
        return user

    def _give_credits(self, minutes: int = 30) -> None:
        user = self._user()
        CreditBalance.objects.update_or_create(
            user=user,
            defaults={"balance_id": f"bal_{user.user_id}", "available_minutes": minutes},
        )

    def _create_resume(self) -> ResumeFile:
        return ResumeFile.objects.create(
            resume_id="res_api",
            user=self._user(),
            title="API Resume",
            file_name="resume.pdf",
            file_path="resumes/api_user/res_api/resume.pdf",
            content_type="application/pdf",
            file_size=128,
        )

    def test_auth_api_flow(self):
        login_data = self._login()
        self.assertEqual(login_data["access_token"], self.user_id)

        me_response = self.client.get("/api/auth/me", **self.headers)
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.json()["data"]["user_id"], self.user_id)

        profile_response = self.client.patch(
            "/api/users/me",
            data=json.dumps({"display_name": "面接練習ユーザー", "target_job_role": "Backend Engineer"}),
            content_type="application/json",
            **self.headers,
        )
        self.assertEqual(profile_response.status_code, 200)
        self.assertEqual(profile_response.json()["data"]["display_name"], "面接練習ユーザー")

    @patch("apps.resumes.views.upload_resume_file", return_value="resumes/api_user/generated/resume.pdf")
    @patch("apps.resumes.views.delete_resume_file")
    @patch("apps.resumes.views.generate_resume_id", return_value="res_uploaded")
    def test_resume_api_flow(self, _generate_resume_id, _delete_resume_file, _upload_resume_file):
        self._login()
        upload = SimpleUploadedFile("resume.pdf", b"%PDF-1.7", content_type="application/pdf")

        create_response = self.client.post(
            "/api/resumes",
            data={"title": "職務経歴書", "file": upload},
            **self.headers,
        )
        self.assertEqual(create_response.status_code, 201)
        self.assertEqual(create_response.json()["data"]["resume_id"], "res_uploaded")

        list_response = self.client.get("/api/resumes", **self.headers)
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.json()["data"]), 1)

        detail_response = self.client.get("/api/resumes/res_uploaded", **self.headers)
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.json()["data"]["file_path"], "resumes/api_user/generated/resume.pdf")

        delete_response = self.client.delete("/api/resumes/res_uploaded/", **self.headers)
        self.assertEqual(delete_response.status_code, 200)
        _delete_resume_file.assert_called_once_with("resumes/api_user/generated/resume.pdf")
        self.assertIsNotNone(ResumeFile.objects.get(resume_id="res_uploaded").deleted_at)

    def test_interview_session_and_reflection_api_flow(self):
        self._login()
        self._give_credits()
        resume = self._create_resume()

        start_response = self.client.post(
            "/api/interview-sessions",
            data=json.dumps({"resume_id": resume.resume_id, "mode": "text", "job_role": "Backend Engineer"}),
            content_type="application/json",
            **self.headers,
        )
        self.assertEqual(start_response.status_code, 201)
        session_id = start_response.json()["data"]["session_id"]

        message_response = self.client.post(
            f"/api/interview-sessions/{session_id}/messages",
            data=json.dumps({"message": "自己紹介の練習をしたいです", "message_type": "text"}),
            content_type="application/json",
            **self.headers,
        )
        self.assertEqual(message_response.status_code, 200)
        self.assertTrue(message_response.json()["data"]["used_fallback"])

        messages_response = self.client.get(f"/api/interview-sessions/{session_id}/messages", **self.headers)
        self.assertEqual(messages_response.status_code, 200)
        self.assertEqual(len(messages_response.json()["data"]), 2)

        complete_response = self.client.post(f"/api/interview-sessions/{session_id}/complete", **self.headers)
        self.assertEqual(complete_response.status_code, 200)
        self.assertEqual(complete_response.json()["data"]["status"], "completed")

        reflection_response = self.client.post(f"/api/interview-sessions/{session_id}/reflection", **self.headers)
        self.assertEqual(reflection_response.status_code, 200)
        self.assertEqual(reflection_response.json()["data"]["ai_mode"], "fallback")

        history_response = self.client.get(f"/api/history/{session_id}", **self.headers)
        self.assertEqual(history_response.status_code, 200)
        self.assertEqual(history_response.json()["data"]["reflection"]["ai_mode"], "fallback")

        delete_response = self.client.delete(f"/api/history/{session_id}", **self.headers)
        self.assertEqual(delete_response.status_code, 200)

    def test_billing_api_flow(self):
        self._login()

        balance_response = self.client.get("/api/credits/balance", **self.headers)
        self.assertEqual(balance_response.status_code, 200)
        self.assertEqual(balance_response.json()["data"]["available_minutes"], 15)

        checkout_response = self.client.post(
            "/api/billing/checkout-sessions",
            data=json.dumps({
                "plan_code": "minutes_30",
                "quantity": 1,
                "success_url": "https://example.com/success",
                "cancel_url": "https://example.com/cancel",
            }),
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY="idem_api",
            **self.headers,
        )
        self.assertEqual(checkout_response.status_code, 201)
        payment_session_id = checkout_response.json()["data"]["payment_session_id"]
        checkout_session_id = checkout_response.json()["data"]["checkout_session_id"]

        detail_response = self.client.get(
            f"/api/billing/checkout-sessions/{payment_session_id}",
            **self.headers,
        )
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.json()["data"]["status"], "created")

        payload = json.dumps({
            "type": "checkout.session.completed",
            "data": {"object": {"id": checkout_session_id}},
        }).encode("utf-8")
        signature = hmac.new(b"test-webhook-secret", payload, sha256).hexdigest()
        webhook_response = self.client.post(
            "/api/billing/webhooks/stripe",
            data=payload,
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE=signature,
        )
        self.assertEqual(webhook_response.status_code, 200)
        self.assertEqual(webhook_response.json()["data"]["status"], "reflected")

        balance_after_webhook = self.client.get("/api/credits/balance", **self.headers)
        self.assertEqual(balance_after_webhook.status_code, 200)
        self.assertEqual(balance_after_webhook.json()["data"]["available_minutes"], 45)

        transactions_response = self.client.get("/api/credits/transactions", **self.headers)
        self.assertEqual(transactions_response.status_code, 200)
        self.assertEqual(transactions_response.json()["data"][0]["transaction_type"], "purchase")
        self.assertEqual(transactions_response.json()["data"][1]["transaction_type"], "grant")

    def test_admin_api_flow(self):
        admin = AppUser.objects.create(
            user_id="admin_api",
            name="Admin",
            auth_provider=AppUser.AuthProvider.DEMO,
            role=AppUser.Role.ADMIN,
        )
        AuditLog.objects.create(
            audit_log_id="audit_api",
            user=admin,
            action_type="test_action",
            target_type="test_target",
            target_id="target_1",
            metadata={"ok": True},
        )
        admin_headers = {"HTTP_X_DEMO_USER": admin.user_id}

        health_response = self.client.get("/api/admin/health", **admin_headers)
        self.assertEqual(health_response.status_code, 200)
        self.assertEqual(health_response.json()["data"]["status"], "ok")

        logs_response = self.client.get("/api/admin/audit-logs", **admin_headers)
        self.assertEqual(logs_response.status_code, 200)
        self.assertEqual(logs_response.json()["data"][0]["audit_log_id"], "audit_api")
