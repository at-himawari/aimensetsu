from __future__ import annotations

import json
from unittest.mock import patch

from django.test import Client, TestCase
from django.utils import timezone

from apps.billing.models import CreditBalance
from apps.interviews.models import InterviewSession
from apps.users.models import AppUser


class InterviewViewsTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = AppUser.objects.create(
            user_id="int_user",
            name="Interview User",
            auth_provider=AppUser.AuthProvider.DEMO,
            role=AppUser.Role.USER,
        )
        CreditBalance.objects.create(balance_id="bal_int_user", user=self.user, available_minutes=30)

    def test_create_and_complete_session(self):
        created = self.client.post(
            "/api/interview-sessions",
            data=json.dumps({"mode": "general"}),
            content_type="application/json",
            HTTP_X_DEMO_USER=self.user.user_id,
        )
        self.assertEqual(created.status_code, 201)
        session_id = json.loads(created.content)["data"]["session_id"]

        detail = self.client.get(f"/api/interview-sessions/{session_id}", HTTP_X_DEMO_USER=self.user.user_id)
        self.assertEqual(detail.status_code, 200)

        complete = self.client.post(
            f"/api/interview-sessions/{session_id}/complete",
            HTTP_X_DEMO_USER=self.user.user_id,
        )
        self.assertEqual(complete.status_code, 200)

    @patch("apps.integrations.ai.AzureOpenAIService.generate_reply")
    def test_messages_and_reflection_flow(self, mocked_generate_reply):
        mocked_generate_reply.return_value = type(
            "Reply",
            (),
            {"content": "質問です", "ai_mode": "azure", "used_fallback": False},
        )()
        session = InterviewSession.objects.create(
            session_id="ses_view",
            user=self.user,
            status=InterviewSession.Status.ACTIVE,
            mode="general",
            started_at=timezone.now(),
        )
        response = self.client.post(
            f"/api/interview-sessions/{session.session_id}/messages",
            data=json.dumps({"message": "こんにちは", "message_type": "text"}),
            content_type="application/json",
            HTTP_X_DEMO_USER=self.user.user_id,
        )
        self.assertEqual(response.status_code, 200)

        session.status = InterviewSession.Status.COMPLETED
        session.save(update_fields=["status"])
        reflection = self.client.post(
            f"/api/interview-sessions/{session.session_id}/reflection",
            HTTP_X_DEMO_USER=self.user.user_id,
        )
        self.assertEqual(reflection.status_code, 200)

    @patch("apps.interviews.views.OpenAIRealtimeService")
    def test_realtime_call_returns_sdp_answer(self, mocked_service_class):
        mocked_service = mocked_service_class.return_value
        mocked_service.create_call_answer.return_value = "answer-sdp"
        session = InterviewSession.objects.create(
            session_id="ses_realtime",
            user=self.user,
            status=InterviewSession.Status.ACTIVE,
            mode="voice",
            job_role="Backend Engineer",
            started_at=timezone.now(),
        )

        response = self.client.post(
            f"/api/interview-sessions/{session.session_id}/realtime-call",
            data="offer-sdp",
            content_type="application/sdp",
            HTTP_X_DEMO_USER=self.user.user_id,
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.content.decode("utf-8"), "answer-sdp")
        mocked_service.create_call_answer.assert_called_once_with("offer-sdp", job_role="Backend Engineer")

    def test_history_list_requires_auth(self):
        response = self.client.get("/api/history")
        self.assertEqual(response.status_code, 401)
