from __future__ import annotations

import json
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.test import Client, RequestFactory, TestCase, override_settings
from django.utils import timezone

from apps.billing.models import AuditLog
from apps.common.audit import log_audit_event
from apps.common.auth import AuthenticatedPrincipal, require_principal, require_role
from apps.users.models import AppUser


class AdminAndCommonTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.factory = RequestFactory()
        self.admin = AppUser.objects.create(
            user_id="admin_1",
            name="Admin",
            auth_provider=AppUser.AuthProvider.DEMO,
            role=AppUser.Role.ADMIN,
        )
        self.user = AppUser.objects.create(
            user_id="user_1",
            name="User",
            auth_provider=AppUser.AuthProvider.DEMO,
            role=AppUser.Role.USER,
        )

    def test_log_audit_event_creates_record(self):
        log = log_audit_event(
            action_type="test_action",
            target_type="test_target",
            target_id="t_1",
            user=self.admin,
            metadata={"foo": "bar"},
        )
        self.assertEqual(log.action_type, "test_action")
        self.assertEqual(AuditLog.objects.count(), 1)

    def test_require_principal_returns_401_when_missing(self):
        @require_principal
        def protected(_request):
            return None

        request = self.factory.get("/dummy")
        response = protected(request)
        self.assertEqual(response.status_code, 401)

    def test_require_role_returns_403_when_role_missing(self):
        @require_role("admin")
        def protected(_request):
            return None

        request = self.factory.get("/dummy")
        request.principal = AuthenticatedPrincipal(
            user_id=self.user.user_id,
            email=None,
            auth_provider="demo",
            roles=["user"],
        )
        response = protected(request)
        self.assertEqual(response.status_code, 403)

    def test_admin_health_requires_admin(self):
        response = self.client.get("/api/admin/health", HTTP_X_DEMO_USER=self.user.user_id)
        self.assertEqual(response.status_code, 403)

        response = self.client.get("/api/admin/health", HTTP_X_DEMO_USER=self.admin.user_id)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertEqual(data["data"]["status"], "ok")

    def test_admin_audit_logs_returns_entries(self):
        log_audit_event(
            action_type="demo_login",
            target_type="user",
            target_id=self.user.user_id,
            user=self.user,
        )
        response = self.client.get("/api/admin/audit-logs", HTTP_X_DEMO_USER=self.admin.user_id)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertEqual(len(data["data"]), 1)

    @override_settings(
        SYSTEM_MAINTENANCE_START_HOUR=1,
        SYSTEM_MAINTENANCE_END_HOUR=6,
        SYSTEM_MAINTENANCE_TIME_ZONE="Asia/Tokyo",
    )
    @patch("apps.common.maintenance.timezone.now")
    def test_system_maintenance_status_is_public(self, mocked_now):
        mocked_now.return_value = timezone.datetime(2026, 6, 2, 2, 0, tzinfo=ZoneInfo("Asia/Tokyo"))

        response = self.client.get("/api/system/maintenance")

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertTrue(data["data"]["is_maintenance"])
        self.assertEqual(data["data"]["starts_at_hour"], 1)
        self.assertEqual(data["data"]["ends_at_hour"], 6)
