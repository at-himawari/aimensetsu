from __future__ import annotations

import json
from unittest.mock import patch

from django.test import Client, TestCase, override_settings
from django.utils import timezone

from apps.billing.models import CreditBalance
from apps.interviews.models import InterviewMessage, InterviewSession, Reflection
from apps.resumes.models import ResumeFile
from apps.users.models import AppUser


class InterviewViewsBranchesTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = AppUser.objects.create(
            user_id="branch_int",
            name="Branch Interview",
            auth_provider=AppUser.AuthProvider.DEMO,
            role=AppUser.Role.USER,
        )
        CreditBalance.objects.create(balance_id="bal_branch_int", user=self.user, available_minutes=0)

    def test_interview_sessions_validation_branches(self):
        response = self.client.post(
            "/api/interview-sessions",
            data="{",
            content_type="application/json",
            HTTP_X_DEMO_USER=self.user.user_id,
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.post(
            "/api/interview-sessions",
            data=json.dumps({}),
            content_type="application/json",
            HTTP_X_DEMO_USER=self.user.user_id,
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.post(
            "/api/interview-sessions",
            data=json.dumps({"mode": "general"}),
            content_type="application/json",
            HTTP_X_DEMO_USER=self.user.user_id,
        )
        self.assertEqual(response.status_code, 422)

    @override_settings(ALLOW_INTERVIEW_WITHOUT_CREDITS=True)
    def test_interview_sessions_credit_bypass_allows_zero_balance(self):
        response = self.client.post(
            "/api/interview-sessions",
            data=json.dumps({"mode": "general"}),
            content_type="application/json",
            HTTP_X_DEMO_USER=self.user.user_id,
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["data"]["remaining_credit_minutes"], 0)

    def test_interview_sessions_resume_not_found_and_get_list(self):
        CreditBalance.objects.filter(user=self.user).update(available_minutes=30)
        response = self.client.post(
            "/api/interview-sessions",
            data=json.dumps({"mode": "general", "resume_id": "missing"}),
            content_type="application/json",
            HTTP_X_DEMO_USER=self.user.user_id,
        )
        self.assertEqual(response.status_code, 404)

        response = self.client.get("/api/interview-sessions", HTTP_X_DEMO_USER=self.user.user_id)
        self.assertEqual(response.status_code, 200)

    def test_interview_session_detail_not_found_and_delete(self):
        response = self.client.get("/api/interview-sessions/missing", HTTP_X_DEMO_USER=self.user.user_id)
        self.assertEqual(response.status_code, 404)

        CreditBalance.objects.filter(user=self.user).update(available_minutes=30)
        session = InterviewSession.objects.create(
            session_id="ses_delete",
            user=self.user,
            status=InterviewSession.Status.ACTIVE,
            mode="general",
            started_at=timezone.now(),
        )
        response = self.client.delete(f"/api/interview-sessions/{session.session_id}", HTTP_X_DEMO_USER=self.user.user_id)
        self.assertEqual(response.status_code, 200)

    def test_complete_history_and_messages_branching(self):
        CreditBalance.objects.filter(user=self.user).update(available_minutes=30)
        session = InterviewSession.objects.create(
            session_id="ses_branch",
            user=self.user,
            status=InterviewSession.Status.ACTIVE,
            mode="general",
            started_at=timezone.now(),
        )
        response = self.client.post("/api/interview-sessions/missing/complete", HTTP_X_DEMO_USER=self.user.user_id)
        self.assertEqual(response.status_code, 404)

        with patch("apps.interviews.views.complete_session", side_effect=ValueError("bad state")):
            response = self.client.post(
                f"/api/interview-sessions/{session.session_id}/complete",
                HTTP_X_DEMO_USER=self.user.user_id,
            )
            self.assertEqual(response.status_code, 409)

        response = self.client.get("/api/history", HTTP_X_DEMO_USER=self.user.user_id)
        self.assertEqual(response.status_code, 200)

        response = self.client.get("/api/history/missing", HTTP_X_DEMO_USER=self.user.user_id)
        self.assertEqual(response.status_code, 404)

        response = self.client.get(f"/api/interview-sessions/{session.session_id}/messages", HTTP_X_DEMO_USER=self.user.user_id)
        self.assertEqual(response.status_code, 200)

        response = self.client.post(
            f"/api/interview-sessions/{session.session_id}/messages",
            data="{",
            content_type="application/json",
            HTTP_X_DEMO_USER=self.user.user_id,
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.post(
            f"/api/interview-sessions/{session.session_id}/messages",
            data=json.dumps({"message": "", "message_type": ""}),
            content_type="application/json",
            HTTP_X_DEMO_USER=self.user.user_id,
        )
        self.assertEqual(response.status_code, 400)

        with patch("apps.interviews.views.create_message_exchange", side_effect=ValueError("invalid")):
            response = self.client.post(
                f"/api/interview-sessions/{session.session_id}/messages",
                data=json.dumps({"message": "hi", "message_type": "text"}),
                content_type="application/json",
                HTTP_X_DEMO_USER=self.user.user_id,
            )
            self.assertEqual(response.status_code, 409)

    def test_history_detail_and_reflection_branches(self):
        session = InterviewSession.objects.create(
            session_id="ses_hist",
            user=self.user,
            status=InterviewSession.Status.COMPLETED,
            mode="general",
            started_at=timezone.now(),
        )
        InterviewMessage.objects.create(
            message_id="msg_hist",
            session=session,
            sender_type=InterviewMessage.SenderType.USER,
            message_type=InterviewMessage.MessageType.TEXT,
            content="hello",
        )
        response = self.client.get(f"/api/history/{session.session_id}", HTTP_X_DEMO_USER=self.user.user_id)
        self.assertEqual(response.status_code, 200)

        response = self.client.delete(f"/api/history/{session.session_id}", HTTP_X_DEMO_USER=self.user.user_id)
        self.assertEqual(response.status_code, 200)

        response = self.client.get("/api/interview-sessions/missing/reflection", HTTP_X_DEMO_USER=self.user.user_id)
        self.assertEqual(response.status_code, 404)

        response = self.client.get(f"/api/interview-sessions/{session.session_id}/reflection", HTTP_X_DEMO_USER=self.user.user_id)
        self.assertEqual(response.status_code, 404)

        with patch("apps.interviews.views.generate_reflection", side_effect=ValueError("invalid")):
            response = self.client.post(
                f"/api/interview-sessions/{session.session_id}/reflection",
                HTTP_X_DEMO_USER=self.user.user_id,
            )
            self.assertEqual(response.status_code, 409)

        Reflection.objects.create(
            reflection_id="ref_hist",
            session=session,
            strengths="s1\ns2",
            improvements="i1",
            advice="advice",
            ai_mode="fallback",
        )
        response = self.client.get(f"/api/interview-sessions/{session.session_id}/reflection", HTTP_X_DEMO_USER=self.user.user_id)
        self.assertEqual(response.status_code, 200)
