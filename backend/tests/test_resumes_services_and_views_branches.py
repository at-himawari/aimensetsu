from __future__ import annotations

import os
from io import BytesIO
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase

from apps.resumes.models import ResumeFile
from apps.resumes.services import (
    _extract_pdf_text_without_dependency,
    build_resume_key,
    delete_resume_file,
    generate_resume_id,
    upload_resume_file,
    validate_resume_file,
)
from apps.users.models import AppUser


class ResumesServicesAndViewsBranchesTestCase(TestCase):
    def setUp(self):
        os.environ["AUTH_MODE"] = "demo"
        self.client = Client()
        self.user = AppUser.objects.create(
            user_id="resume_branch",
            name="Resume Branch",
            auth_provider=AppUser.AuthProvider.DEMO,
            role=AppUser.Role.USER,
        )

    def test_resume_service_helpers(self):
        self.assertTrue(generate_resume_id().startswith("res_"))
        self.assertEqual(build_resume_key("u1", "r1", "resume.pdf"), "resumes/u1/r1/resume.pdf")
        with self.assertRaises(ValueError):
            validate_resume_file(SimpleUploadedFile("bad.txt", b"x", content_type="text/plain"))
        with self.assertRaisesMessage(ValueError, "50MB 以下"):
            validate_resume_file(SimpleUploadedFile("big.pdf", b"x" * (50 * 1024 * 1024 + 1), content_type="application/pdf"))

    def test_extract_pdf_text_without_dependency_reads_simple_pdf_text(self):
        pdf_bytes = b"BT /F1 12 Tf (Backend API improvement) Tj [(Python) 120 (Django)] TJ ET"
        self.assertIn("Backend API improvement", _extract_pdf_text_without_dependency(pdf_bytes))
        self.assertIn("Python", _extract_pdf_text_without_dependency(pdf_bytes))

    @patch.dict(os.environ, {"S3_BUCKET_NAME": "bucket"})
    @patch("apps.resumes.services.S3StorageClient.upload_fileobj")
    def test_upload_resume_file(self, mocked_upload):
        uploaded = SimpleUploadedFile("resume.pdf", b"pdf", content_type="application/pdf")
        key = upload_resume_file("u1", "r1", uploaded)
        self.assertEqual(key, "resumes/u1/r1/resume.pdf")
        mocked_upload.assert_called_once()

    @patch.dict(os.environ, {"S3_BUCKET_NAME": "bucket"})
    @patch("apps.resumes.services.S3StorageClient.delete_file")
    def test_delete_resume_file_from_s3(self, mocked_delete):
        delete_resume_file("resumes/u1/r1/resume.pdf")
        mocked_delete.assert_called_once_with("resumes/u1/r1/resume.pdf")

    @patch("apps.resumes.views.extract_resume_text", return_value="")
    @patch("apps.resumes.views.upload_resume_file", side_effect=Exception("s3 fail"))
    def test_resume_upload_returns_503_on_s3_error(self, _mocked_upload, _mocked_extract):
        uploaded = SimpleUploadedFile("resume.pdf", b"pdf", content_type="application/pdf")
        response = self.client.post("/api/resumes", {"file": uploaded}, HTTP_X_DEMO_USER=self.user.user_id)
        self.assertEqual(response.status_code, 503)

    @patch("apps.resumes.views.delete_resume_file", side_effect=Exception("delete fail"))
    def test_resume_delete_returns_503_when_storage_delete_fails(self, _mocked_delete):
        resume = ResumeFile.objects.create(
            resume_id="res_delete_fail",
            user=self.user,
            title="resume.pdf",
            file_name="resume.pdf",
            file_path="resumes/u/r/resume.pdf",
            content_type="application/pdf",
            file_size=123,
        )

        response = self.client.delete(f"/api/resumes/{resume.resume_id}/", HTTP_X_DEMO_USER=self.user.user_id)

        self.assertEqual(response.status_code, 503)
        resume.refresh_from_db()
        self.assertIsNone(resume.deleted_at)

    @patch("apps.resumes.views.extract_resume_text", return_value="My resume text")
    @patch("apps.resumes.views.upload_resume_file", return_value="resumes/u/r/resume.pdf")
    @patch("apps.resumes.views.delete_resume_file")
    def test_resume_upload_and_list_and_delete(self, mocked_delete, _mocked_upload, _mocked_extract):
        uploaded = SimpleUploadedFile("resume.pdf", b"pdf", content_type="application/pdf")
        create = self.client.post(
            "/api/resumes",
            {"file": uploaded, "title": "My Resume"},
            HTTP_X_DEMO_USER=self.user.user_id,
        )
        self.assertEqual(create.status_code, 201)
        resume_id = ResumeFile.objects.get().resume_id

        list_response = self.client.get("/api/resumes", HTTP_X_DEMO_USER=self.user.user_id)
        self.assertEqual(list_response.status_code, 200)

        delete = self.client.delete(f"/api/resumes/{resume_id}/", HTTP_X_DEMO_USER=self.user.user_id)
        self.assertEqual(delete.status_code, 200)
        mocked_delete.assert_called_once_with("resumes/u/r/resume.pdf")

        missing_delete = self.client.delete(f"/api/resumes/{resume_id}/", HTTP_X_DEMO_USER=self.user.user_id)
        self.assertEqual(missing_delete.status_code, 404)
