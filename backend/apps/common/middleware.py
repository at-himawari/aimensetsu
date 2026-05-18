from __future__ import annotations

import os
from uuid import uuid4

from django.http import HttpResponse


DEFAULT_CORS_ALLOWED_ORIGINS = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://aimensetsu.at-himawari.com",
    "https://aimensetsu.ct-himawari.com",
}


def _get_cors_allowed_origins() -> set[str]:
    configured_origins = {
        origin.strip()
        for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
        if origin.strip()
    }
    return DEFAULT_CORS_ALLOWED_ORIGINS | configured_origins


class CorsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        origin = request.headers.get("Origin")
        allowed_origins = _get_cors_allowed_origins()

        if request.method == "OPTIONS" and origin in allowed_origins:
            response = HttpResponse(status=204)
        else:
            response = self.get_response(request)

        if origin in allowed_origins:
            response["Access-Control-Allow-Origin"] = origin
            response["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
            response["Access-Control-Allow-Headers"] = "Authorization, Content-Type, Idempotency-Key, X-Demo-User, X-Request-Id"
            response["Access-Control-Expose-Headers"] = "X-Request-Id"
            response["Vary"] = "Origin"

        return response


class RequestIDMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.request_id = request.headers.get("X-Request-Id") or f"req_{uuid4().hex}"
        response = self.get_response(request)
        response["X-Request-Id"] = request.request_id
        return response
