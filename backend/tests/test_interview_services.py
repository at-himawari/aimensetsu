from __future__ import annotations

from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.billing.models import CreditBalance, CreditTransaction
from apps.integrations.ai import AIReply, ReflectionResult
from apps.interviews.models import InterviewMessage, InterviewSession, Reflection
from apps.interviews.services import (
    build_transcript,
    complete_session,
    create_message_exchange,
    ensure_sufficient_credits,
    generate_reflection,
)
from apps.users.models import AppUser


class InterviewServicesTestCase(TestCase):
    def setUp(self):
        self.user = AppUser.objects.create(
            user_id="svc_user",
            name="Service User",
            auth_provider=AppUser.AuthProvider.DEMO,
            role=AppUser.Role.USER,
        )
        CreditBalance.objects.create(balance_id="bal_svc_user", user=self.user, available_minutes=30)

    def test_build_transcript_returns_joined_lines(self):
        session = InterviewSession.objects.create(
            session_id="ses_tr",
            user=self.user,
            status=InterviewSession.Status.ACTIVE,
            mode="general",
            started_at=timezone.now(),
        )
        InterviewMessage.objects.create(
            message_id="msg1",
            session=session,
            sender_type=InterviewMessage.SenderType.USER,
            message_type=InterviewMessage.MessageType.TEXT,
            content="A",
        )
        InterviewMessage.objects.create(
            message_id="msg2",
            session=session,
            sender_type=InterviewMessage.SenderType.ASSISTANT,
            message_type=InterviewMessage.MessageType.TEXT,
            content="B",
        )
        self.assertEqual(build_transcript(session), "user: A\nassistant: B")

    def test_create_message_exchange_rejects_non_active_session(self):
        session = InterviewSession.objects.create(
            session_id="ses_invalid",
            user=self.user,
            status=InterviewSession.Status.COMPLETED,
            mode="general",
            started_at=timezone.now(),
        )
        with self.assertRaisesMessage(ValueError, "active 状態"):
            create_message_exchange(session, "hi", InterviewMessage.MessageType.TEXT)

    @patch("apps.interviews.services.InterviewAIService.generate_reply")
    def test_create_message_exchange_marks_session_fallback(self, mocked_reply):
        mocked_reply.return_value = AIReply(content="fallback", ai_mode="fallback", used_fallback=True)
        session = InterviewSession.objects.create(
            session_id="ses_msg",
            user=self.user,
            status=InterviewSession.Status.ACTIVE,
            mode="general",
            started_at=timezone.now(),
        )
        _user_message, assistant_message, _ai_reply = create_message_exchange(
            session, "hi", InterviewMessage.MessageType.TEXT
        )
        session.refresh_from_db()
        self.assertEqual(assistant_message.ai_mode, "fallback")
        self.assertTrue(session.used_fallback)

    def test_generate_reflection_rejects_non_completed_session(self):
        session = InterviewSession.objects.create(
            session_id="ses_not_done",
            user=self.user,
            status=InterviewSession.Status.ACTIVE,
            mode="general",
            started_at=timezone.now(),
        )
        with self.assertRaisesMessage(ValueError, "completed 状態"):
            generate_reflection(session)

    def test_generate_reflection_returns_existing_reflection(self):
        session = InterviewSession.objects.create(
            session_id="ses_existing",
            user=self.user,
            status=InterviewSession.Status.COMPLETED,
            mode="general",
            started_at=timezone.now(),
        )
        reflection = Reflection.objects.create(
            reflection_id="ref_existing",
            session=session,
            strengths="good",
            improvements="better",
            advice="advice",
            ai_mode="fallback",
        )
        returned = generate_reflection(session)
        self.assertEqual(returned.pk, reflection.pk)

    @patch("apps.interviews.services.InterviewAIService.generate_reflection")
    def test_generate_reflection_marks_fallback(self, mocked_reflection):
        mocked_reflection.return_value = ReflectionResult(
            strengths=["s1"],
            improvements=["i1"],
            advice="a1",
            ai_mode="fallback",
        )
        session = InterviewSession.objects.create(
            session_id="ses_ref",
            user=self.user,
            status=InterviewSession.Status.COMPLETED,
            mode="general",
            started_at=timezone.now(),
        )
        reflection = generate_reflection(session)
        session.refresh_from_db()
        self.assertEqual(reflection.ai_mode, "fallback")
        self.assertTrue(session.used_fallback)

    def test_complete_session_rejects_non_active_session(self):
        session = InterviewSession.objects.create(
            session_id="ses_done",
            user=self.user,
            status=InterviewSession.Status.COMPLETED,
            mode="general",
            started_at=timezone.now(),
        )
        with self.assertRaisesMessage(ValueError, "active 状態"):
            complete_session(session)

    def test_complete_session_consumes_zero_when_fallback(self):
        session = InterviewSession.objects.create(
            session_id="ses_fallback",
            user=self.user,
            status=InterviewSession.Status.ACTIVE,
            mode="general",
            used_fallback=True,
            started_at=timezone.now(),
        )
        completed, balance = complete_session(session)
        self.assertEqual(completed.consumed_minutes, 0)
        self.assertEqual(balance.available_minutes, 30)
        self.assertEqual(CreditTransaction.objects.count(), 1)

    @override_settings(ALLOW_INTERVIEW_WITHOUT_CREDITS=True)
    def test_credit_bypass_allows_zero_balance_and_skips_consumption(self):
        CreditBalance.objects.filter(user=self.user).update(available_minutes=0)
        balance = ensure_sufficient_credits(self.user)
        self.assertEqual(balance.available_minutes, 0)

        session = InterviewSession.objects.create(
            session_id="ses_credit_bypass",
            user=self.user,
            status=InterviewSession.Status.ACTIVE,
            mode="general",
            started_at=timezone.now(),
        )
        completed, balance = complete_session(session)
        self.assertEqual(completed.consumed_minutes, 0)
        self.assertEqual(balance.available_minutes, 0)
        self.assertEqual(CreditTransaction.objects.count(), 1)
