# AI面接コーチ API一覧

## 1. 文書概要

### 1.1 目的
本書は、AI面接コーチで提供する主要 API の一覧、用途、認証要件、入出力の概要を整理するものである。基本設計書の API 設計方針を補完し、フロントエンド、バックエンド、テスト設計の共通認識に用いる。

### 1.2 前提
- ベース URL は環境ごとに切り替える
- 本番では `Authorization: Bearer <JWT>` による認証を前提とする
- 開発用デモ認証では `X-Demo-User` ヘッダーを利用する
- レスポンスは JSON を基本とする

## 2. 共通仕様

### 2.1 認証方式
| 区分 | 方式 | 補足 |
| --- | --- | --- |
| 開発環境 | `X-Demo-User` | デモログイン用 |
| 本番環境 | Bearer JWT | Cognito 想定 |

### 2.2 共通レスポンス例
#### 正常系
```json
{
  "data": {},
  "meta": {
    "request_id": "req_123"
  }
}
```

#### 異常系
```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "入力内容を確認してください。"
  }
}
```

### 2.3 主なステータスコード
| ステータス | 用途 |
| --- | --- |
| `200` | 正常取得、正常更新 |
| `201` | 正常作成 |
| `204` | 正常削除 |
| `400` | 入力不正 |
| `401` | 未認証 |
| `403` | 権限不足 |
| `404` | 対象なし |
| `409` | 状態競合 |
| `422` | 業務ルール違反 |
| `500` | サーバー内部エラー |
| `503` | 外部連携障害 |

## 3. API一覧

### 3.1 認証 API
| API名 | メソッド | パス | 認証 | 用途 |
| --- | --- | --- | --- | --- |
| デモログイン | `POST` | `/api/auth/demo-login` | 不要 | 開発用ユーザーとしてログインする |
| 認証状態取得 | `GET` | `/api/auth/me` | 必要 | 現在ログイン中のユーザー情報を取得する |
| ログアウト | `POST` | `/api/auth/logout` | 必要 | セッション終了、フロントの認証情報破棄に利用する |

#### `POST /api/auth/demo-login`
- 用途: 開発環境で簡易ログインする
- 主なリクエスト項目:
  - `demo_user_id`
  - `name`
- 主なレスポンス項目:
  - `user`
  - `token_type`
  - `access_token`

#### `GET /api/auth/me`
- 用途: ログイン中ユーザー情報と利用状態を返す
- 主なレスポンス項目:
  - `user_id`
  - `name`
  - `email`
  - `phone_number`
  - `credit_balance_minutes`
  - `auth_provider`

### 3.2 ユーザー API
| API名 | メソッド | パス | 認証 | 用途 |
| --- | --- | --- | --- | --- |
| ユーザー情報取得 | `GET` | `/api/users/me` | 必要 | プロフィール情報を取得する |
| ユーザー情報更新 | `PATCH` | `/api/users/me` | 必要 | 氏名、メールアドレス、電話番号を更新する |

#### `PATCH /api/users/me`
- 主な更新項目:
  - `name`
  - `email`
  - `phone_number`
- バリデーション:
  - 電話番号重複禁止
  - 必須形式チェック

### 3.3 職務経歴書 API
| API名 | メソッド | パス | 認証 | 用途 |
| --- | --- | --- | --- | --- |
| 職務経歴書一覧取得 | `GET` | `/api/resumes` | 必要 | アップロード済みファイル一覧を取得する |
| 職務経歴書アップロード | `POST` | `/api/resumes` | 必要 | 職務経歴書ファイルを登録する |
| 職務経歴書詳細取得 | `GET` | `/api/resumes/{resume_id}` | 必要 | 対象ファイルの詳細を取得する |
| 職務経歴書削除 | `DELETE` | `/api/resumes/{resume_id}` | 必要 | 対象ファイルを削除する |

#### `POST /api/resumes`
- リクエスト形式: `multipart/form-data`
- 主な入力項目:
  - `file`
  - `title`
- 主なレスポンス項目:
  - `resume_id`
  - `file_name`
  - `uploaded_at`

### 3.4 面接セッション API
| API名 | メソッド | パス | 認証 | 用途 |
| --- | --- | --- | --- | --- |
| セッション開始 | `POST` | `/api/interview-sessions` | 必要 | 面接練習を開始する |
| セッション一覧取得 | `GET` | `/api/interview-sessions` | 必要 | 練習履歴一覧を取得する |
| セッション詳細取得 | `GET` | `/api/interview-sessions/{session_id}` | 必要 | 練習セッション詳細を取得する |
| セッション終了 | `POST` | `/api/interview-sessions/{session_id}/complete` | 必要 | 面接練習を終了する |
| セッション削除 | `DELETE` | `/api/interview-sessions/{session_id}` | 必要 | 練習履歴を削除する |

