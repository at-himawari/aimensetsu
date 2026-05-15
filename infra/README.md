# Infra

AWS で新たに作成するリソースは CDK で管理する前提です。

## 前提

- データベースは既存環境を利用する
- この CDK では新規RDSインスタンス作成は行わない
- 既存RDS MySQL上の本システム用DBは、バックエンドの `create_mysql_database` と `migrate` で作成・配置する
- 新規 AWS リソースの対象は主に以下
  - S3
  - Cognito
  - 必要に応じて IAM, Secrets Manager など

## セットアップ

```bash
cd infra
npm install
npm run synth
```

## 現在の構成

- S3 バケット
  - RESUME 保存用
- Cognito User Pool
- Cognito User Pool Client

## 既存RDS MySQLへのDB配置

CDKはRDSを作成しません。既存RDSの接続情報をバックエンド環境変数として渡し、以下を実行します。

```bash
cd backend
DB_ENGINE=django.db.backends.mysql \
DB_HOST=<existing-rds-endpoint> \
DB_PORT=3306 \
DB_NAME=voice_aimensetsu \
DB_USER=<app-user> \
DB_PASSWORD=<app-password> \
DB_ADMIN_USER=<admin-user> \
DB_ADMIN_PASSWORD=<admin-password> \
python manage.py create_mysql_database

DB_ENGINE=django.db.backends.mysql \
DB_HOST=<existing-rds-endpoint> \
DB_PORT=3306 \
DB_NAME=voice_aimensetsu \
DB_USER=<app-user> \
DB_PASSWORD=<app-password> \
python manage.py migrate
```

`DB_ADMIN_USER` / `DB_ADMIN_PASSWORD` はDB作成時だけ使います。アプリ実行時は最小権限の `DB_USER` / `DB_PASSWORD` を使ってください。
アプリ用DBユーザーも初期化時に作成・権限付与する場合は、管理ユーザーで `python manage.py create_mysql_database --grant-app-user` を実行します。

## Cognito ユーザープール移行

Cognito は既存ユーザーのパスワードやパスワードハッシュをエクスポートできません。初回パスワードリセットを許容する場合は、`old_aimensetsu` からユーザー属性を CSV でエクスポートし、`aimensetsu` に一括インポートします。

### 移行方式

1. `aimensetsu` の User Pool を CDK で作成する
2. new pool の CSV ヘッダーを取得する
3. `old_aimensetsu` のユーザー一覧を取得する
4. 補助スクリプトで Cognito import CSV を作成する
5. `aimensetsu` に CSV import job を作成、アップロード、開始する
6. ユーザーは初回ログイン時にパスワードリセットを行う

### 事前条件

- `old_aimensetsu` の User Pool ID を確認する
- `old_aimensetsu` と `aimensetsu` の必須属性を揃えておく
  - 移行ユーザーに `phone_number` がない場合があるため、この CDK では Cognito の必須属性は `email` のみにしています
  - 新規登録時の `phone_number` 必須チェックと重複チェックは PreSignUp Lambda で行います
- import job 用の CloudWatch Logs IAM role は CDK の `CognitoUserImportLogsRoleArn` 出力を使います
- パスワードリセットコードを送れるよう、インポートするユーザーには verified email または verified phone number が必要です

### 1. `aimensetsu` をデプロイ

```bash
cd infra
npm install
npm run deploy
```

### 2. CSV ヘッダーと old users を取得

```bash
aws cognito-idp get-csv-header \
  --user-pool-id <new aimensetsu user pool id> \
  > tmp/new-csv-header.json

aws cognito-idp list-users \
  --user-pool-id <old_aimensetsu user pool id> \
  > tmp/old-users.json
```

### 3. import CSV を作成

```bash
npm run cognito:csv -- \
  --input tmp/old-users.json \
  --headers tmp/new-csv-header.json \
  --output tmp/aimensetsu-import-users.csv \
  --default-phone-number 09012345678 \
  --required-attributes email \
  --username-attribute email
```

`--default-phone-number` を指定すると、`phone_number` がない移行ユーザーには Cognito 用に `+819012345678` のような E.164 形式へ変換して補完します。`--username-attribute email` で import CSV の `cognito:username` にはメールアドレスを入れます。`--required-attributes` で指定した属性が欠けているユーザー、または値が入っている既存 `phone_number` に重複がある場合は CSV 作成を止めます。

### 4. import job を作成して開始

```bash
aws cognito-idp create-user-import-job \
  --job-name old-aimensetsu-import \
  --user-pool-id <new aimensetsu user pool id> \
  --cloud-watch-logs-role-arn <CognitoUserImportLogsRoleArn>
```

レスポンスの `PreSignedUrl` に CSV を PUT します。

```bash
curl -T tmp/aimensetsu-import-users.csv "<PreSignedUrl>"
```

その後、レスポンスの `JobId` を使って import job を開始します。

```bash
aws cognito-idp start-user-import-job \
  --user-pool-id <new aimensetsu user pool id> \
  --job-id <job id>
```

### 5. アプリ設定を new pool に切り替え

フロントエンドとバックエンドは新しい `aimensetsu` の User Pool / Client を参照するように設定します。

```bash
AUTH_MODE=cognito
COGNITO_REGION=ap-northeast-1
COGNITO_USER_POOL_ID=<new aimensetsu user pool id>
COGNITO_APP_CLIENT_ID=<new aimensetsu app client id>

VITE_AUTH_MODE=cognito
VITE_COGNITO_REGION=ap-northeast-1
VITE_COGNITO_CLIENT_ID=<new aimensetsu app client id>
```

### 注意点

- CSV import されたユーザーは `RESET_REQUIRED` 状態になります。
- Hosted UI を使う場合、初回ログイン時は「Forgot password?」導線でパスワードを再設定してもらう運用にしてください。
- old 側にしかない custom attributes を移す場合は、新プールにも同じ custom attribute schema を追加してから CSV ヘッダーに含めてください。
- import CSV には全ヘッダー列が必要ですが、値が不要な列は空欄で構いません。

## 今後追加する候補

- Cloud Run から S3 を利用するための IAM 連携設計
- Secrets Manager
- バケットライフサイクルルール
