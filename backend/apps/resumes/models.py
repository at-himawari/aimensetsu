from __future__ import annotations

from django.db import models

from apps.users.models import AppUser


class ResumeFile(models.Model):
    resume_id = models.CharField(primary_key=True, max_length=64)
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="resume_files")
    title = models.CharField(max_length=255, null=True, blank=True)
    file_name = models.CharField(max_length=255)
    file_path = models.CharField(max_length=500, db_index=True)
    content_type = models.CharField(max_length=100)
    file_size = models.BigIntegerField()
    extracted_text = models.TextField(blank=True, default="")
    uploaded_at = models.DateTimeField(auto_now_add=True)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        db_table = "resume_files"
        indexes = [
            models.Index(fields=["user", "deleted_at"], name="resume_user_deleted_idx"),
        ]
