from __future__ import annotations

import os
from pathlib import Path


def _optional_int(value: str | None) -> int | None:
    if value is None or value == "":
        return None
    return int(value)


def _optional_bool(value: str | None) -> bool | None:
    if value is None or value == "":
        return None
    return value.lower() in {"1", "true", "yes", "on"}


def _install_pymysql_if_needed(engine: str) -> None:
    if engine != "django.db.backends.mysql":
        return
    try:
        import MySQLdb  # noqa: F401
    except ImportError:
        import pymysql

        pymysql.install_as_MySQLdb()


def build_database_config(base_dir) -> dict:
    engine = os.getenv("DB_ENGINE", "django.db.backends.sqlite3")
    _install_pymysql_if_needed(engine)

    config = {
        "ENGINE": engine,
        "NAME": os.getenv("DB_NAME", str(base_dir / "db.sqlite3")),
    }
    if engine != "django.db.backends.mysql":
        return config

    config.update(
        {
            "USER": os.getenv("DB_USER", ""),
            "PASSWORD": os.getenv("DB_PASSWORD", ""),
            "HOST": os.getenv("DB_HOST", ""),
            "PORT": os.getenv("DB_PORT", "3306"),
            "CONN_MAX_AGE": _optional_int(os.getenv("DB_CONN_MAX_AGE_SECONDS")) or 60,
            "OPTIONS": {
                "charset": os.getenv("DB_CHARSET", "utf8mb4"),
                "connect_timeout": _optional_int(os.getenv("DB_CONNECT_TIMEOUT_SECONDS")) or 10,
                "init_command": os.getenv("DB_INIT_COMMAND", "SET sql_mode='STRICT_TRANS_TABLES'"),
            },
        }
    )
    ssl_ca = _resolve_ssl_ca_path(os.getenv("DB_SSL_CA"), base_dir)
    if ssl_ca:
        config["OPTIONS"]["ssl"] = {"ca": ssl_ca}
        ssl_check_hostname = _optional_bool(os.getenv("DB_SSL_CHECK_HOSTNAME"))
        if ssl_check_hostname is not None:
            config["OPTIONS"]["ssl"]["check_hostname"] = ssl_check_hostname
    elif os.getenv("DB_SSL_DISABLED", "false").lower() != "true":
        config["OPTIONS"]["ssl"] = {}

    return config


def _resolve_ssl_ca_path(ssl_ca: str | None, base_dir) -> str | None:
    if not ssl_ca:
        return None

    configured_path = Path(ssl_ca)
    if configured_path.is_file():
        return str(configured_path)

    bundled_path = Path(base_dir) / configured_path.name
    if bundled_path.is_file():
        return str(bundled_path)

    return ssl_ca
