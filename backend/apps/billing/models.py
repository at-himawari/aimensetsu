from __future__ import annotations

from django.db import models

from apps.users.models import AppUser


class CreditBalance(models.Model):
    balance_id = models.CharField(primary_key=True, max_length=64)
    user = models.OneToOneField(AppUser, on_delete=models.CASCADE, related_name="credit_balance")
    available_minutes = models.IntegerField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "credit_balances"


class PaymentSession(models.Model):
    class Status(models.TextChoices):
        CREATED = "created", "Created"
        PAID = "paid", "Paid"
        FAILED = "failed", "Failed"
        EXPIRED = "expired", "Expired"
        REFLECTED = "reflected", "Reflected"

    payment_session_id = models.CharField(primary_key=True, max_length=64)
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="payment_sessions")
    stripe_checkout_session_id = models.CharField(max_length=255, unique=True)
    idempotency_key = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    checkout_url = models.URLField(max_length=1000, blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, db_index=True)
    plan_code = models.CharField(max_length=50)
    amount_jpy = models.IntegerField()
    purchased_minutes = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "payment_sessions"
        indexes = [
            models.Index(fields=["user", "-created_at"], name="payment_user_created_idx"),
        ]


class CreditTransaction(models.Model):
    class TransactionType(models.TextChoices):
        GRANT = "grant", "Grant"
        CONSUME = "consume", "Consume"
        ADJUST = "adjust", "Adjust"
        PURCHASE = "purchase", "Purchase"

    transaction_id = models.CharField(primary_key=True, max_length=64)
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="credit_transactions")
    payment_session = models.ForeignKey(
        PaymentSession,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="credit_transactions",
    )
    transaction_type = models.CharField(max_length=20, choices=TransactionType.choices, db_index=True)
    minutes_delta = models.IntegerField()
    amount_jpy = models.IntegerField(null=True, blank=True)
    reason = models.CharField(max_length=255, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "credit_transactions"
        indexes = [
            models.Index(fields=["user", "-created_at"], name="credit_tx_user_created_idx"),
        ]


class AuditLog(models.Model):
    audit_log_id = models.CharField(primary_key=True, max_length=64)
    user = models.ForeignKey(
        AppUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    action_type = models.CharField(max_length=50, db_index=True)
    target_type = models.CharField(max_length=50, db_index=True)
    target_id = models.CharField(max_length=255, null=True, blank=True)
    metadata = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "audit_logs"
        indexes = [
            models.Index(fields=["action_type", "-created_at"], name="audit_action_created_idx"),
        ]
