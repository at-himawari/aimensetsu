# Infra

AWS で新たに作成するリソースは CDK で管理する前提です。

## 前提

- データベースは既存環境を利用する
- この CDK では新規 DB 作成は行わない
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
  - この CDK では `email` と `phone_number` を必須属性にしています
- import job 用の CloudWatch Logs IAM role を用意する
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
  --output tmp/aimensetsu-import-users.csv
```

### 4. import job を作成して開始

```bash
aws cognito-idp create-user-import-job \
  --job-name old-aimensetsu-import \
  --user-pool-id <new aimensetsu user pool id> \
  --cloud-watch-logs-role-arn <cloudwatch logs role arn>
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
