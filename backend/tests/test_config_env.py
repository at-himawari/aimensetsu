from __future__ import annotations

import os
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.test import SimpleTestCase

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
