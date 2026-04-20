from dataclasses import dataclass
import os
from typing import Iterable

import requests


@dataclass(frozen=True)
class CoachReply:
    message: str
    strengths: list[str]
    improvements: list[str]
    next_questions: list[str]
    summary: str


class LocalInterviewCoach:
    def ask(self, transcript: Iterable[dict[str, str]], document_text: str, role: str) -> CoachReply:
        latest = next((item["content"] for item in reversed(list(transcript)) if item["role"] == "user"), "")
        focus = role or "応募職種"
        document_hint = "職務経歴書の内容も踏まえて" if document_text else "これまでの回答を踏まえて"
        return CoachReply(
            message=f"{document_hint}確認します。{focus}で成果を出した具体例を、状況、行動、結果の順にもう少し詳しく話してみてください。",
            strengths=["回答の方向性が明確です", "経験を自分の言葉で説明できています"],
            improvements=[f"直近の回答「{latest[:40]}」に数値や比較を足すと説得力が増します"],
            next_questions=["チームで意見が割れた時、どう合意形成しましたか？", "入社後3か月でどんな価値を出したいですか？"],
            summary="結論から話す姿勢は良いです。次は成果の大きさと再現性を伝える練習をしましょう。",
        )


class AzureInterviewCoach:
    def __init__(self) -> None:
        self.endpoint = os.environ["AZURE_OPENAI_ENDPOINT"].rstrip("/")
        self.api_key = os.environ["AZURE_OPENAI_API_KEY"]
        self.deployment = os.environ["AZURE_OPENAI_DEPLOYMENT"]
        self.api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-10-21")

    def ask(self, transcript: Iterable[dict[str, str]], document_text: str, role: str) -> CoachReply:
        system = (
            "あなたは日本語の面接コーチです。候補者を安心させつつ、回答を深掘りしてください。"
            "JSONで message, strengths, improvements, next_questions, summary を返してください。"
        )
        messages = [{"role": "system", "content": system}]
        if document_text:
            messages.append({"role": "user", "content": f"職務経歴書:\n{document_text[:5000]}"})
        if role:
            messages.append({"role": "user", "content": f"応募職種: {role}"})
        messages.extend(transcript)

        url = f"{self.endpoint}/openai/deployments/{self.deployment}/chat/completions"
        response = requests.post(
            url,
            params={"api-version": self.api_version},
            headers={"api-key": self.api_key, "Content-Type": "application/json"},
            json={"messages": messages, "temperature": 0.6, "response_format": {"type": "json_object"}},
            timeout=30,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        import json

        payload = json.loads(content)
        return CoachReply(
            message=payload["message"],
            strengths=payload.get("strengths", []),
            improvements=payload.get("improvements", []),
            next_questions=payload.get("next_questions", []),
            summary=payload.get("summary", ""),
        )


def get_coach() -> LocalInterviewCoach | AzureInterviewCoach:
    if os.getenv("AZURE_OPENAI_ENDPOINT") and os.getenv("AZURE_OPENAI_API_KEY") and os.getenv("AZURE_OPENAI_DEPLOYMENT"):
        return AzureInterviewCoach()
    return LocalInterviewCoach()

