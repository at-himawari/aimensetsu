from __future__ import annotations

import os

import boto3
from botocore.config import Config


S3_CONNECT_TIMEOUT_SECONDS = int(os.getenv("S3_CONNECT_TIMEOUT_SECONDS", "5"))
S3_READ_TIMEOUT_SECONDS = int(os.getenv("S3_READ_TIMEOUT_SECONDS", "30"))
S3_MAX_ATTEMPTS = int(os.getenv("S3_MAX_ATTEMPTS", "2"))


class S3StorageClient:
    def __init__(self):
        self.bucket_name = os.getenv("S3_BUCKET_NAME", "")
        self.client = boto3.client(
            "s3",
            region_name=os.getenv("AWS_REGION"),
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            config=Config(
                connect_timeout=S3_CONNECT_TIMEOUT_SECONDS,
                read_timeout=S3_READ_TIMEOUT_SECONDS,
                retries={"max_attempts": S3_MAX_ATTEMPTS},
            ),
        )

    def upload_fileobj(self, fileobj, key: str, content_type: str) -> None:
        self.client.upload_fileobj(
            fileobj,
            self.bucket_name,
            key,
            ExtraArgs={"ContentType": content_type},
        )

    def delete_file(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket_name, Key=key)
