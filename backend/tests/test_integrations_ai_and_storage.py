from __future__ import annotations

import json
import os
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from urllib.error import URLError

from django.test import TestCase

from apps.integrations.ai import AIServiceError, AzureOpenAIService, LocalFallbackAIService, OpenAIRealtimeService
from apps.integrations.storage import S3StorageClient


class IntegrationsAIAndStorageTestCase(TestCase):
    def test_azure_generate_reply_requires_configuration(self):
        service = AzureOpenAIService()
        with self.assertRaisesMessage(AIServiceError, "not configured"):
            service.generate_reply("hello")

    @patch("apps.integrations.ai.request.urlopen")
    def test_azure_generate_reply_success(self, mocked_urlopen):
        os.environ["AZURE_OPENAI_ENDPOINT"] = "https://example.com"
        os.environ["AZURE_OPENAI_API_KEY"] = "key"
        os.environ["AZURE_OPENAI_DEPLOYMENT"] = "deployment"

        mocked_response = MagicMock()
        mocked_response.read.return_value = json.dumps(
            {"choices": [{"message": {"content": "generated"}}]}
        ).encode("utf-8")
        mocked_urlopen.return_value.__enter__.return_value = mocked_response

        service = AzureOpenAIService()
        reply = service.generate_reply("hello")
        self.assertEqual(reply.content, "generated")
        self.assertEqual(reply.ai_mode, "azure")

    @patch("apps.integrations.ai.request.urlopen", side_effect=URLError("boom"))
    def test_azure_generate_reply_wraps_url_errors(self, _mocked_urlopen):
        os.environ["AZURE_OPENAI_ENDPOINT"] = "https://example.com"
        os.environ["AZURE_OPENAI_API_KEY"] = "key"
        os.environ["AZURE_OPENAI_DEPLOYMENT"] = "deployment"
        service = AzureOpenAIService()
        with self.assertRaises(AIServiceError):
            service.generate_reply("hello")

    @patch.object(AzureOpenAIService, "generate_reply")
    def test_azure_generate_reflection_parses_lines(self, mocked_generate_reply):
        mocked_generate_reply.return_value = SimpleNamespace(
            content="- 強み1\n- 強み2\n- 改善1\n- 改善2\n- アドバイス",
        )
        service = AzureOpenAIService()
        result = service.generate_reflection("transcript")
        self.assertEqual(result.strengths, ["強み1", "強み2"])
        self.assertEqual(result.improvements, ["改善1", "改善2"])
        self.assertEqual(result.advice, "アドバイス")

    def test_local_fallback_reply_variants(self):
        service = LocalFallbackAIService()
        self.assertIn("ご経歴", service.generate_reply("自己紹介").content)
        self.assertIn("転職", service.generate_reply("転職理由").content)
        self.assertIn("強み", service.generate_reply("強み").content)
        self.assertIn("課題", service.generate_reply("weakness").content)
        self.assertEqual(service.generate_reply("other").ai_mode, "fallback")
        self.assertEqual(service.generate_reflection("x").ai_mode, "fallback")

    def test_realtime_requires_configuration(self):
        os.environ.pop("OPENAI_API_KEY", None)
        service = OpenAIRealtimeService()
        with self.assertRaisesMessage(AIServiceError, "not configured"):
            service.create_call_answer("v=0")

    @patch("apps.integrations.ai.request.urlopen")
    def test_realtime_create_call_answer_posts_multipart(self, mocked_urlopen):
        os.environ["OPENAI_API_KEY"] = "key"
        mocked_response = MagicMock()
        mocked_response.read.return_value = b"answer-sdp"
        mocked_urlopen.return_value.__enter__.return_value = mocked_response

        service = OpenAIRealtimeService()
        answer = service.create_call_answer("v=0", job_role="Backend Engineer")

        self.assertEqual(answer, "answer-sdp")
        req = mocked_urlopen.call_args.args[0]
        self.assertEqual(req.full_url, "https://api.openai.com/v1/realtime/calls")
        self.assertEqual(req.headers["Authorization"], "Bearer key")
        self.assertIn("multipart/form-data", req.headers["Content-type"])
        self.assertIn(b"gpt-realtime-2", req.data)
        self.assertIn(b"gpt-4o-transcribe", req.data)
        self.assertIn(b'"language": "ja"', req.data)

    @patch("apps.integrations.storage.boto3.client")
    def test_s3_storage_upload_fileobj(self, mocked_client):
        instance = mocked_client.return_value
        storage = S3StorageClient()
        storage.bucket_name = "bucket"
        storage.upload_fileobj(MagicMock(), "key", "application/pdf")
        instance.upload_fileobj.assert_called_once()
