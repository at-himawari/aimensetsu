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

## 今後追加する候補

- Cloud Run から S3 を利用するための IAM 連携設計
- Secrets Manager
- バケットライフサイクルルール
