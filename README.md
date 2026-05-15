# AI面接コーチ

面接が苦手な人に向けて、AIとの対話練習、職務経歴書に基づく質問、練習履歴、振り返り、追加課金を提供するアプリです。

## 今回の実装

- AIとの対話機能（Azure OpenAI Realtime API）
- React / TypeScript / Tailwind CSS のフロントエンドMVP
- Django のJSON APIバックエンドMVP
- 開発用デモ認証、履歴、削除、職務経歴書アップロード、練習メッセージ、振り返り生成
- 30分単位のクレジット管理モデル
- Stripe Checkout Sessions 連携用エンドポイント
- Azure OpenAI 連携用アダプタと、未設定時のローカル応答
- デザインルール、API設計、テスト方針ドキュメント

## セットアップ

Stripe は、ローカルでは test、本番では live を使い分ける前提で以下を設定します。

```bash
STRIPE_SECRET_KEY_TEST=sk_test_xxx
STRIPE_WEBHOOK_SECRET_TEST=whsec_test_xxx
STRIPE_PRICE_ID_MINUTES_30_TEST=price_test_xxx

STRIPE_SECRET_KEY_LIVE=sk_live_xxx
STRIPE_WEBHOOK_SECRET_LIVE=whsec_live_xxx
STRIPE_PRICE_ID_MINUTES_30_LIVE=price_live_xxx
```

`DEBUG=True` のときは test 用のキーと Price、`DEBUG=False` のときは live 用のキーと Price を優先して使います。`STRIPE_MODE=test|live` を明示すると、`DEBUG` に関係なく切り替えられます。

Price ID を未設定にした場合は、アプリ側の金額定義から inline price を組み立てて Checkout Session を発行します。

### バックエンド

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env
python manage.py migrate
python manage.py runserver 8000
```

バックエンドは起動時に `backend/.env` と `backend/.env.*`、あわせてリポジトリ直下の `.env` と `.env.*` を自動で読み込みます。読み込み順は `.env` のあとに `.env.*` で、後ろのファイルが上書きします。シェルですでに設定済みの環境変数は上書きしません。

`AUTH_MODE=cognito` を使う場合は、バックエンドに Cognito の検証設定を入れます。`COGNITO_ISSUER` を省略した場合は region と user pool id から自動で組み立てます。

```bash
AUTH_MODE=cognito
COGNITO_REGION=ap-northeast-1
COGNITO_USER_POOL_ID=ap-northeast-1_xxxxx
COGNITO_APP_CLIENT_ID=your-app-client-id
```

#### 既存RDS MySQLを使う場合

既存のRDSインスタンス内に本システム用DBを作成し、Djangoのマイグレーションでテーブルを配置します。RDS自体はCDKで新規作成しません。

```bash
DB_ENGINE=django.db.backends.mysql
DB_HOST=your-rds-endpoint.ap-northeast-1.rds.amazonaws.com
DB_PORT=3306
DB_NAME=voice_aimensetsu
DB_USER=aimensetsu_app
DB_PASSWORD=your-app-password
```

DB作成権限をアプリ用ユーザーに渡さない場合は、初期化時だけ管理ユーザーを指定します。

```bash
DB_ADMIN_USER=admin_user
DB_ADMIN_PASSWORD=admin_password
python manage.py create_mysql_database
python manage.py migrate
```

アプリ用DBユーザーも初期化時に作成・権限付与したい場合は、管理ユーザーで以下を実行します。

```bash
python manage.py create_mysql_database --grant-app-user
```

RDSでSSL接続を必須にする場合は `DB_SSL_CA=/path/to/rds-ca.pem` を指定してください。検証環境などでSSLを無効化する場合のみ `DB_SSL_DISABLED=true` を指定します。

### フロントエンド

```bash
cd frontend
npm install
npm run dev
```

フロントエンドは `http://localhost:5173`、バックエンドは `http://localhost:8000` で起動します。

`VITE_AUTH_MODE=cognito` を使う場合は、フロントエンドにも以下の設定を入れます。

```bash
VITE_COGNITO_DOMAIN=https://your-domain.auth.ap-northeast-1.amazoncognito.com
VITE_COGNITO_CLIENT_ID=your-app-client-id
VITE_COGNITO_REDIRECT_URI=http://localhost:5173
VITE_COGNITO_LOGOUT_URI=http://localhost:5173
```

## 開発用ログイン

`AUTH_MODE=demo` の場合、フロントエンドのデモログインボタンで `X-Demo-User` ヘッダーを送ります。本番では Cognito Hosted UI または Amplify Auth で取得したJWTを `Authorization: Bearer ...` として送信し、バックエンドの認証アダプタをCognito検証に切り替えます。

## 機能

- ログイン、認証機能
  - Cognitoによる認証
  - パスキー認証導入
  - 大量アカウント作成防止のため電話番号にて認証し、電話番号の重複登録を許さない
  - メールアドレス、名前を記録する
  - パスワードリセット機能を導入
- 練習履歴の表示
  - これまでの履歴を入れる
  - 履歴は削除可能にする
- AIと対話による練習
  - 職務経歴書等がアップロードでき、それに基づいた対話ができるようにする。
  - AIっぽいメッシュのダイナミックな模様が声に合わせて動くようにしたい
  - 30分ごとに300円のクオータを設ける
  - Stripeで追加の課金を行う。（デフォルトは30分）
- 振り返り機能
  - 良かった点、改善点等をフィードバック

## 技術要素

- フロントエンド
  - React
  - TypeScript
  - Tailwind CSS
  - Cloudflare Workers
- バックエンド
  - Python3
  - Django
  - Google Cloud Run

## 画面デザイン

- シンプルなのがベストだが、質素になりすぎないようにする。

## 要望

- インフラはできるだけ安いものを利用する。
- RDSは利用可能なので、それを利用しても良い。
- OpenAIのサービスを使う際は、Azureを通して行う。

## テスト

```bash
cd backend
python manage.py test

cd ../frontend
npm run test
npm run e2e
```

- ユニットテスト
- E2Eテスト
- 特に課金周りは丁寧に行う。

## 移行データ

### 現行システム

- https://github.com/at-himawari/aimensetsu-backend
- https://github.com/at-himawari/aimensetsu-frontend

### データ移行

Cognitoのユーザーデータを現行システムから当システムに移行したい。

Cognito ユーザープール移行は `infra` の CDK と補助スクリプトで実施します。既存プールから `list-users` した JSON を新プールの import CSV に変換し、CDK が出力する `CognitoUserImportLogsRoleArn` を使って user import job を作成します。詳細手順は [infra/README.md](/Users/n-syuichi/projects/aimensetsu/infra/README.md) を参照してください。
