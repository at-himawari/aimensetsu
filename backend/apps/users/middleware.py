from __future__ import annotations

from apps.common.auth import AuthenticationError
from .auth import build_auth_adapter, load_auth_settings


class AuthenticationMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.settings = load_auth_settings()

    def __call__(self, request):
        request.principal = None

        try:
            if self.settings.mode == "demo" and request.headers.get("X-Demo-User"):
                request.principal = build_auth_adapter().authenticate(request)
            elif request.headers.get("Authorization"):
                request.principal = build_auth_adapter().authenticate(request)
        except AuthenticationError:
            request.principal = None

        return self.get_response(request)
