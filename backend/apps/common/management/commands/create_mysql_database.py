from __future__ import annotations

import os

from django.core.management.base import BaseCommand, CommandError


def _quote_mysql_identifier(identifier: str) -> str:
    if not identifier:
        raise CommandError("DB_NAME is required.")
    return f"`{identifier.replace('`', '``')}`"


def _quote_mysql_string(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


class Command(BaseCommand):
    help = "Create the configured MySQL database on an existing server if it does not exist."

    def add_arguments(self, parser):
        parser.add_argument("--database", default=os.getenv("DB_NAME"), help="Database name. Defaults to DB_NAME.")
        parser.add_argument("--charset", default=os.getenv("DB_CHARSET", "utf8mb4"))
        parser.add_argument("--collation", default=os.getenv("DB_COLLATION", "utf8mb4_unicode_ci"))
        parser.add_argument(
            "--grant-app-user",
            action="store_true",
            default=os.getenv("DB_CREATE_APP_USER", "false").lower() == "true",
            help="Create or update DB_USER and grant privileges on the database.",
        )

    def handle(self, *args, **options):
        if os.getenv("DB_ENGINE") != "django.db.backends.mysql":
            raise CommandError("DB_ENGINE must be django.db.backends.mysql.")

        try:
            import pymysql
        except ImportError as exc:
            raise CommandError("PyMySQL is required. Run pip install -r requirements.txt.") from exc

        database_name = options["database"]
        host = os.getenv("DB_HOST")
        port = int(os.getenv("DB_PORT", "3306"))
        user = os.getenv("DB_ADMIN_USER") or os.getenv("DB_USER")
        password = os.getenv("DB_ADMIN_PASSWORD") or os.getenv("DB_PASSWORD")
        if not host or not user:
            raise CommandError("DB_HOST and DB_ADMIN_USER or DB_USER are required.")

        ssl_options = None
        ssl_ca = os.getenv("DB_SSL_CA")
        if ssl_ca:
            ssl_options = {"ca": ssl_ca}
        elif os.getenv("DB_SSL_DISABLED", "false").lower() != "true":
            ssl_options = {}

        connection = pymysql.connect(
            host=host,
            port=port,
            user=user,
            password=password or "",
            charset="utf8mb4",
            autocommit=True,
            connect_timeout=int(os.getenv("DB_CONNECT_TIMEOUT_SECONDS", "10")),
            ssl=ssl_options,
        )
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    (
                        "CREATE DATABASE IF NOT EXISTS "
                        f"{_quote_mysql_identifier(database_name)} "
                        f"CHARACTER SET {options['charset']} "
                        f"COLLATE {options['collation']}"
                    )
                )
                if options["grant_app_user"]:
                    app_user = os.getenv("DB_USER")
                    app_password = os.getenv("DB_PASSWORD")
                    app_host = os.getenv("DB_USER_HOST", "%")
                    if not app_user or app_password is None:
                        raise CommandError("DB_USER and DB_PASSWORD are required when --grant-app-user is used.")
                    cursor.execute(
                        (
                            "CREATE USER IF NOT EXISTS "
                            f"{_quote_mysql_string(app_user)}@{_quote_mysql_string(app_host)} "
                            f"IDENTIFIED BY {_quote_mysql_string(app_password)}"
                        )
                    )
                    cursor.execute(
                        (
                            "ALTER USER "
                            f"{_quote_mysql_string(app_user)}@{_quote_mysql_string(app_host)} "
                            f"IDENTIFIED BY {_quote_mysql_string(app_password)}"
                        )
                    )
                    cursor.execute(
                        (
                            "GRANT ALL PRIVILEGES ON "
                            f"{_quote_mysql_identifier(database_name)}.* TO "
                            f"{_quote_mysql_string(app_user)}@{_quote_mysql_string(app_host)}"
                        )
                    )
        finally:
            connection.close()

        self.stdout.write(self.style.SUCCESS(f"Database {database_name} is ready."))
