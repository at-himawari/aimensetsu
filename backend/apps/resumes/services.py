from __future__ import annotations

import os
import re
import uuid
import zlib
from itertools import islice

from django.conf import settings
from django.core.files.uploadedfile import UploadedFile
from django.core.files.storage import default_storage

from apps.integrations.storage import S3StorageClient


ALLOWED_RESUME_CONTENT_TYPES = {"application/pdf"}
MAX_RESUME_FILE_SIZE_BYTES = int(os.getenv("RESUME_MAX_FILE_SIZE_BYTES", str(50 * 1024 * 1024)))
MAX_EXTRACTED_RESUME_TEXT_CHARS = int(os.getenv("RESUME_EXTRACTED_TEXT_MAX_CHARS", "20000"))
MAX_EXTRACTED_RESUME_PAGES = int(os.getenv("RESUME_EXTRACTED_TEXT_MAX_PAGES", "10"))
MAX_ACTIVE_RESUME_FILES_PER_USER = int(os.getenv("RESUME_MAX_ACTIVE_FILES_PER_USER", "2"))


def validate_resume_file(uploaded_file: UploadedFile) -> None:
    if uploaded_file.content_type not in ALLOWED_RESUME_CONTENT_TYPES:
        raise ValueError("PDF ファイルのみアップロードできます。")
    if uploaded_file.size > MAX_RESUME_FILE_SIZE_BYTES:
        max_mb = MAX_RESUME_FILE_SIZE_BYTES // (1024 * 1024)
        raise ValueError(f"ファイルサイズは {max_mb}MB 以下にしてください。")


def build_resume_key(user_id: str, resume_id: str, file_name: str) -> str:
    return f"resumes/{user_id}/{resume_id}/{file_name}"


def generate_resume_id() -> str:
    return f"res_{uuid.uuid4().hex}"


def _normalize_extracted_text(text: str) -> str:
    lines = [" ".join(line.split()) for line in text.splitlines()]
    normalized = "\n".join(line for line in lines if line)
    return normalized[:MAX_EXTRACTED_RESUME_TEXT_CHARS]


def _decode_pdf_literal(value: str) -> str:
    raw = bytearray()
    index = 0
    while index < len(value):
        char = value[index]
        if char != "\\":
            raw.extend(char.encode("latin-1", errors="ignore"))
            index += 1
            continue

        index += 1
        if index >= len(value):
            break
        escaped = value[index]
        escapes = {
            "n": b"\n",
            "r": b"\r",
            "t": b"\t",
            "b": b"\b",
            "f": b"\f",
            "\\": b"\\",
            "(": b"(",
            ")": b")",
        }
        if escaped in escapes:
            raw.extend(escapes[escaped])
            index += 1
            continue
        if escaped in "01234567":
            octal = escaped
            index += 1
            for _ in range(2):
                if index < len(value) and value[index] in "01234567":
                    octal += value[index]
                    index += 1
            raw.append(int(octal, 8))
            continue
        raw.extend(escaped.encode("latin-1", errors="ignore"))
        index += 1

    return _decode_pdf_bytes(bytes(raw))


def _decode_pdf_hex(value: str) -> str:
    hex_value = "".join(value.split())
    if len(hex_value) % 2:
        hex_value += "0"
    try:
        return _decode_pdf_bytes(bytes.fromhex(hex_value))
    except ValueError:
        return ""


def _decode_pdf_bytes(value: bytes) -> str:
    if value.startswith(b"\xfe\xff"):
        return value[2:].decode("utf-16-be", errors="ignore")
    if value.startswith(b"\xff\xfe"):
        return value[2:].decode("utf-16-le", errors="ignore")
    if b"\x00" in value:
        return value.decode("utf-16-be", errors="ignore")
    try:
        return value.decode("utf-8")
    except UnicodeDecodeError:
        return value.decode("latin-1", errors="ignore")


def _iter_pdf_text_payloads(pdf_bytes: bytes):
    yield pdf_bytes
    for match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", pdf_bytes, re.DOTALL):
        stream = match.group(1).strip()
        yield stream
        try:
            yield zlib.decompress(stream)
        except zlib.error:
            continue


def _extract_pdf_text_without_dependency(pdf_bytes: bytes) -> str:
    fragments: list[str] = []
    for payload in _iter_pdf_text_payloads(pdf_bytes):
        text = payload.decode("latin-1", errors="ignore")
        for match in re.finditer(r"\((?:\\.|[^\\)])*\)\s*Tj|<([0-9A-Fa-f\s]+)>\s*Tj|\[(.*?)\]\s*TJ", text, re.DOTALL):
            token = match.group(0)
            for literal in re.finditer(r"\(((?:\\.|[^\\)])*)\)", token, re.DOTALL):
                fragments.append(_decode_pdf_literal(literal.group(1)))
            for hex_match in re.finditer(r"<([0-9A-Fa-f\s]+)>", token):
                fragments.append(_decode_pdf_hex(hex_match.group(1)))
    return _normalize_extracted_text("\n".join(fragment for fragment in fragments if fragment.strip()))


def extract_resume_text(uploaded_file: UploadedFile) -> str:
    uploaded_file.seek(0)
    pdf_bytes = uploaded_file.read()
    uploaded_file.seek(0)

    try:
        from pypdf import PdfReader
    except ImportError:
        return _extract_pdf_text_without_dependency(pdf_bytes)

    try:
        reader = PdfReader(uploaded_file.file)
        text = "\n".join(page.extract_text() or "" for page in islice(reader.pages, MAX_EXTRACTED_RESUME_PAGES))
        return _normalize_extracted_text(text)
    except Exception:  # noqa: BLE001
        return _extract_pdf_text_without_dependency(pdf_bytes)
    finally:
        uploaded_file.seek(0)


def upload_resume_file(user_id: str, resume_id: str, uploaded_file: UploadedFile) -> str:
    key = build_resume_key(user_id, resume_id, uploaded_file.name)
    uploaded_file.seek(0)
    if not os.getenv("S3_BUCKET_NAME"):
        media_root = getattr(settings, "MEDIA_ROOT", None)
        if media_root is None:
            settings.MEDIA_ROOT = settings.BASE_DIR / "media"
        default_storage.save(key, uploaded_file)
        uploaded_file.seek(0)
        return key

    storage = S3StorageClient()
    storage.upload_fileobj(uploaded_file.file, key, uploaded_file.content_type)
    return key


def delete_resume_file(file_path: str) -> None:
    if not os.getenv("S3_BUCKET_NAME"):
        if default_storage.exists(file_path):
            default_storage.delete(file_path)
        return

    storage = S3StorageClient()
    storage.delete_file(file_path)
