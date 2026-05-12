from __future__ import annotations

import json
import os
import uuid
from dataclasses import dataclass
from urllib import error, request


class AIServiceError(Exception):
    pass


@dataclass
class AIReply:
    content: str
    ai_mode: str
    used_fallback: bool


@dataclass
class ReflectionResult:
    strengths: list[str]
    improvements: list[str]
    advice: str
    ai_mode: str


class OpenAIRealtimeService:
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.model = os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime-2")
        self.voice = os.getenv("OPENAI_REALTIME_VOICE", "marin")
        self.timeout_seconds = float(os.getenv("OPENAI_REALTIME_TIMEOUT_SECONDS", "15"))
        self.calls_url = os.getenv("OPENAI_REALTIME_CALLS_URL", "https://api.openai.com/v1/realtime/calls")

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def create_call_answer(self, sdp_offer: str, *, job_role: str | None = None) -> str:
        if not self.is_configured():
            raise AIServiceError("openai realtime is not configured")
        if not sdp_offer.strip():
            raise AIServiceError("sdp offer is empty")

        instructions = (
            """
            リアルタイムの日本語面接練習アシスタントとして、ユーザーと自然な模擬面接を行います。

            - 必ず敬語で話してください。
            
            - 親しみやすく励ますような口調で、温かく自信を持って話します。

            - 明瞭かつ早口で話し、気まずい沈黙を避けるために短い返答を心がけます。

            - 常に会話形式でやり取りし、説明や質問は短い文に分けます。

            - ユーザーが返答したら、すぐに共感的なフィードバックや、必要に応じて追加の質問をします。

            - 面接に適した自然な日本語を使用します。

            - 1回のやり取りは短く（1～2文程度）、長い説明は数回に分けて行います。



            # 例

            ## 例 1
            **ユーザー:** 初めまして。  
            **AI:** 初めまして。お名前を教えていただけますか？  
            **ユーザー:** 田中太郎です。  
            **AI:** 田中さんですね。よろしくお願いします。  
            **ユーザー:** よろしくお願いします。  
            **AI:** では、自己紹介をお願いします。

            ## 例 2
            **ユーザー:** 前職では営業をしていました。  
            **AI:** そうなんですね。どんな商品を営業しましたか？  
            **ユーザー:** ITサービスです。  
            **AI:** ITサービスの営業、素晴らしいですね。具体的なエピソードはありますか？  
            **ユーザー:** 新規顧客を獲得したことがあります。  
            **AI:** すごいですね。その時、工夫したことは何ですか？

            # 注記

            - 応答は常に簡潔かつ自然に聞こえるようにしてください。
            - ユーザーが自信がなかったり、立ち止まったりした場合は、穏やかに促すか励ましを与えてください。
            - 一度にあまりにも多くの質問をカバーすることは避け、ターンごとに 1 つのポイントに集中してください。
            ・自己紹介、志望動機、強み・弱みなど、様々な面接トピックに関するユーザーの練習をサポートします。
            ・ユーザーが面接の方向性を決められるようにし、柔軟に対応します。

            ・ユーザーが明確に終了を希望するか、終了を要求するまで会話を続けます。
            """
        )
        if job_role:
            instructions += f" 想定職種は{job_role}です。"

        session_config = {
            "type": "realtime",
            "model": self.model,
            "instructions": instructions,
            "audio": {
                "input": {
                    "transcription": {
                        "model": os.getenv("OPENAI_REALTIME_TRANSCRIPTION_MODEL", "gpt-4o-transcribe"),
                        "language": os.getenv("OPENAI_REALTIME_TRANSCRIPTION_LANGUAGE", "ja"),
                    },
                },
                "output": {
                    "voice": self.voice,
                },
            },
            "reasoning": {
                "effort": os.getenv("OPENAI_REALTIME_REASONING_EFFORT", "low"),
            },
        }

        body, content_type = self._multipart_body(
            {
                "sdp": sdp_offer,
                "session": json.dumps(session_config, ensure_ascii=False),
            }
        )
        req = request.Request(
            self.calls_url,
            data=body,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": content_type,
            },
            method="POST",
        )

        try:
            with request.urlopen(req, timeout=self.timeout_seconds) as response:
                return response.read().decode("utf-8")
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise AIServiceError(f"openai realtime call failed: {exc.code} {detail}") from exc
        except (error.URLError, TimeoutError) as exc:
            raise AIServiceError(str(exc)) from exc

    @staticmethod
    def _multipart_body(fields: dict[str, str]) -> tuple[bytes, str]:
        boundary = f"----aimensetsu-{uuid.uuid4().hex}"
        chunks: list[bytes] = []
        for name, value in fields.items():
            chunks.append(f"--{boundary}\r\n".encode("utf-8"))
            chunks.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
            chunks.append(value.encode("utf-8"))
            chunks.append(b"\r\n")
        chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
        return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


