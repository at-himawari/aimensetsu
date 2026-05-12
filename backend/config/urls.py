from django.urls import include, path


urlpatterns = [
    path("api/", include("apps.common.urls")),
    path("api/", include("apps.users.urls")),
    path("api/", include("apps.resumes.urls")),
    path("api/", include("apps.interviews.urls")),
    path("api/", include("apps.billing.urls")),
]
