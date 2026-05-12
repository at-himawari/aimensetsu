from __future__ import annotations

from django.db import models

from apps.resumes.models import ResumeFile
from apps.users.models import AppUser


class InterviewSession(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        COMPLETED = "completed", "Completed"
        DELETED = "deleted", "Deleted"

    session_id = models.CharField(primary_key=True, max_length=64)
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="interview_sessions")
    resume = models.ForeignKey(
        ResumeFile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="interview_sessions",
    )
    status = models.CharField(max_length=20, choices=Status.choices, db_index=True)
    mode = models.CharField(max_length=50)
    job_role = models.CharField(max_length=100, null=True, blank=True)
    consumed_minutes = models.IntegerField(default=0)
    remaining_credit_minutes_after = models.IntegerField(null=True, blank=True)
    used_fallback = models.BooleanField(default=False)
    started_at = models.DateTimeField(db_index=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "interview_sessions"
        indexes = [
            models.Index(fields=["user", "-started_at"], name="session_user_started_idx"),
        ]


class InterviewMessage(models.Model):
    class SenderType(models.TextChoices):
        USER = "user", "User"
        ASSISTANT = "assistant", "Assistant"

    class MessageType(models.TextChoices):
        TEXT = "text", "Text"
        VOICE = "voice", "Voice"

    class AIMode(models.TextChoices):
        AZURE = "azure", "Azure"
        FALLBACK = "fallback", "Fallback"

    message_id = models.CharField(primary_key=True, max_length=64)
    session = models.ForeignKey(InterviewSession, on_delete=models.CASCADE, related_name="messages")
    sender_type = models.CharField(max_length=20, choices=SenderType.choices, db_index=True)
    message_type = models.CharField(max_length=20, choices=MessageType.choices)
    content = models.TextField()
    ai_mode = models.CharField(max_length=20, choices=AIMode.choices, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "interview_messages"
        indexes = [
            models.Index(fields=["session", "created_at"], name="message_session_created_idx"),
        ]


class Reflection(models.Model):
    class AIMode(models.TextChoices):
        AZURE = "azure", "Azure"
        FALLBACK = "fallback", "Fallback"

    reflection_id = models.CharField(primary_key=True, max_length=64)
    session = models.OneToOneField(InterviewSession, on_delete=models.CASCADE, related_name="reflection")
    strengths = models.TextField()
    improvements = models.TextField()
    advice = models.TextField()
    ai_mode = models.CharField(max_length=20, choices=AIMode.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "reflections"
