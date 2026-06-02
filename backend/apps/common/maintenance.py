from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone as datetime_timezone
from zoneinfo import ZoneInfo

from django.conf import settings
from django.utils import timezone


@dataclass(frozen=True)
class MaintenanceWindow:
    start_hour: int
    end_hour: int
    timezone_name: str


def get_maintenance_window() -> MaintenanceWindow:
    return MaintenanceWindow(
        start_hour=getattr(settings, "SYSTEM_MAINTENANCE_START_HOUR", 1),
        end_hour=getattr(settings, "SYSTEM_MAINTENANCE_END_HOUR", 6),
        timezone_name=getattr(settings, "SYSTEM_MAINTENANCE_TIME_ZONE", "Asia/Tokyo"),
    )


def _to_local(value: datetime, window: MaintenanceWindow) -> datetime:
    return timezone.localtime(value, timezone=ZoneInfo(window.timezone_name))


def is_system_maintenance(now: datetime | None = None) -> bool:
    window = get_maintenance_window()
    current = _to_local(now or timezone.now(), window)
    return window.start_hour <= current.hour < window.end_hour


def next_maintenance_start(after: datetime) -> datetime:
    window = get_maintenance_window()
    local_after = _to_local(after, window)
    start_today = datetime.combine(
        local_after.date(),
        time(hour=window.start_hour),
        tzinfo=local_after.tzinfo,
    )
    if local_after < start_today:
        return start_today.astimezone(datetime_timezone.utc)
    return (start_today + timedelta(days=1)).astimezone(datetime_timezone.utc)


def maintenance_status(now: datetime | None = None) -> dict:
    window = get_maintenance_window()
    current = _to_local(now or timezone.now(), window)
    return {
        "is_maintenance": is_system_maintenance(current),
        "message": "午前1時から午前6時までは、システムメンテナンスのため利用できません。",
        "starts_at_hour": window.start_hour,
        "ends_at_hour": window.end_hour,
        "timezone": window.timezone_name,
    }
