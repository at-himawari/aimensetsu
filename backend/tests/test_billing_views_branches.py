from __future__ import annotations

import json
from unittest.mock import patch

from django.test import Client, TestCase

from apps.users.models import AppUser


class BillingViewsBranchesTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = AppUser.objects.create(
            user_id="billing_branch",
            name="Billing Branch",
            auth_provider=AppUser.AuthProvider.DEMO,
            role=AppUser.Role.USER,
        )

    def test_checkout_session_invalid_json_and_invalid_request(self):
        response = self.client.post(
            "/api/billing/checkout-sessions",
            data="{",
            content_type="application/json",
            HTTP_X_DEMO_USER=self.user.user_id,
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.post(
            "/api/billing/checkout-sessions",
            data=json.dumps({"plan_code": "bad", "quantity": 1}),
            content_type="application/json",
            HTTP_X_DEMO_USER=self.user.user_id,
        )
        self.assertEqual(response.status_code, 400)

    def test_checkout_session_detail_not_found(self):
        response = self.client.get("/api/billing/checkout-sessions/missing", HTTP_X_DEMO_USER=self.user.user_id)
        self.assertEqual(response.status_code, 404)

    def test_stripe_webhook_error_branches(self):
        with patch("apps.billing.views.handle_stripe_webhook", side_effect=PermissionError("bad sig")):
            response = self.client.post(
                "/api/billing/webhooks/stripe",
                data=b"{}",
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="sig",
            )
            self.assertEqual(response.status_code, 401)

        with patch("apps.billing.views.handle_stripe_webhook", side_effect=ValueError("bad event")):
            response = self.client.post(
                "/api/billing/webhooks/stripe",
                data=b"{}",
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="sig",
            )
            self.assertEqual(response.status_code, 400)