#### `POST /api/interview-sessions`
- 用途: 面接練習を開始し、初期状態を作成する
- 主な入力項目:
  - `resume_id`
  - `mode`
  - `job_role`
- 主なレスポンス項目:
  - `session_id`
  - `status`
  - `remaining_credit_minutes`
  - `realtime_session`

#### `POST /api/interview-sessions/{session_id}/complete`
- 用途: 面接セッションを終了し、消費時間を確定する
- 主なレスポンス項目:
  - `session_id`
  - `status`
  - `consumed_minutes`
  - `remaining_credit_minutes`

### 3.5 面接メッセージ API
| API名 | メソッド | パス | 認証 | 用途 |
| --- | --- | --- | --- | --- |
| メッセージ一覧取得 | `GET` | `/api/interview-sessions/{session_id}/messages` | 必要 | 面接中の発話履歴を取得する |
| メッセージ送信 | `POST` | `/api/interview-sessions/{session_id}/messages` | 必要 | ユーザー発話を登録し AI 応答を取得する |

#### `POST /api/interview-sessions/{session_id}/messages`
- 主な入力項目:
  - `message`
  - `message_type`
  - `client_timestamp`
- 主なレスポンス項目:
  - `user_message`
  - `assistant_message`
  - `ai_mode`
  - `used_fallback`

### 3.6 振り返り API
| API名 | メソッド | パス | 認証 | 用途 |
| --- | --- | --- | --- | --- |
| 振り返り生成 | `POST` | `/api/interview-sessions/{session_id}/reflection` | 必要 | セッション内容から振り返りを生成する |
| 振り返り取得 | `GET` | `/api/interview-sessions/{session_id}/reflection` | 必要 | 生成済み振り返りを取得する |

#### `POST /api/interview-sessions/{session_id}/reflection`
- 主なレスポンス項目:
  - `reflection_id`
  - `strengths`
  - `improvements`
  - `advice`
  - `ai_mode`

### 3.7 履歴 API
| API名 | メソッド | パス | 認証 | 用途 |
| --- | --- | --- | --- | --- |
| 履歴一覧取得 | `GET` | `/api/history` | 必要 | セッション履歴を一覧表示する |
| 履歴詳細取得 | `GET` | `/api/history/{session_id}` | 必要 | セッション、メッセージ、振り返りをまとめて返す |
| 履歴削除 | `DELETE` | `/api/history/{session_id}` | 必要 | 履歴を削除する |

### 3.8 クレジット・課金 API
| API名 | メソッド | パス | 認証 | 用途 |
| --- | --- | --- | --- | --- |
| 残高取得 | `GET` | `/api/credits/balance` | 必要 | 現在の利用可能クレジットを取得する |
| 利用履歴取得 | `GET` | `/api/credits/transactions` | 必要 | クレジット増減履歴を取得する |
| Checkout セッション作成 | `POST` | `/api/billing/checkout-sessions` | 必要 | Stripe 決済画面遷移用 URL を作成する |
| 決済結果確認 | `GET` | `/api/billing/checkout-sessions/{session_id}` | 必要 | 決済完了状態を確認する |
| Webhook受信 | `POST` | `/api/billing/webhooks/stripe` | 不要 | Stripe イベントを受信する |

#### `POST /api/billing/checkout-sessions`
- 主な入力項目:
  - `plan_code`
  - `quantity`
  - `success_url`
  - `cancel_url`
- 主なレスポンス項目:
  - `checkout_session_id`
  - `checkout_url`
  - `expires_at`

### 3.9 管理・監査 API
| API名 | メソッド | パス | 認証 | 用途 |
| --- | --- | --- | --- | --- |
| 監査ログ一覧取得 | `GET` | `/api/admin/audit-logs` | 必要 | 管理者向けに監査ログを取得する |
| 障害状態確認 | `GET` | `/api/admin/health` | 必要 | 外部連携やシステム状態を確認する |

## 4. 主要 API の利用順序

### 4.1 初回利用から面接練習まで
1. `POST /api/auth/demo-login` または Cognito 認証
2. `GET /api/auth/me`
3. `POST /api/resumes`
4. `POST /api/interview-sessions`
5. `POST /api/interview-sessions/{session_id}/messages`
6. `POST /api/interview-sessions/{session_id}/complete`
7. `POST /api/interview-sessions/{session_id}/reflection`

### 4.2 追加課金フロー
1. `GET /api/credits/balance`
2. `POST /api/billing/checkout-sessions`
3. Stripe Checkout 画面へ遷移
4. `POST /api/billing/webhooks/stripe`
5. `GET /api/billing/checkout-sessions/{session_id}`

## 5. 補足
- URL、項目名、認証方式の最終確定は詳細設計で行う
- Realtime API のセッション確立手順は別途リアルタイム通信設計で具体化する
- 課金 API は特に冪等性、重複反映防止、監査証跡を重視する
