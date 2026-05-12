# AI面接コーチ DB詳細設計書

## 1. 文書概要

### 1.1 目的
本書は、AI面接コーチのデータベース詳細設計を定義するものである。ER 図を補完し、テーブル、カラム、制約、インデックス、運用上の考慮点を整理する。

### 1.2 前提
- リレーショナルデータベースを採用する
- 主キーは UUID 系識別子を前提とする
- 監査性を確保するため、課金関連は履歴保持を重視する
- 職務経歴書本体は S3 に保存し、DB にはメタ情報のみ保持する

## 2. テーブル一覧
| テーブル名 | 用途 |
| --- | --- |
| `users` | ユーザー基本情報 |
| `user_profiles` | 面接準備用プロフィール |
| `resume_files` | 職務経歴書メタ情報 |
| `interview_sessions` | 面接練習セッション |
| `interview_messages` | 面接会話履歴 |
| `reflections` | 振り返り結果 |
| `credit_balances` | 現在残高 |
| `credit_transactions` | クレジット増減履歴 |
| `payment_sessions` | 決済セッション |
| `audit_logs` | 監査ログ |

## 3. テーブル定義

### 3.1 `users`
| カラム名 | 型 | NULL | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `user_id` | UUID | No | PK | ユーザーID |
| `email` | VARCHAR(255) | Yes | INDEX | メールアドレス |
| `name` | VARCHAR(100) | No |  | 氏名 |
| `phone_number` | VARCHAR(20) | Yes | UNIQUE | 電話番号 |
| `auth_provider` | VARCHAR(20) | No | INDEX | `demo` / `cognito` |
| `external_subject` | VARCHAR(255) | Yes | INDEX | 外部認証ID |
| `role` | VARCHAR(20) | No | INDEX | `user` / `admin` |
| `created_at` | TIMESTAMP | No |  | 作成日時 |
| `updated_at` | TIMESTAMP | No |  | 更新日時 |

### 3.2 `user_profiles`
| カラム名 | 型 | NULL | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `user_profile_id` | UUID | No | PK | プロフィールID |
| `user_id` | UUID | No | FK | ユーザーID |
| `display_name` | VARCHAR(100) | Yes |  | 表示名 |
| `target_job_role` | VARCHAR(100) | Yes |  | 想定職種 |
| `interview_goal` | TEXT | Yes |  | 練習目的 |
| `created_at` | TIMESTAMP | No |  | 作成日時 |
| `updated_at` | TIMESTAMP | No |  | 更新日時 |

### 3.3 `resume_files`
| カラム名 | 型 | NULL | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `resume_id` | UUID | No | PK | RESUME ID |
| `user_id` | UUID | No | FK, INDEX | 所有ユーザー |
| `title` | VARCHAR(255) | Yes |  | 表示タイトル |
| `file_name` | VARCHAR(255) | No |  | 元ファイル名 |
| `file_path` | VARCHAR(500) | No | INDEX | S3 オブジェクトキー |
| `content_type` | VARCHAR(100) | No |  | MIME type |
| `file_size` | BIGINT | No |  | サイズ |
| `uploaded_at` | TIMESTAMP | No |  | 登録日時 |
| `deleted_at` | TIMESTAMP | Yes | INDEX | 論理削除日時 |

### 3.4 `interview_sessions`
| カラム名 | 型 | NULL | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `session_id` | UUID | No | PK | セッションID |
| `user_id` | UUID | No | FK, INDEX | ユーザーID |
| `resume_id` | UUID | Yes | FK, INDEX | 参照 RESUME |
| `status` | VARCHAR(20) | No | INDEX | `active` / `completed` / `deleted` |
| `mode` | VARCHAR(50) | No |  | 面接モード |
| `consumed_minutes` | INTEGER | No | DEFAULT 0 | 消費分数 |
| `remaining_credit_minutes_after` | INTEGER | Yes |  | 終了後残高 |
| `used_fallback` | BOOLEAN | No | DEFAULT false | AI フォールバック利用有無 |
| `started_at` | TIMESTAMP | No | INDEX | 開始日時 |
| `ended_at` | TIMESTAMP | Yes |  | 終了日時 |

