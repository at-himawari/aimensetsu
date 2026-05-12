from __future__ import annotations

import hmac
import json
import os
from hashlib import sha256

from django.test import Client, TestCase

from apps.billing.models import CreditBalance
from apps.users.models import AppUser


class BillingViewsTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = AppUser.objects.create(
            user_id="billing_user",
            name="Billing User",
            auth_provider=AppUser.AuthProvider.DEMO,
            role=AppUser.Role.USER,
        )
        CreditBalance.objects.create(balance_id="bal_billing_user", user=self.user, available_minutes=15)
        os.environ["STRIPE_WEBHOOK_SECRET"] = "test-webhook-secret"

    def test_credit_balance_and_transactions(self):
        balance_response = self.client.get("/api/credits/balance", HTTP_X_DEMO_USER=self.user.user_id)
        tx_response = self.client.get("/api/credits/transactions", HTTP_X_DEMO_USER=self.user.user_id)
        self.assertEqual(balance_response.status_code, 200)
        self.assertEqual(tx_response.status_code, 200)

    def test_checkout_session_create_and_detail(self):
        response = self.client.post(
            "/api/billing/checkout-sessions",
            data=json.dumps(
                {
                    "plan_code": "minutes_30",
                    "quantity": 1,
                    "success_url": "https://example.com/success",
                    "cancel_url": "https://example.com/cancel",
                }
            ),
            content_type="application/json",
            HTTP_X_DEMO_USER=self.user.user_id,
            HTTP_IDEMPOTENCY_KEY="idem_view",
        )
        self.assertEqual(response.status_code, 201)
        payment_session_id = json.loads(response.content)["data"]["payment_session_id"]

        detail = self.client.get(
            f"/api/billing/checkout-sessions/{payment_session_id}",
            HTTP_X_DEMO_USER=self.user.user_id,
        )
        self.assertEqual(detail.status_code, 200)

    def test_stripe_webhook_rejects_missing_signature(self):
        response = self.client.post("/api/billing/webhooks/stripe", data="{}", content_type="application/json")
        self.assertEqual(response.status_code, 401)

    def test_stripe_webhook_processes_event(self):
        create = self.client.post(
            "/api/billing/checkout-sessions",
            data=json.dumps(
                {
                    "plan_code": "minutes_30",
                    "quantity": 1,
                    "success_url": "https://example.com/success",
                    "cancel_url": "https://example.com/cancel",
                }
            ),
            content_type="application/json",
            HTTP_X_DEMO_USER=self.user.user_id,
            HTTP_IDEMPOTENCY_KEY="idem_webhook",
        )
        checkout_session_id = json.loads(create.content)["data"]["checkout_session_id"]
        payload = json.dumps(
            {
                "id": "evt_123",
                "type": "checkout.session.completed",
                "data": {"object": {"id": checkout_session_id}},
            }
        ).encode("utf-8")
        signature = hmac.new(b"test-webhook-secret", payload, sha256).hexdigest()
        response = self.client.post(
            "/api/billing/webhooks/stripe",
            data=payload,
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE=signature,
        )
        self.assertEqual(response.status_code, 200)
