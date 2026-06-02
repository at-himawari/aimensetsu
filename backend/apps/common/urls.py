from django.urls import path

from .views import audit_logs, health, system_maintenance


urlpatterns = [
    path("admin/health", health, name="admin-health"),
    path("admin/audit-logs", audit_logs, name="admin-audit-logs"),
    path("system/maintenance", system_maintenance, name="system-maintenance"),
]