### 3.5 `interview_messages`
| カラム名 | 型 | NULL | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `message_id` | UUID | No | PK | メッセージID |
| `session_id` | UUID | No | FK, INDEX | セッションID |
| `sender_type` | VARCHAR(20) | No | INDEX | `user` / `assistant` |
| `message_type` | VARCHAR(20) | No |  | `text` / `voice` |
| `content` | TEXT | No |  | 本文 |
| `ai_mode` | VARCHAR(20) | Yes |  | `azure` / `fallback` |
| `created_at` | TIMESTAMP | No | INDEX | 作成日時 |

### 3.6 `reflections`
| カラム名 | 型 | NULL | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `reflection_id` | UUID | No | PK | 振り返りID |
| `session_id` | UUID | No | FK, UNIQUE | セッションID |
| `strengths` | TEXT | No |  | 良かった点 |
| `improvements` | TEXT | No |  | 改善点 |
| `advice` | TEXT | No |  | 次回アドバイス |
| `ai_mode` | VARCHAR(20) | No |  | `azure` / `fallback` |
| `created_at` | TIMESTAMP | No |  | 作成日時 |

### 3.7 `credit_balances`
| カラム名 | 型 | NULL | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `balance_id` | UUID | No | PK | 残高ID |
| `user_id` | UUID | No | FK, UNIQUE | ユーザーID |
| `available_minutes` | INTEGER | No |  | 利用可能残分数 |
| `updated_at` | TIMESTAMP | No |  | 更新日時 |

### 3.8 `payment_sessions`
| カラム名 | 型 | NULL | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `payment_session_id` | UUID | No | PK | 決済セッションID |
| `user_id` | UUID | No | FK, INDEX | ユーザーID |
| `stripe_checkout_session_id` | VARCHAR(255) | No | UNIQUE | Stripe セッションID |
| `status` | VARCHAR(20) | No | INDEX | `created` / `paid` / `failed` / `expired` |
| `plan_code` | VARCHAR(50) | No |  | 購入プラン |
| `amount_jpy` | INTEGER | No |  | 金額 |
| `purchased_minutes` | INTEGER | No |  | 付与分数 |
| `created_at` | TIMESTAMP | No |  | 作成日時 |
| `completed_at` | TIMESTAMP | Yes |  | 完了日時 |

### 3.9 `credit_transactions`
| カラム名 | 型 | NULL | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `transaction_id` | UUID | No | PK | 取引ID |
| `user_id` | UUID | No | FK, INDEX | ユーザーID |
| `payment_session_id` | UUID | Yes | FK, INDEX | 決済セッションID |
| `transaction_type` | VARCHAR(20) | No | INDEX | `grant` / `consume` / `adjust` / `purchase` |
| `minutes_delta` | INTEGER | No |  | 増減分数 |
| `amount_jpy` | INTEGER | Yes |  | 関連金額 |
| `reason` | VARCHAR(255) | Yes |  | 理由 |
| `created_at` | TIMESTAMP | No | INDEX | 作成日時 |

### 3.10 `audit_logs`
| カラム名 | 型 | NULL | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `audit_log_id` | UUID | No | PK | 監査ログID |
| `user_id` | UUID | Yes | FK, INDEX | 実行ユーザー |
| `action_type` | VARCHAR(50) | No | INDEX | 操作種別 |
| `target_type` | VARCHAR(50) | No | INDEX | 対象種別 |
| `target_id` | VARCHAR(255) | Yes |  | 対象ID |
| `metadata` | JSON | Yes |  | 補足情報 |
| `created_at` | TIMESTAMP | No | INDEX | 作成日時 |

## 4. 主な制約
- `users.phone_number` は一意制約とする
- `credit_balances.user_id` は一意制約とする
- `reflections.session_id` は一意制約とし、1 セッション 1 振り返りを基本とする
- `payment_sessions.stripe_checkout_session_id` は一意制約とする

## 5. 主なインデックス
- `resume_files(user_id, deleted_at)`
- `interview_sessions(user_id, started_at desc)`
- `interview_messages(session_id, created_at)`
- `credit_transactions(user_id, created_at desc)`
- `payment_sessions(user_id, created_at desc)`
- `audit_logs(action_type, created_at desc)`

## 6. 運用上の注意点
- `credit_balances` は参照高速化用であり、正本は `credit_transactions` とする
- クレジット更新はトランザクション内で実施する
- S3 オブジェクト削除と `resume_files.deleted_at` 更新の整合性に注意する
- 課金関連は後追い調査できるよう削除しない方針を基本とする
