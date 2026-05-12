from __future__ import annotations

from django.utils import timezone
from unittest.mock import patch

from django.test import TestCase

from apps.billing.models import CreditBalance
from apps.integrations.ai import AIServiceError
from apps.interviews.models import InterviewMessage, InterviewSession, Reflection
from apps.interviews.services import create_message_exchange, generate_reflection
from apps.users.models import AppUser


class InterviewAIServicesTestCase(TestCase):
    def setUp(self):
        self.user = AppUser.objects.create(
            user_id="usr_ai",
            name="AI User",
            auth_provider=AppUser.AuthProvider.DEMO,
            role=AppUser.Role.USER,
        )
        CreditBalance.objects.create(balance_id="bal_usr_ai", user=self.user, available_minutes=30)
        self.session = InterviewSession.objects.create(
            session_id="ses_ai",
            user=self.user,
            status=InterviewSession.Status.ACTIVE,
            mode="general",
            started_at=timezone.now(),
        )

    @patch("apps.integrations.ai.AzureOpenAIService.generate_reply")
    def test_message_exchange_falls_back_when_azure_fails(self, mocked_generate_reply):
        mocked_generate_reply.side_effect = AIServiceError("azure down")

        user_message, assistant_message, ai_reply = create_message_exchange(
            self.session,
            "自己紹介の練習をしたいです",
            InterviewMessage.MessageType.TEXT,
        )

        self.session.refresh_from_db()
        self.assertEqual(user_message.sender_type, InterviewMessage.SenderType.USER)
        self.assertEqual(assistant_message.ai_mode, "fallback")
        self.assertTrue(ai_reply.used_fallback)
        self.assertTrue(self.session.used_fallback)

    def test_generate_reflection_uses_fallback_for_completed_session(self):
        self.session.status = InterviewSession.Status.COMPLETED
        self.session.save(update_fields=["status"])
        InterviewMessage.objects.create(
            message_id="msg_001",
            session=self.session,
            sender_type=InterviewMessage.SenderType.USER,
            message_type=InterviewMessage.MessageType.TEXT,
            content="よろしくお願いします",
        )

        reflection = generate_reflection(self.session)

        self.assertIsInstance(reflection, Reflection)
        self.assertEqual(reflection.ai_mode, "fallback")
        self.assertTrue(len(reflection.strengths) > 0)
