# Infrastructure

AWS CDKでCognito認証基盤を管理します。

## セットアップ

```bash
cd infra
npm install
npm run build
npx cdk synth
```

## Cognito

Auth stackは、電話番号認証と電話番号ユニーク運用を前提にした新しいUser Poolを作成します。

詳しくは `docs/cognito-cdk.md` を参照してください。

旧User PoolからのCSV一括移行は `docs/cognito-migration-plan-a.md` を参照してください。
