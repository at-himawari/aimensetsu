from __future__ import annotations

import os
from pathlib import Path


def _iter_env_files(base_dir: Path):
    env_file = base_dir / ".env"
    if env_file.is_file():
        yield env_file

    for candidate in sorted(base_dir.glob(".env.*")):
        if not candidate.is_file():
            continue
        if candidate.name == ".env.example":
            continue
        yield candidate


def _parse_env_line(line: str) -> tuple[str, str] | None:
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        return None
    if stripped.startswith("export "):
        stripped = stripped[7:].lstrip()
    if "=" not in stripped:
        return None

    key, raw_value = stripped.split("=", 1)
    key = key.strip()
    if not key:
        return None

    value = raw_value.strip()
    if value[:1] == value[-1:] and value[:1] in {'"', "'"}:
        quote = value[:1]
        value = value[1:-1]
        if quote == '"':
            value = bytes(value, "utf-8").decode("unicode_escape")
    else:
        comment_index = value.find(" #")
        if comment_index >= 0:
            value = value[:comment_index].rstrip()

    return key, value


def load_backend_env() -> list[Path]:
    backend_dir = Path(__file__).resolve().parent.parent
    repo_root = backend_dir.parent
    protected_keys = set(os.environ)
    loaded_files: list[Path] = []
    file_loaded_keys: set[str] = set()

    for base_dir in (repo_root, backend_dir):
        for env_file in _iter_env_files(base_dir):
            for line in env_file.read_text(encoding="utf-8").splitlines():
                parsed = _parse_env_line(line)
                if parsed is None:
                    continue
                key, value = parsed
                if key in protected_keys and key not in file_loaded_keys:
                    continue
                os.environ[key] = value
                file_loaded_keys.add(key)
            loaded_files.append(env_file)

    return loaded_files
