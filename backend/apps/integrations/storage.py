from __future__ import annotations

import os

import boto3


class S3StorageClient:
    def __init__(self):
        self.bucket_name = os.getenv("S3_BUCKET_NAME", "")
        self.client = boto3.client(
            "s3",
            region_name=os.getenv("AWS_REGION"),
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        )

    def upload_fileobj(self, fileobj, key: str, content_type: str) -> None:
        self.client.upload_fileobj(
            fileobj,
            self.bucket_name,
            key,
            ExtraArgs={"ContentType": content_type},
        )