class AzureOpenAIService:
    def __init__(self):
        self.endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        self.api_key = os.getenv("AZURE_OPENAI_API_KEY")
        self.deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT")
        self.api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-10-01-preview")
        self.timeout_seconds = float(os.getenv("AZURE_OPENAI_TIMEOUT_SECONDS", "8"))

    def is_configured(self) -> bool:
        return bool(self.endpoint and self.api_key and self.deployment)

    def generate_reply(self, prompt: str) -> AIReply:
        if not self.is_configured():
            raise AIServiceError("azure openai is not configured")

        payload = {
            "messages": [
                {"role": "system", "content": "You are an interview coach."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.7,
        }
        url = (
            f"{self.endpoint}/openai/deployments/{self.deployment}/chat/completions"
            f"?api-version={self.api_version}"
        )
        req = request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "api-key": self.api_key,
            },
            method="POST",
        )

        try:
            with request.urlopen(req, timeout=self.timeout_seconds) as response:
                body = json.loads(response.read().decode("utf-8"))
        except (error.URLError, error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
            raise AIServiceError(str(exc)) from exc

        choices = body.get("choices") or []
        if not choices:
            raise AIServiceError("empty response from azure openai")

        message = choices[0].get("message", {})
        content = message.get("content")
        if not content:
            raise AIServiceError("azure openai response content is empty")

        return AIReply(content=content, ai_mode="azure", used_fallback=False)

    def generate_reflection(self, transcript: str) -> ReflectionResult:
        reply = self.generate_reply(
            "Summarize this interview practice into strengths, improvements, and one concise advice.\n"
            f"{transcript}"
        )
        lines = [line.strip("- ").strip() for line in reply.content.splitlines() if line.strip()]
        strengths = lines[:2] or ["具体例を交えて話せていた"]
        improvements = lines[2:4] or ["結論から先に答えるとより良い"]
        advice = lines[4] if len(lines) > 4 else "最初の30秒で要点をまとめることを意識してください。"
        return ReflectionResult(
            strengths=strengths,
            improvements=improvements,
            advice=advice,
            ai_mode="azure",
        )


class LocalFallbackAIService:
    DEFAULT_REPLY = "ありがとうございます。では次に、これまでの経験の中で最も成果を出した取り組みを教えてください。"

    def generate_reply(self, prompt: str) -> AIReply:
        lower_prompt = prompt.lower()
        if "自己紹介" in prompt:
            content = "ではまず、1分程度でこれまでのご経歴を教えてください。"
        elif "転職" in prompt or "転職理由" in prompt:
            content = "転職を考えている理由を、現職で感じていることと合わせて教えてください。"
        elif "強み" in prompt:
            content = "あなたの強みを、実際のエピソードを交えて教えてください。"
        elif "weakness" in lower_prompt or "弱み" in prompt:
            content = "ご自身の課題だと思っている点と、それにどう向き合っているかを教えてください。"
        else:
            content = self.DEFAULT_REPLY

        return AIReply(content=content, ai_mode="fallback", used_fallback=True)

    def generate_reflection(self, transcript: str) -> ReflectionResult:
        return ReflectionResult(
            strengths=["具体的な経験に触れようとしていた"],
            improvements=["結論を先に述べると、より伝わりやすくなります"],
            advice="回答の最初に要点、その後に具体例という順番を意識してください。",
            ai_mode="fallback",
        )


class InterviewAIService:
    def __init__(self):
        self.azure = AzureOpenAIService()
        self.fallback = LocalFallbackAIService()

    def generate_reply(self, prompt: str) -> AIReply:
        try:
            return self.azure.generate_reply(prompt)
        except AIServiceError:
            return self.fallback.generate_reply(prompt)

    def generate_reflection(self, transcript: str) -> ReflectionResult:
        try:
            return self.azure.generate_reflection(transcript)
        except AIServiceError:
            return self.fallback.generate_reflection(transcript)
