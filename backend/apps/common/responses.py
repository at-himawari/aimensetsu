from __future__ import annotations

from django.http import JsonResponse


def meta_for_request(request) -> dict[str, str]:
    return {"request_id": getattr(request, "request_id", "")}


def json_success(request, data: dict | list, status: int = 200) -> JsonResponse:
    return JsonResponse({"data": data, "meta": meta_for_request(request)}, status=status)


def json_error(request, code: str, message: str, status: int) -> JsonResponse:
    return JsonResponse(
        {"error": {"code": code, "message": message}},
        status=status,
    )
