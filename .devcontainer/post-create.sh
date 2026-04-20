#!/usr/bin/env bash
set -euo pipefail

cd /workspace/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python manage.py migrate

cd /workspace/frontend
npm install
npx playwright install chromium

cd /workspace/infra
npm install
npm run build

cat <<'MSG'

Dev container ready.

Start the API:
  cd backend && .venv/bin/python manage.py runserver 0.0.0.0:8000

Start the frontend:
  cd frontend && npm run dev -- --host 0.0.0.0

MSG
