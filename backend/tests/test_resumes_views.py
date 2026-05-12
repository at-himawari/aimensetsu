from __future__ import annotations

from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase

from apps.users.models import AppUser


class ResumesViewsTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = AppUser.objects.create(
            user_id="resume_user",
            name="Resume User",
            auth_provider=AppUser.AuthProvider.DEMO,
            role=AppUser.Role.USER,
        )

    def test_resume_list_requires_auth(self):
        response = self.client.get("/api/resumes")
        self.assertEqual(response.status_code, 401)

    def test_resume_upload_rejects_missing_file(self):
        response = self.client.post("/api/resumes", HTTP_X_DEMO_USER=self.user.user_id)
        self.assertEqual(response.status_code, 400)

    def test_resume_upload_rejects_invalid_content_type(self):
        uploaded = SimpleUploadedFile("resume.txt", b"hello", content_type="text/plain")
        response = self.client.post(
            "/api/resumes",
            {"file": uploaded},
            HTTP_X_DEMO_USER=self.user.user_id,
        )
        self.assertEqual(response.status_code, 400)

    def test_resume_detail_not_found(self):
        response = self.client.get("/api/resumes/notfound", HTTP_X_DEMO_USER=self.user.user_id)
        self.assertEqual(response.status_code, 404)
