from __future__ import annotations

import hmac
import json
import os
from hashlib import sha256

from django.test import TestCase

from apps.billing.models import CreditTransaction, PaymentSession
from apps.billing.services import create_checkout_session, handle_stripe_webhook
from apps.users.models import AppUser


class BillingServicesTestCase(TestCase):
    def setUp(self):
        self.user = AppUser.objects.create(
            user_id="usr_test",
            name="Test User",
            auth_provider=AppUser.AuthProvider.DEMO,
            role=AppUser.Role.USER,
        )
        os.environ["STRIPE_WEBHOOK_SECRET"] = "test-webhook-secret"

    def test_create_checkout_session_is_idempotent(self):
        first = create_checkout_session(
            user=self.user,
            plan_code="minutes_30",
            quantity=1,
            success_url="https://example.com/success",
            cancel_url="https://example.com/cancel",
            idempotency_key="idem_001",
        )
        second = create_checkout_session(
            user=self.user,
            plan_code="minutes_30",
            quantity=1,
            success_url="https://example.com/success",
            cancel_url="https://example.com/cancel",
            idempotency_key="idem_001",
        )

        self.assertEqual(first.payment_session_id, second.payment_session_id)
        self.assertEqual(PaymentSession.objects.count(), 1)

    def test_completed_webhook_reflects_credit_only_once(self):
        payment = create_checkout_session(
            user=self.user,
            plan_code="minutes_30",
            quantity=1,
            success_url="https://example.com/success",
            cancel_url="https://example.com/cancel",
            idempotency_key="idem_002",
        )
        payload = json.dumps(
            {
                "id": "evt_001",
                "type": "checkout.session.completed",
                "data": {"object": {"id": payment.stripe_checkout_session_id}},
            }
        ).encode("utf-8")
        signature = hmac.new(b"test-webhook-secret", payload, sha256).hexdigest()

        handle_stripe_webhook(payload, signature)
        handle_stripe_webhook(payload, signature)

        payment.refresh_from_db()
        self.user.credit_balance.refresh_from_db()
        self.assertEqual(payment.status, PaymentSession.Status.REFLECTED)
        self.assertEqual(self.user.credit_balance.available_minutes, 30)
        self.assertEqual(CreditTransaction.objects.count(), 1)
