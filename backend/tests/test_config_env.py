from __future__ import annotations

import os
import tempfile
from pathlib import Path
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import SimpleTestCase

from config.database import build_database_config
from config.env import load_backend_env


class ConfigEnvTestCase(SimpleTestCase):
    def test_load_backend_env_reads_dotenv_files_in_order(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            backend_dir = repo_root / "backend"
            config_dir = backend_dir / "config"
            config_dir.mkdir(parents=True)
            env_module = config_dir / "env.py"
            env_module.write_text("", encoding="utf-8")

            (repo_root / ".env").write_text("FROM_ROOT=base\nSHARED_KEY=root\n", encoding="utf-8")
            (repo_root / ".env.local").write_text("FROM_ROOT_LOCAL=local\nSHARED_KEY=root_local\n", encoding="utf-8")
            (backend_dir / ".env").write_text("FROM_BACKEND=base\nSHARED_KEY=backend\n", encoding="utf-8")
            (backend_dir / ".env.development").write_text(
                "FROM_BACKEND_DEVELOPMENT=local\nSHARED_KEY=backend_local\n",
                encoding="utf-8",
            )
            (backend_dir / ".env.example").write_text("IGNORED_EXAMPLE=1\n", encoding="utf-8")

            with patch("config.env.__file__", str(env_module)):
                with patch.dict(os.environ, {}, clear=True):
                    loaded_files = load_backend_env()
                    self.assertEqual(os.environ["FROM_ROOT"], "base")
                    self.assertEqual(os.environ["FROM_ROOT_LOCAL"], "local")
                    self.assertEqual(os.environ["FROM_BACKEND"], "base")
                    self.assertEqual(os.environ["FROM_BACKEND_DEVELOPMENT"], "local")
                    self.assertEqual(os.environ["SHARED_KEY"], "backend_local")
                    self.assertNotIn("IGNORED_EXAMPLE", os.environ)
                    self.assertEqual(
                        [path.name for path in loaded_files],
                        [".env", ".env.local", ".env", ".env.development"],
                    )

    def test_load_backend_env_does_not_override_existing_process_env(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            backend_dir = repo_root / "backend"
            config_dir = backend_dir / "config"
            config_dir.mkdir(parents=True)
            env_module = config_dir / "env.py"
            env_module.write_text("", encoding="utf-8")

            (backend_dir / ".env").write_text("PRESERVED_KEY=file_value\nNEW_KEY=file_only\n", encoding="utf-8")

            with patch("config.env.__file__", str(env_module)):
                with patch.dict(os.environ, {"PRESERVED_KEY": "shell_value"}, clear=True):
                    load_backend_env()
                    self.assertEqual(os.environ["PRESERVED_KEY"], "shell_value")
                    self.assertEqual(os.environ["NEW_KEY"], "file_only")

    def test_build_database_config_supports_mysql_env(self):
        with patch.dict(
            os.environ,
            {
                "DB_ENGINE": "django.db.backends.mysql",
                "DB_NAME": "aimensetsu",
                "DB_USER": "app_user",
                "DB_PASSWORD": "password",
                "DB_HOST": "database.example.internal",
                "DB_PORT": "3306",
                "DB_SSL_DISABLED": "true",
            },
            clear=True,
        ):
            config = build_database_config(Path("/tmp/backend"))

        self.assertEqual(config["ENGINE"], "django.db.backends.mysql")
        self.assertEqual(config["NAME"], "aimensetsu")
        self.assertEqual(config["USER"], "app_user")
        self.assertEqual(config["HOST"], "database.example.internal")
        self.assertEqual(config["PORT"], "3306")
        self.assertEqual(config["CONN_MAX_AGE"], 60)
        self.assertEqual(config["OPTIONS"]["charset"], "utf8mb4")
        self.assertEqual(config["OPTIONS"]["connect_timeout"], 10)
        self.assertNotIn("ssl", config["OPTIONS"])

    def test_build_database_config_falls_back_to_bundled_ssl_ca(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            backend_dir = Path(temp_dir)
            (backend_dir / "ca.pem").write_text("cert", encoding="utf-8")
            with patch.dict(
                os.environ,
                {
                    "DB_ENGINE": "django.db.backends.mysql",
                    "DB_NAME": "aimensetsu",
                    "DB_USER": "app_user",
                    "DB_PASSWORD": "password",
                    "DB_HOST": "database.example.internal",
                    "DB_SSL_CA": "/Users/local/project/ca.pem",
                },
                clear=True,
            ):
                config = build_database_config(backend_dir)

        self.assertEqual(config["OPTIONS"]["ssl"]["ca"], str(backend_dir / "ca.pem"))

    @patch("pymysql.connect")
    def test_create_mysql_database_command(self, mocked_connect):
        cursor = mocked_connect.return_value.cursor.return_value.__enter__.return_value
        with patch.dict(
            os.environ,
            {
                "DB_ENGINE": "django.db.backends.mysql",
                "DB_NAME": "aimensetsu",
                "DB_HOST": "database.example.internal",
                "DB_ADMIN_USER": "admin",
                "DB_ADMIN_PASSWORD": "password",
                "DB_SSL_DISABLED": "true",
            },
            clear=True,
        ):
            output = StringIO()
            call_command("create_mysql_database", stdout=output)

        mocked_connect.assert_called_once()
        cursor.execute.assert_called_once_with(
            "CREATE DATABASE IF NOT EXISTS `aimensetsu` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )
        self.assertIn("Database aimensetsu is ready.", output.getvalue())

    @patch("pymysql.connect")
    def test_create_mysql_database_command_can_grant_app_user(self, mocked_connect):
        cursor = mocked_connect.return_value.cursor.return_value.__enter__.return_value
        with patch.dict(
            os.environ,
            {
                "DB_ENGINE": "django.db.backends.mysql",
                "DB_NAME": "aimensetsu",
                "DB_HOST": "database.example.internal",
                "DB_ADMIN_USER": "admin",
                "DB_ADMIN_PASSWORD": "password",
                "DB_USER": "aimensetsu_app",
                "DB_PASSWORD": "app_password",
                "DB_SSL_DISABLED": "true",
            },
            clear=True,
        ):
            call_command("create_mysql_database", "--grant-app-user", stdout=StringIO())

        statements = [call.args[0] for call in cursor.execute.call_args_list]
        self.assertIn(
            "CREATE USER IF NOT EXISTS 'aimensetsu_app'@'%' IDENTIFIED BY 'app_password'",
            statements,
        )
        self.assertIn(
            "GRANT ALL PRIVILEGES ON `aimensetsu`.* TO 'aimensetsu_app'@'%'",
            statements,
        )
