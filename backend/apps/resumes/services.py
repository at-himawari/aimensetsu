from __future__ import annotations

import os
import uuid

from django.core.files.uploadedfile import UploadedFile

from apps.integrations.storage import S3StorageClient


ALLOWED_RESUME_CONTENT_TYPES = {"application/pdf"}
MAX_RESUME_FILE_SIZE_BYTES = int(os.getenv("RESUME_MAX_FILE_SIZE_BYTES", str(10 * 1024 * 1024)))


def validate_resume_file(uploaded_file: UploadedFile) -> None:
    if uploaded_file.content_type not in ALLOWED_RESUME_CONTENT_TYPES:
        raise ValueError("PDF ファイルのみアップロードできます。")
    if uploaded_file.size > MAX_RESUME_FILE_SIZE_BYTES:
        raise ValueError("ファイルサイズは 10MB 以下にしてください。")


def build_resume_key(user_id: str, resume_id: str, file_name: str) -> str:
    return f"resumes/{user_id}/{resume_id}/{file_name}"


def generate_resume_id() -> str:
    return f"res_{uuid.uuid4().hex}"


def upload_resume_file(user_id: str, resume_id: str, uploaded_file: UploadedFile) -> str:
    key = build_resume_key(user_id, resume_id, uploaded_file.name)
    storage = S3StorageClient()
    uploaded_file.seek(0)
    storage.upload_fileobj(uploaded_file.file, key, uploaded_file.content_type)
    return key
