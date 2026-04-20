# アーキテクチャ

## 全体

フロントエンドはCloudflare PagesまたはWorkers Static Assetsに配置し、Django APIはCloud Runへ配置します。データベースは初期はSQLiteまたは安価なPostgreSQLで開始し、既存RDSが使える場合はDjangoの接続先をRDS PostgreSQLへ切り替えます。

## 認証

本番はCognito User Poolを利用します。メール、氏名、電話番号を必須属性にし、電話番号はCognito側のエイリアスまたはDjango側の `UserProfile.phone_number` 一意制約で重複を防ぎます。パスキーはCognitoのWebAuthn対応を利用し、フロントエンドでHosted UIまたはAmplify Authを組み込みます。

## AI

AI接続は `AzureInterviewCoach` に閉じ込めます。環境変数が未設定の場合は `LocalInterviewCoach` が動き、開発とテストでは外部APIを呼びません。

## 課金

30分を1ブロックとし、Stripe Checkout Sessionsで追加クレジットを購入します。Webhookで `checkout.session.completed` を受け取り、該当ユーザーにクレジットを付与する設計です。

## API

- `GET /api/me/`
- `GET /api/sessions/`
- `POST /api/sessions/`
- `DELETE /api/sessions/<id>/`
- `POST /api/sessions/<id>/documents/`
- `POST /api/sessions/<id>/messages/`
- `POST /api/sessions/<id>/feedback/`
- `POST /api/billing/checkout/`
- `POST /api/billing/webhook/`

