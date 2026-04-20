# Cognito CDK設計

## 方針

旧システムでは電話番号を収集していないため、CDKで作る新しいUser Poolは `email` を username attribute にします。電話番号認証と電話番号ユニーク制約は、ログイン後のアプリ側プロフィール登録で必須化します。

## 既存User Poolについて

旧システムのUser Poolに `phone_number` のサインイン設定がない場合、既存Poolをそのまま更新して電話番号ユニーク制約をCognito側で有効化することはできません。Cognitoのサインインオプション、つまり `AliasAttributes` と `UsernameAttributes` はUser Pool作成後に変更できないためです。

また、`phone_number` を必須属性にする設定もUser Pool作成後に切り替えできません。旧Poolに電話番号未登録ユーザーがいるため、このプロジェクトではCognito移行後のアプリ初回利用時に電話番号登録/検証を求めます。

## 新User Poolの設定

- `email` と `name` を必須属性にする。
- `phone_number` は任意属性にする。
- `email` を自動検証にする。
- `email` を username attribute にする。
- `email` の更新時は、更新後の値を反映する前に検証を要求する。
- SPA向けにclient secretなしのWeb Clientを作成する。
- Hosted UIのドメインは `cognitoDomainPrefix` context が設定された時だけ作成する。

## デプロイ

```bash
cd infra
npm install
npm run build
npx cdk synth
npx cdk deploy \
  -c environmentName=dev \
  -c callbackUrls='["http://localhost:5173/auth/callback"]' \
  -c logoutUrls='["http://localhost:5173/"]'
```

Hosted UIドメインを作る場合は、アカウント/リージョン内で一意のprefixを指定します。

```bash
npx cdk deploy \
  -c environmentName=dev \
  -c cognitoDomainPrefix=aimensetsu-dev-auth \
  -c callbackUrls='["http://localhost:5173/auth/callback"]' \
  -c logoutUrls='["http://localhost:5173/"]'
```

## 旧User Poolの確認

旧Poolが電話番号ユニーク化に対応できるか確認します。

```bash
aws cognito-idp describe-user-pool \
  --user-pool-id <OLD_USER_POOL_ID> \
  --query 'UserPool.{AliasAttributes:AliasAttributes,UsernameAttributes:UsernameAttributes,AutoVerifiedAttributes:AutoVerifiedAttributes,SchemaAttributes:SchemaAttributes[?Name==`phone_number`]}'
```

確認ポイント:

- `UsernameAttributes` に `phone_number` が含まれていれば、電話番号をサインアップ/サインイン用の一意値として扱えます。
- `AliasAttributes` に `phone_number` が含まれている場合、検証済み電話番号のサインイン先は一意に近い運用が可能ですが、旧Poolでは後付けできません。
- `UsernameAttributes` と `AliasAttributes` のどちらにも `phone_number` が無い場合、既存PoolではCognito側の電話番号ユニーク保証は追加できません。
- `SchemaAttributes` の `phone_number.Required` が `false` の場合、既存Poolでは必須属性へ変更できません。

## 移行案

1. CDKでメールサインインの新User Poolを作る。
2. 旧Poolのユーザー一覧をエクスポートする。
3. 電話番号が未登録またはE.164形式でないユーザーを洗い出す。
4. 重複電話番号を洗い出し、どのアカウントを正とするか決める。
5. 新Poolにユーザーを移行する。パスワードは移行できないため、初回ログイン時にパスワードリセットまたは移行Lambdaを使う。
6. フロントエンドのCognito設定を新PoolのUser Pool IDとClient IDへ切り替える。
7. バックエンドのJWT検証設定を新Poolへ切り替える。
8. ログイン後、電話番号未認証ユーザーを電話番号登録画面へ誘導する。

## 注意点

- アプリ側で登録する電話番号はE.164形式に正規化します。例: `+819012345678`
- 旧Poolがalias方式の場合、`ConfirmSignUp` で `forceAliasCreation` を使うと、既存アカウントからaliasを移動できてしまうため、このアプリでは使わない方針にします。
- SMS送信にはAWS側のSMS設定、SNS SMS sandbox、送信国の制約、料金が関係します。ステージングで実番号を使って検証します。
