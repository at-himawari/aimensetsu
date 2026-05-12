from __future__ import annotations

import uuid

from apps.billing.models import AuditLog
from apps.users.models import AppUser


def log_audit_event(
    *,
    action_type: str,
    target_type: str,
    target_id: str | None = None,
    user: AppUser | None = None,
    metadata: dict | None = None,
) -> AuditLog:
    return AuditLog.objects.create(
        audit_log_id=f"audit_{uuid.uuid4().hex}",
        user=user,
        action_type=action_type,
        target_type=target_type,
        target_id=target_id,
        metadata=metadata or {},
    )
