from __future__ import annotations

from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase

from apps.resumes.models import ResumeFile
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

    @patch("apps.resumes.views.upload_resume_file", return_value="resumes/resume_user/res_test/resume.pdf")
    @patch("apps.resumes.views.generate_resume_id", return_value="res_test")
    @patch("apps.resumes.views.extract_resume_text", return_value="Python と Django の開発経験があります。")
    def test_resume_upload_extracts_text(self, _mocked_extract, _mocked_id, _mocked_upload):
        uploaded = SimpleUploadedFile("resume.pdf", b"%PDF-1.7 mock", content_type="application/pdf")
        response = self.client.post(
            "/api/resumes",
            {"file": uploaded, "title": "resume.pdf"},
            HTTP_X_DEMO_USER=self.user.user_id,
        )

        self.assertEqual(response.status_code, 201)
        body = response.json()["data"]
        self.assertTrue(body["has_extracted_text"])
        self.assertIn("Python", body["extracted_text_preview"])
        self.assertEqual(ResumeFile.objects.get(resume_id="res_test").extracted_text, "Python と Django の開発経験があります。")

    def test_resume_detail_not_found(self):
        response = self.client.get("/api/resumes/notfound", HTTP_X_DEMO_USER=self.user.user_id)
        self.assertEqual(response.status_code, 404)
