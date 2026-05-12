from django.urls import path

from .views import audit_logs, health


urlpatterns = [
    path("admin/health", health, name="admin-health"),
    path("admin/audit-logs", audit_logs, name="admin-audit-logs"),
]
