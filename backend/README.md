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
