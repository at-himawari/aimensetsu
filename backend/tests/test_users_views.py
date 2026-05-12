from __future__ import annotations

import json
import os

from django.test import Client, TestCase

from apps.users.models import AppUser


class UsersViewsTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        os.environ["AUTH_MODE"] = "demo"

    def test_demo_login_rejects_invalid_json(self):
        response = self.client.post(
            "/api/auth/demo-login",
            data="{",
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_demo_login_creates_user_and_returns_token(self):
        response = self.client.post(
            "/api/auth/demo-login",
            data=json.dumps({"demo_user_id": "demo_1", "name": "Demo User"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(AppUser.objects.filter(user_id="demo_1").exists())

    def test_me_requires_auth(self):
        response = self.client.get("/api/auth/me")
        self.assertEqual(response.status_code, 401)

    def test_user_profile_patch_and_get(self):
        AppUser.objects.create(
            user_id="demo_2",
            name="Demo2",
            auth_provider=AppUser.AuthProvider.DEMO,
            role=AppUser.Role.USER,
        )
        patch_response = self.client.patch(
            "/api/users/me",
            data=json.dumps(
                {
                    "name": "Updated Name",
                    "display_name": "Display",
                    "target_job_role": "Backend Engineer",
                }
            ),
            content_type="application/json",
            HTTP_X_DEMO_USER="demo_2",
        )
        self.assertEqual(patch_response.status_code, 200)

        get_response = self.client.get("/api/users/me", HTTP_X_DEMO_USER="demo_2")
        self.assertEqual(get_response.status_code, 200)
        data = json.loads(get_response.content)
        self.assertEqual(data["data"]["name"], "Updated Name")
        self.assertEqual(data["data"]["display_name"], "Display")

    def test_user_profile_patch_rejects_invalid_json(self):
        AppUser.objects.create(
            user_id="demo_3",
            name="Demo3",
            auth_provider=AppUser.AuthProvider.DEMO,
            role=AppUser.Role.USER,
        )
        response = self.client.patch(
            "/api/users/me",
            data="{",
            content_type="application/json",
            HTTP_X_DEMO_USER="demo_3",
        )
        self.assertEqual(response.status_code, 400)
