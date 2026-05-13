from __future__ import annotations

import hmac
import json
import os
from hashlib import sha256

from django.test import TestCase

from apps.billing.models import PaymentSession
from apps.billing.services import create_checkout_session, handle_stripe_webhook, verify_webhook_signature
from apps.users.models import AppUser


class BillingServiceBranchesTestCase(TestCase):
    def setUp(self):
        self.user = AppUser.objects.create(
            user_id="branch_user",
            name="Branch User",
            auth_provider=AppUser.AuthProvider.DEMO,
            role=AppUser.Role.USER,
        )
        os.environ["STRIPE_WEBHOOK_SECRET"] = "test-webhook-secret"
        os.environ["STRIPE_ALLOW_FAKE_CHECKOUT"] = "true"

    def test_create_checkout_session_rejects_invalid_inputs(self):
        with self.assertRaisesMessage(ValueError, "plan_code"):
            create_checkout_session(
                user=self.user,
                plan_code="bad",
                quantity=1,
                success_url="https://example.com/success",
                cancel_url="https://example.com/cancel",
                idempotency_key=None,
            )
        with self.assertRaisesMessage(ValueError, "quantity"):
            create_checkout_session(
                user=self.user,
                plan_code="minutes_30",
                quantity=0,
                success_url="https://example.com/success",
                cancel_url="https://example.com/cancel",
                idempotency_key=None,
            )

    def test_verify_webhook_signature_false_case(self):
        self.assertFalse(verify_webhook_signature(b"{}", "bad"))

    def test_handle_stripe_webhook_expired_and_failed(self):
        payment = create_checkout_session(
            user=self.user,
            plan_code="minutes_30",
            quantity=1,
            success_url="https://example.com/success",
            cancel_url="https://example.com/cancel",
            idempotency_key="idem_branch",
        )
        for event_type, expected_status in [
            ("checkout.session.expired", PaymentSession.Status.EXPIRED),
            ("checkout.session.async_payment_failed", PaymentSession.Status.FAILED),
        ]:
            payment.status = PaymentSession.Status.CREATED
            payment.save(update_fields=["status"])
            payload = json.dumps(
                {"id": "evt", "type": event_type, "data": {"object": {"id": payment.stripe_checkout_session_id}}}
            ).encode("utf-8")
            signature = hmac.new(b"test-webhook-secret", payload, sha256).hexdigest()
            handle_stripe_webhook(payload, signature)
            payment.refresh_from_db()
            self.assertEqual(payment.status, expected_status)

    def test_handle_stripe_webhook_raises_for_missing_id_and_unknown_event(self):
        payload = json.dumps({"id": "evt", "type": "checkout.session.completed", "data": {"object": {}}}).encode("utf-8")
        signature = hmac.new(b"test-webhook-secret", payload, sha256).hexdigest()
        with self.assertRaisesMessage(ValueError, "session id"):
            handle_stripe_webhook(payload, signature)

        payment = create_checkout_session(
            user=self.user,
            plan_code="minutes_30",
            quantity=1,
            success_url="https://example.com/success",
            cancel_url="https://example.com/cancel",
            idempotency_key="idem_unknown",
        )
        payload = json.dumps(
            {"id": "evt", "type": "unknown.event", "data": {"object": {"id": payment.stripe_checkout_session_id}}}
        ).encode("utf-8")
        signature = hmac.new(b"test-webhook-secret", payload, sha256).hexdigest()
        with self.assertRaisesMessage(ValueError, "未対応"):
            handle_stripe_webhook(payload, signature)
