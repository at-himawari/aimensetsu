from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    phone_number = models.CharField(max_length=32, unique=True, null=True, blank=True)
    display_name = models.CharField(max_length=120)
    stripe_customer_id = models.CharField(max_length=120, blank=True)
    phone_verified_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return self.display_name

    @property
    def is_phone_verified(self) -> bool:
        return bool(self.phone_number and self.phone_verified_at)

    def mark_phone_verified(self, phone_number: str) -> None:
        self.phone_number = phone_number
        self.phone_verified_at = timezone.now()
        self.save(update_fields=["phone_number", "phone_verified_at"])


class PhoneVerificationCode(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="phone_verification_codes")
    phone_number = models.CharField(max_length=32)
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["user", "phone_number", "created_at"])]

    @property
    def is_active(self) -> bool:
        return self.consumed_at is None and self.expires_at > timezone.now()
