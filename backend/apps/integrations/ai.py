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

    def create_call_answer(
        self,
        sdp_offer: str,
        *,
        job_role: str | None = None,
        resume_text: str | None = None,
    ) -> str:
        if not self.is_configured():
            raise AIServiceError("openai realtime is not configured")
        if not sdp_offer.strip():
            raise AIServiceError("sdp offer is empty")

        instructions = (
            """
            あなたは日本語の模擬面接における面接官です。候補者に対して、終始フォーマルで礼儀正しい口調で面接を進行してください。

            - 必ず丁寧語・敬語で話してください。
            
            - タメ口、くだけた表現、過度に親しげな相づちを使わないでください。

            - 「いいね」「すごいですね」「そうなんですね」「じゃあ」などのカジュアルな表現は避けてください。

            - 相づちは「承知しました」「ありがとうございます」「確認いたしました」など、面接官として自然な表現にしてください。

            - 明瞭かつ落ち着いた速度で話し、返答は簡潔にしてください。

            - 常に会話形式でやり取りし、説明や質問は短い文に分けます。

            - 候補者が返答したら、評価しすぎず、必要に応じて追加の確認質問をしてください。

            - 面接に適した自然な日本語を使用します。

            - 1回のやり取りは短く（1～2文程度）、長い説明は数回に分けて行います。



            # 例

            ## 例 1
            **ユーザー:** 初めまして。  
            **AI:** 初めまして。お名前を教えていただけますか？  
            **ユーザー:** 田中太郎です。  
            **AI:** 田中様ですね。本日はよろしくお願いいたします。  
            **ユーザー:** よろしくお願いします。  
            **AI:** それでは、これまでのご経歴を1分程度でお話しいただけますでしょうか。

            ## 例 2
            **ユーザー:** 前職では営業をしていました。  
            **AI:** 承知しました。主にどのような商材を担当されていましたか？  
            **ユーザー:** ITサービスです。  
            **AI:** ありがとうございます。担当されたITサービスについて、具体的な実績を教えていただけますか？  
            **ユーザー:** 新規顧客を獲得したことがあります。  
            **AI:** その際、成果につながった工夫を具体的に教えてください。

            # 注記

            - 応答は常に簡潔かつフォーマルに聞こえるようにしてください。
            - 候補者が立ち止まった場合は、落ち着いた口調で質問を言い換えてください。
            - 一度にあまりにも多くの質問をカバーすることは避け、ターンごとに 1 つのポイントに集中してください。
            ・自己紹介、志望動機、強み・弱みなど、様々な面接トピックに関するユーザーの練習をサポートします。
            ・ユーザーが面接の方向性を決められるようにし、柔軟に対応します。

            ・ユーザーが明確に終了を希望するか、終了を要求するまで会話を続けます。
            """
        )
        if job_role:
            instructions += f" 想定職種は{job_role}です。"
        if resume_text:
            instructions += (
                "\n\n# 候補者の職務経歴書\n"
                f"{resume_text.strip()[:8000]}\n"
                "この職務経歴書の内容を踏まえて、経験・成果・使った技術・意思決定を自然に深掘りしてください。"
            )

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


class OpenAITextService:
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.model = os.getenv("OPENAI_REFLECTION_MODEL", "gpt-4.1-mini")
        self.timeout_seconds = float(os.getenv("OPENAI_REFLECTION_TIMEOUT_SECONDS", "12"))
        self.responses_url = os.getenv("OPENAI_RESPONSES_URL", "https://api.openai.com/v1/responses")

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def generate_reflection(self, transcript: str) -> ReflectionResult:
        if not self.is_configured():
            raise AIServiceError("openai text is not configured")

        payload = {
            "model": self.model,
            "instructions": (
                "あなたは日本語の面接コーチです。"
                "模擬面接の会話履歴を読み、受験生だけを評価してください。"
                "会話履歴では「受験生(user)」が評価対象で、「面接官AI(assistant)」は質問者です。"
                "面接官AIの発言内容や態度を、受験生の良かった点・改善点として扱ってはいけません。"
                "もし受験生の発話が少ない場合は、発話量が少ないことを改善点にしてください。"
                "形式: {\"strengths\":[\"...\"],\"improvements\":[\"...\"],\"advice\":\"...\"}"
            ),
            "input": (
                "次の面接練習を振り返ってください。"
                "必ず受験生(user)の発話のみを評価対象にしてください。"
                "strengthsは2件、improvementsは2件、adviceは次回に向けた短い助言にしてください。\n\n"
                f"{transcript}"
            ),
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "interview_reflection",
                    "schema": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "strengths": {
                                "type": "array",
                                "items": {"type": "string"},
                                "minItems": 1,
                                "maxItems": 3,
                            },
                            "improvements": {
                                "type": "array",
                                "items": {"type": "string"},
                                "minItems": 1,
                                "maxItems": 3,
                            },
                            "advice": {"type": "string"},
                        },
                        "required": ["strengths", "improvements", "advice"],
                    },
                    "strict": True,
                },
            },
        }
        req = request.Request(
            self.responses_url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            method="POST",
        )

        try:
            with request.urlopen(req, timeout=self.timeout_seconds) as response:
                body = json.loads(response.read().decode("utf-8"))
        except (error.URLError, error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
            raise AIServiceError(str(exc)) from exc

        output_text = self._extract_output_text(body)
        if not output_text:
            raise AIServiceError("openai response content is empty")

        try:
            parsed = json.loads(output_text)
        except json.JSONDecodeError as exc:
            raise AIServiceError("openai reflection response is not JSON") from exc

        return ReflectionResult(
            strengths=list(parsed.get("strengths") or [])[:3] or ["具体的な経験に触れられていた"],
            improvements=list(parsed.get("improvements") or [])[:3] or ["結論から先に答えるとより良い"],
            advice=str(parsed.get("advice") or "回答の最初に要点をまとめることを意識してください。"),
            ai_mode="openai",
        )

    @staticmethod
    def _extract_output_text(body: dict) -> str:
        if body.get("output_text"):
            return str(body["output_text"])

        chunks: list[str] = []
        for item in body.get("output") or []:
            for content in item.get("content") or []:
                if content.get("type") in {"output_text", "text"} and content.get("text"):
                    chunks.append(str(content["text"]))
        return "".join(chunks)


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
        elif "職務経歴書" in prompt:
            content = "職務経歴書の内容を踏まえて、特に成果につながった経験を一つ選び、背景と工夫を教えてください。"
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
        self.openai = OpenAITextService()
        self.azure = AzureOpenAIService()
        self.fallback = LocalFallbackAIService()

    def generate_reply(self, prompt: str) -> AIReply:
        try:
            return self.azure.generate_reply(prompt)
        except AIServiceError:
            return self.fallback.generate_reply(prompt)

    def generate_reflection(self, transcript: str) -> ReflectionResult:
        try:
            return self.openai.generate_reflection(transcript)
        except AIServiceError:
            pass

        try:
            return self.azure.generate_reflection(transcript)
        except AIServiceError:
            return self.fallback.generate_reflection(transcript)
