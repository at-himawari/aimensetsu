from __future__ import annotations

from dataclasses import dataclass
from functools import wraps

from django.http import HttpRequest

from .responses import json_error


@dataclass
class AuthenticatedPrincipal:
    user_id: str
    email: str | None
    auth_provider: str
    roles: list[str]


class AuthenticationError(Exception):
    pass


class PermissionDeniedError(Exception):
    pass


def require_principal(view_func):
    @wraps(view_func)
    def wrapped(request: HttpRequest, *args, **kwargs):
        principal = getattr(request, "principal", None)
        if principal is None:
            return json_error(request, "UNAUTHORIZED", "認証が必要です。", 401)
        return view_func(request, *args, **kwargs)

    return wrapped


def require_role(role: str):
    def decorator(view_func):
        @wraps(view_func)
        def wrapped(request: HttpRequest, *args, **kwargs):
            principal = getattr(request, "principal", None)
            if principal is None:
                return json_error(request, "UNAUTHORIZED", "認証が必要です。", 401)
            if role not in principal.roles:
                return json_error(request, "FORBIDDEN", "権限がありません。", 403)
            return view_func(request, *args, **kwargs)

        return wrapped

    return decorator
