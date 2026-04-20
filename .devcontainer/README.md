# Dev Container

この開発コンテナは、フロントエンドとバックエンドを同じコンテナ内で動かすための環境です。

## 起動後

APIを起動します。

```bash
cd backend
.venv/bin/python manage.py runserver 0.0.0.0:8000
```

別ターミナルでフロントエンドを起動します。

```bash
cd frontend
npm run dev -- --host 0.0.0.0
```

## ポート

- Frontend: `5173`
- Django API: `8000`

## 初期化

`post-create.sh` が次の処理を行います。

- Python仮想環境の作成
- Django依存関係のインストール
- migration実行
- npm依存関係のインストール
- Playwright Chromiumのインストール

