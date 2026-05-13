#!/usr/bin/env python3
import os
import sys

from config.env import load_backend_env


def main() -> None:
    load_backend_env()
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
