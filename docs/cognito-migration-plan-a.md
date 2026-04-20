# Cognito移行案A: CSV一括インポート

旧システムのユーザー数が限定的なため、新User PoolへCSV一括インポートし、初回ログイン時はユーザーにパスワード再設定を依頼します。

## ユーザー体験

旧システムのパスワードは新User Poolへ移行されません。旧ユーザーは新システム初回ログイン時に「パスワードを再設定」から新しいパスワードを設定します。

ログイン画面には次の案内を表示します。

```text
旧システムをご利用の方へ
アカウントは移行済みです。初回ログイン時は「パスワードを再設定」から新しいパスワードを設定してください。
```

## 手順

1. 旧User Poolのサインイン属性と電話番号設定を確認する。

```bash
aws cognito-idp describe-user-pool \
  --user-pool-id <OLD_USER_POOL_ID> \
  --query 'UserPool.{AliasAttributes:AliasAttributes,UsernameAttributes:UsernameAttributes,AutoVerifiedAttributes:AutoVerifiedAttributes,SchemaAttributes:SchemaAttributes[?Name==`phone_number`]}'
```

2. 旧User PoolのユーザーをJSONでエクスポートする。

```bash
aws cognito-idp list-users \
  --user-pool-id <OLD_USER_POOL_ID> \
  --output json > tmp/old-cognito-users.json
```

ユーザー数が多くページングが必要な場合は、`PaginationToken` を使って全件取得します。

3. インポートCSVと監査レポートを作成する。

```bash
node infra/scripts/prepare-cognito-import.mjs \
  --input tmp/old-cognito-users.json \
  --out-dir tmp/cognito-import
```

出力:

- `tmp/cognito-import/cognito-import.csv`
- `tmp/cognito-import/audit-report.md`
- `tmp/cognito-import/old-to-new-sub-map.template.csv`

4. `audit-report.md` を確認する。

インポート前に解消する項目:

- `email` が重複している

今回の方針では、旧システムで電話番号を収集していないため、`phone_number` が空の旧ユーザーも新User Poolへメールアカウントとして移行します。電話番号はログイン後、アプリ側でSMS認証を必須化します。

ログイン後に対応する項目:

- `phone_number` が空
- `phone_number` がE.164形式ではない
- `phone_number` が重複している
- `phone_number_verified=false`

5. CDKで新User Poolを作成する。

```bash
cd infra
npm install
npm run build
npx cdk deploy \
  -c environmentName=dev \
  -c cognitoDomainPrefix=aimensetsu-dev-auth \
  -c callbackUrls='["http://localhost:5173/auth/callback"]' \
  -c logoutUrls='["http://localhost:5173/"]'
```

6. CognitoのCSVインポートジョブを作成し、`cognito-import.csv` を投入する。

CSVインポートはAWS CLIまたはAWS Consoleから実行します。CognitoのインポートジョブはCloudWatch Logs roleが必要です。

7. 新User Poolのユーザーと旧ユーザーの対応表を作る。

インポート後、新User Poolから `list-users` でユーザーを取得し、メール/電話番号で `old-to-new-sub-map.template.csv` の `new_sub` を埋めます。この対応表はアプリDB移行で使います。

8. フロントエンドとバックエンドの認証設定を新User Poolへ切り替える。

バックエンド:

```env
AUTH_MODE=cognito
COGNITO_REGION=ap-northeast-1
COGNITO_USER_POOL_ID=<NEW_USER_POOL_ID>
COGNITO_APP_CLIENT_ID=<NEW_CLIENT_ID>
COGNITO_ISSUER=https://cognito-idp.ap-northeast-1.amazonaws.com/<NEW_USER_POOL_ID>
```

## 注意点

- パスワードは移行されません。
- 旧Cognito `sub` は新User Poolでは変わります。
- 電話番号はE.164形式である必要があります。例: `+819012345678`
- 電話番号未登録ユーザーは、ログイン後に電話番号登録画面へ誘導します。
- 電話番号重複はアプリDBの一意制約で拒否します。
- ユーザー告知と問い合わせ導線を用意してから切り替えてください。
