# Backend

## セットアップ

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py runserver 8000
```

## 開発用フラグ

- `ALLOW_INTERVIEW_WITHOUT_CREDITS=true`: クレジット残高が 0 分でも面接セッションを開始でき、終了時のクレジット消費も 0 分にします。

## Cloud Run 用コンテナ

Cloud Run は `PORT` 環境変数を渡すため、コンテナは `gunicorn` で `0.0.0.0:$PORT` を listen します。

```bash
cd backend
podman build -t asia-northeast1-docker.pkg.dev/PROJECT_ID/REPOSITORY/aimensetsu-backend:latest .
podman run --rm -p 8080:8080 --env-file .env.local asia-northeast1-docker.pkg.dev/PROJECT_ID/REPOSITORY/aimensetsu-backend:latest
```

Cloud Run では少なくとも以下を環境変数として設定してください。

- `DJANGO_SECRET_KEY`
- `DJANGO_DEBUG=false`
- `DJANGO_ALLOWED_HOSTS`（例: `your-service-url.run.app,api.example.com`）
- `DB_ENGINE=django.db.backends.mysql`
- `DB_HOST`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`

マイグレーションはデプロイ前後に Cloud Run Job など単発ジョブで実行してください。

## CD

GitHub Actions の `Backend CD` workflow が、`main` ブランチへの backend 変更を `aimensetsu` Cloud Run サービスへデプロイします。

必要な GitHub Secrets:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

workflow は Cloud Run の環境変数を変更しません。DB 接続情報や API キーは Cloud Run サービス側で管理してください。

## 現在の実装

- Django プロジェクトの土台
- アプリ分割
  - `common`
  - `users`
  - `resumes`
  - `interviews`
  - `billing`
  - `integrations`
- `request_id` ミドルウェア
- `/api/admin/health` ヘルスチェック API
