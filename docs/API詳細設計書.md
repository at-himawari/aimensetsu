# AI面接コーチ API詳細設計書

## 1. 文書概要

### 1.1 目的
本書は、主要 API の詳細仕様を定義するものである。API 一覧の補足として、リクエスト、レスポンス、バリデーション、業務ルール、エラー条件を整理する。

### 1.2 対象 API
- 認証 API
- 職務経歴書 API
- 面接セッション API
- メッセージ API
- 振り返り API
- 課金 API

## 2. 共通仕様

### 2.1 ヘッダー
| ヘッダー | 用途 |
| --- | --- |
| `Authorization` | 本番認証用 Bearer JWT |
| `X-Demo-User` | 開発用デモ認証 |
| `Content-Type` | `application/json` または `multipart/form-data` |
| `Idempotency-Key` | 決済系重複防止 |

### 2.2 共通レスポンス構造
```json
{
  "data": {},
  "meta": {
    "request_id": "req_123"
  }
}
```

## 3. API詳細

### 3.1 `GET /api/auth/me`

#### 概要
現在ログイン中ユーザーの情報を返す。

#### 認証
- 必須

#### レスポンス例
```json
{
  "data": {
    "user_id": "usr_001",
    "name": "Taro Yamada",
    "email": "taro@example.com",
    "phone_number": "09012345678",
    "auth_provider": "cognito",
    "roles": ["user"],
    "credit_balance_minutes": 30
  },
  "meta": {
    "request_id": "req_123"
  }
}
```

### 3.2 `POST /api/resumes`

#### 概要
職務経歴書ファイルをアップロードし、S3 に保存する。

#### 認証
- 必須

#### リクエスト
- 形式: `multipart/form-data`

| 項目 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `file` | file | 必須 | アップロード対象ファイル |
| `title` | string | 任意 | 画面表示用タイトル |

#### 業務ルール
- 許可形式は PDF のみとする
- サイズ上限は 10MB とし、超過時はエラーとする
- 保存先は S3 とし、DB にはメタ情報のみ保存する

#### レスポンス例
```json
{
  "data": {
    "resume_id": "res_001",
    "file_name": "resume.pdf",
    "file_path": "resumes/usr_001/res_001/resume.pdf",
    "uploaded_at": "2026-04-23T13:00:00Z"
  },
  "meta": {
    "request_id": "req_124"
  }
}
```

#### エラー条件
- 不正形式
- サイズ超過
- S3 保存失敗

### 3.3 `POST /api/interview-sessions`

#### 概要
面接練習セッションを開始する。

#### 認証
- 必須

#### リクエスト
```json
{
  "resume_id": "res_001",
  "mode": "general",
  "job_role": "backend-engineer"
}
```

#### 業務ルール
- 利用可能クレジットが不足している場合は開始不可
- 指定した `resume_id` は本人所有である必要がある
- セッション開始時点では状態を `active` とする

#### レスポンス例
```json
{
  "data": {
    "session_id": "ses_001",
    "status": "active",
    "remaining_credit_minutes": 30,
    "used_fallback": false
  },
  "meta": {
    "request_id": "req_125"
  }
}
```

#### エラー条件
- 残高不足
- 対象 RESUME 不存在
- 他人の RESUME 指定

### 3.4 `POST /api/interview-sessions/{session_id}/messages`

#### 概要
ユーザー発話を保存し、AI 応答を返す。

#### 認証
- 必須

#### リクエスト
```json
{
  "message": "自己紹介をお願いしますと言われた時の練習をしたいです",
  "message_type": "text",
  "client_timestamp": "2026-04-23T13:05:00Z"
}
```

#### 業務ルール
- 対象セッションは本人所有かつ `active` 状態である必要がある
- Azure OpenAI 障害時はローカル簡易応答を返す
- 応答結果には `ai_mode` と `used_fallback` を含める

#### レスポンス例
```json
{
  "data": {
    "user_message": {
      "message_id": "msg_001",
      "sender_type": "user",
      "content": "自己紹介をお願いしますと言われた時の練習をしたいです"
    },
    "assistant_message": {
      "message_id": "msg_002",
      "sender_type": "assistant",
      "content": "ではまず、これまでの経歴を1分程度で教えてください。",
      "ai_mode": "azure"
    },
    "used_fallback": false
  },
  "meta": {
    "request_id": "req_126"
  }
}
```

#### エラー条件
- セッション不存在
- セッション状態不正
- AI 応答生成失敗

### 3.5 `POST /api/interview-sessions/{session_id}/complete`

#### 概要
面接練習を終了し、利用時間と残高を確定する。

#### 認証
- 必須

#### 業務ルール
- 対象セッションは `active` 状態である必要がある
- 消費時間に応じて `CreditTransaction` を記録する
- セッション状態を `completed` に更新する

#### レスポンス例
```json
{
  "data": {
    "session_id": "ses_001",
    "status": "completed",
    "consumed_minutes": 18,
    "remaining_credit_minutes": 12
  },
  "meta": {
    "request_id": "req_127"
  }
}
```

### 3.6 `POST /api/interview-sessions/{session_id}/reflection`

#### 概要
セッション内容をもとに振り返りを生成する。

#### 認証
- 必須

#### 業務ルール
- 対象セッションは本人所有である必要がある
- セッション完了後に実行する
- Azure OpenAI 障害時は簡易テンプレートで代替可能とする
- 簡易テンプレートで代替した場合は `ai_mode=fallback` を返す

#### レスポンス例
```json
{
  "data": {
    "reflection_id": "ref_001",
    "strengths": ["具体例を交えて話せていた"],
    "improvements": ["結論から先に答えるとより良い"],
    "advice": "次回は最初の30秒で要点をまとめてください。",
    "ai_mode": "azure"
  },
  "meta": {
    "request_id": "req_128"
  }
}
```

### 3.7 `POST /api/billing/checkout-sessions`

#### 概要
Stripe Checkout Session を作成する。

#### 認証
- 必須

#### リクエスト
```json
{
  "plan_code": "minutes_30",
  "quantity": 1,
  "success_url": "https://example.com/billing/success",
  "cancel_url": "https://example.com/billing/cancel"
}
```

#### 業務ルール
- `Idempotency-Key` を受け付け、同一購入の重複作成を防止する
- `plan_code` に応じて金額と付与時間をサーバー側で決定する
- フロントエンド指定金額は信用しない
- MVP の課金プランは `minutes_30` のみとし、30 分 300 円を付与する

#### レスポンス例
```json
{
  "data": {
    "payment_session_id": "pay_001",
    "checkout_session_id": "cs_test_001",
    "checkout_url": "https://checkout.stripe.com/...",
    "expires_at": "2026-04-23T13:40:00Z"
  },
  "meta": {
    "request_id": "req_129"
  }
}
```

### 3.8 `POST /api/billing/webhooks/stripe`

#### 概要
Stripe からのイベント通知を受信する。

#### 認証
- Stripe 署名検証を必須とする

#### 業務ルール
- `checkout.session.completed` 等の対象イベントを処理する
- 重複イベントでも二重加算しない
- `PaymentSession` 更新後、必要に応じて `CreditTransaction` を作成する

#### レスポンス
- 正常時 `200`

## 4. 実装上の注意点
- OpenAPI 化する際はこの文書を元に request/response schema を定義する
- 課金系 API は特に冪等性と監査ログを重視する
- S3 や Azure OpenAI の障害時は、UI と API で状態が追えるようフラグを返す
