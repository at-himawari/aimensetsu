from __future__ import annotations

from django.db import models

from apps.common.models import TimestampMixin


class AppUser(TimestampMixin):
    class AuthProvider(models.TextChoices):
        DEMO = "demo", "Demo"
        COGNITO = "cognito", "Cognito"

    class Role(models.TextChoices):
        USER = "user", "User"
        ADMIN = "admin", "Admin"

    user_id = models.CharField(primary_key=True, max_length=64)
    email = models.EmailField(max_length=255, null=True, blank=True, db_index=True)
    name = models.CharField(max_length=100)
    phone_number = models.CharField(max_length=20, null=True, blank=True, unique=True)
    auth_provider = models.CharField(max_length=20, choices=AuthProvider.choices, db_index=True)
    external_subject = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.USER, db_index=True)

    class Meta:
        db_table = "users"


class UserProfile(TimestampMixin):
    user_profile_id = models.CharField(primary_key=True, max_length=64)
    user = models.OneToOneField(AppUser, on_delete=models.CASCADE, related_name="profile")
    display_name = models.CharField(max_length=100, null=True, blank=True)
    target_job_role = models.CharField(max_length=100, null=True, blank=True)
    interview_goal = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "user_profiles"
