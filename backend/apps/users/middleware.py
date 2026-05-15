from __future__ import annotations

import logging

from django.conf import settings

from apps.common.auth import AuthenticationError
from .auth import CognitoJwtAuthAdapter, DemoAuthAdapter, load_auth_settings


logger = logging.getLogger(__name__)


class AuthenticationMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.settings = load_auth_settings()

    def __call__(self, request):
        request.principal = None

        try:
            if self.settings.mode == "demo" and request.headers.get("X-Demo-User"):
                request.principal = DemoAuthAdapter().authenticate(request)
            elif request.headers.get("Authorization"):
                request.principal = CognitoJwtAuthAdapter(self.settings).authenticate(request)
        except AuthenticationError as exc:
            if settings.DEBUG:
                logger.warning("Authentication failed: %s", exc)
            request.principal = None

        return self.get_response(request)
