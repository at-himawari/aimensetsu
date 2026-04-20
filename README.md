# AI面接コーチ

面接が苦手な人に向けて、AIとの対話練習、職務経歴書に基づく質問、練習履歴、振り返り、追加課金を提供するアプリです。

## 今回の実装

- React / TypeScript / Tailwind CSS のフロントエンドMVP
- Django のJSON APIバックエンドMVP
- 開発用デモ認証、履歴、削除、職務経歴書アップロード、練習メッセージ、振り返り生成
- 30分単位のクレジット管理モデル
- Stripe Checkout Sessions 連携用エンドポイント
- Azure OpenAI 連携用アダプタと、未設定時のローカル応答
- デザインルール、API設計、テスト方針ドキュメント

## セットアップ

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

### フロントエンド

```bash
cd frontend
npm install
npm run dev
```

フロントエンドは `http://localhost:5173`、バックエンドは `http://localhost:8000` で起動します。

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
- デザインルールは `docs/design-rules.md` に記載。

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

## リリース準備

リリースまでのTodoは `docs/release-todo.md` にチェックリストとして整理しています。

## インフラ

Cognito User PoolはCDKで管理します。電話番号認証と電話番号ユニーク化の設計は `docs/cognito-cdk.md`、CDKコードは `infra/` に配置しています。
