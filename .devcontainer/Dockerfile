FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        python3-venv \
        python3-dev \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN npx --yes playwright install-deps chromium

