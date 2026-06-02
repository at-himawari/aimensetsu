from __future__ import annotations

from django.http import HttpRequest
from django.views.decorators.http import require_GET

from apps.common.auth import require_principal, require_role
from apps.billing.models import AuditLog
from .maintenance import maintenance_status
from .responses import json_success


@require_GET
@require_principal
@require_role("admin")
def health(request: HttpRequest):
    return json_success(
        request,
        {
            "status": "ok",
            "services": {
                "database": "unknown",
                "azure_openai": "unknown",
                "stripe": "unknown",
                "s3": "unknown",
            },
        },
    )


@require_GET
@require_principal
@require_role("admin")
def audit_logs(request: HttpRequest):
    logs = AuditLog.objects.select_related("user").order_by("-created_at")
    data = [
        {
            "audit_log_id": log.audit_log_id,
            "user_id": log.user_id,
            "action_type": log.action_type,
            "target_type": log.target_type,
            "target_id": log.target_id,
            "metadata": log.metadata,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]
    return json_success(request, data)


@require_GET
def system_maintenance(request: HttpRequest):
    return json_success(request, maintenance_status())
