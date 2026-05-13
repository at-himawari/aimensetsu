from __future__ import annotations

import hmac
import json
import os
import time
from hashlib import sha256
from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings

from apps.billing.models import CreditTransaction, PaymentSession
from apps.billing.services import (
    _get_stripe_price_id,
    _get_stripe_secret_key,
    _get_stripe_webhook_secret,
    create_checkout_session,
    confirm_checkout_session,
    handle_stripe_webhook,
    verify_webhook_signature,
)
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
        os.environ.pop("STRIPE_SECRET_KEY", None)
        os.environ["STRIPE_ALLOW_FAKE_CHECKOUT"] = "true"

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

    @patch.dict(os.environ, {"STRIPE_SECRET_KEY": "sk_test_key"})
    @patch("apps.billing.services.request.urlopen")
    def test_create_checkout_session_calls_stripe_api_when_configured(self, mocked_urlopen):
        mocked_response = MagicMock()
        mocked_response.read.return_value = json.dumps(
            {
                "id": "cs_live_test",
                "url": "https://checkout.stripe.com/c/pay/cs_live_test",
            }
        ).encode("utf-8")
        mocked_urlopen.return_value.__enter__.return_value = mocked_response

        payment = create_checkout_session(
            user=self.user,
            plan_code="minutes_30",
            quantity=2,
            success_url="https://example.com/success",
            cancel_url="https://example.com/cancel",
            idempotency_key="idem_stripe",
        )

        self.assertEqual(payment.stripe_checkout_session_id, "cs_live_test")
        self.assertEqual(payment.checkout_url, "https://checkout.stripe.com/c/pay/cs_live_test")
        req = mocked_urlopen.call_args.args[0]
        self.assertEqual(req.full_url, "https://api.stripe.com/v1/checkout/sessions")
        self.assertEqual(req.headers["Authorization"], "Bearer sk_test_key")
        self.assertEqual(req.headers["Stripe-version"], "2026-02-25.clover")
        self.assertEqual(req.headers["Idempotency-key"], "idem_stripe")
        self.assertIn(b"mode=payment", req.data)
        self.assertIn(b"line_items%5B0%5D%5Bquantity%5D=2", req.data)

    @override_settings(DEBUG=True)
    @patch.dict(
        os.environ,
        {
            "STRIPE_SECRET_KEY_TEST": "sk_test_key",
            "STRIPE_PRICE_ID_MINUTES_30_TEST": "price_test_minutes_30",
        },
        clear=False,
    )
    @patch("apps.billing.services.request.urlopen")
    def test_create_checkout_session_uses_test_price_id_in_debug(self, mocked_urlopen):
        mocked_response = MagicMock()
        mocked_response.read.return_value = json.dumps(
            {
                "id": "cs_live_with_price",
                "url": "https://checkout.stripe.com/c/pay/cs_live_with_price",
            }
        ).encode("utf-8")
        mocked_urlopen.return_value.__enter__.return_value = mocked_response

        create_checkout_session(
            user=self.user,
            plan_code="minutes_30",
            quantity=1,
            success_url="https://example.com/success",
            cancel_url="https://example.com/cancel",
            idempotency_key="idem_price_id",
        )

        req = mocked_urlopen.call_args.args[0]
        self.assertIn(b"line_items%5B0%5D%5Bprice%5D=price_test_minutes_30", req.data)
        self.assertNotIn(b"line_items%5B0%5D%5Bprice_data%5D", req.data)

    @override_settings(DEBUG=False)
    @patch.dict(
        os.environ,
        {
            "STRIPE_SECRET_KEY_TEST": "sk_test_key",
            "STRIPE_SECRET_KEY_LIVE": "sk_live_key",
            "STRIPE_PRICE_ID_MINUTES_30_TEST": "price_test_minutes_30",
            "STRIPE_PRICE_ID_MINUTES_30_LIVE": "price_live_minutes_30",
            "STRIPE_WEBHOOK_SECRET_TEST": "whsec_test",
            "STRIPE_WEBHOOK_SECRET_LIVE": "whsec_live",
        },
        clear=False,
    )
    def test_live_mode_prefers_live_stripe_configuration(self):
        price = {
            "stripe_price_env": "STRIPE_PRICE_ID_MINUTES_30",
        }

        self.assertEqual(_get_stripe_secret_key(), "sk_live_key")
        self.assertEqual(_get_stripe_price_id(price), "price_live_minutes_30")
        self.assertEqual(_get_stripe_webhook_secret(), "whsec_live")

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

    @patch("apps.billing.services._retrieve_stripe_checkout_session")
    def test_confirm_checkout_session_reflects_credit_when_stripe_reports_paid(self, mocked_retrieve):
        mocked_retrieve.return_value = {
            "id": "cs_test_paid",
            "payment_status": "paid",
            "status": "complete",
        }
        payment = create_checkout_session(
            user=self.user,
            plan_code="minutes_30",
            quantity=1,
            success_url="https://example.com/success",
            cancel_url="https://example.com/cancel",
            idempotency_key="idem_confirm",
        )

        confirmed = confirm_checkout_session(
            user=self.user,
            stripe_checkout_session_id=payment.stripe_checkout_session_id,
        )

        self.assertEqual(confirmed.status, PaymentSession.Status.REFLECTED)
        self.user.credit_balance.refresh_from_db()
        self.assertEqual(self.user.credit_balance.available_minutes, 30)

    def test_verify_webhook_signature_accepts_stripe_cli_format(self):
        payload = b'{"id":"evt_001"}'
        timestamp = int(time.time())
        expected = hmac.new(
            b"test-webhook-secret",
            f"{timestamp}.".encode("utf-8") + payload,
            sha256,
        ).hexdigest()

        self.assertTrue(verify_webhook_signature(payload, f"t={timestamp},v1={expected}"))
