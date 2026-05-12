from django.urls import path

from .views import demo_login, logout, me, user_profile


urlpatterns = [
    path("auth/demo-login", demo_login, name="auth-demo-login"),
    path("auth/me", me, name="auth-me"),
    path("auth/logout", logout, name="auth-logout"),
    path("users/me", user_profile, name="users-me"),
]
