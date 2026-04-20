from django.conf import settings
from django.contrib.auth.models import User
from django.db import models


class PracticeSession(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="practice_sessions")
    title = models.CharField(max_length=160)
    role = models.CharField(max_length=160, blank=True)
    minutes_used = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]


class UploadedDocument(models.Model):
    session = models.ForeignKey(PracticeSession, on_delete=models.CASCADE, related_name="documents")
    file = models.FileField(upload_to="documents/")
    extracted_text = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class PracticeMessage(models.Model):
    USER = "user"
    ASSISTANT = "assistant"
    ROLE_CHOICES = [(USER, "User"), (ASSISTANT, "Assistant")]

    session = models.ForeignKey(PracticeSession, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=16, choices=ROLE_CHOICES)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]


class FeedbackReport(models.Model):
    session = models.OneToOneField(PracticeSession, on_delete=models.CASCADE, related_name="feedback_report")
    strengths = models.JSONField(default=list)
    improvements = models.JSONField(default=list)
    next_questions = models.JSONField(default=list)
    summary = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)


class QuotaLedger(models.Model):
    CREDIT = "credit"
    DEBIT = "debit"
    KIND_CHOICES = [(CREDIT, "Credit"), (DEBIT, "Debit")]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="quota_entries")
    kind = models.CharField(max_length=16, choices=KIND_CHOICES)
    minutes = models.PositiveIntegerField(default=settings.PRACTICE_BLOCK_MINUTES)
    amount_jpy = models.PositiveIntegerField(default=settings.PRACTICE_BLOCK_PRICE_JPY)
    stripe_session_id = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["user", "created_at"])]

