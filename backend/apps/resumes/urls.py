from django.urls import path

from .views import resume_delete, resume_detail, resumes


urlpatterns = [
    path("resumes", resumes, name="resumes"),
    path("resumes/", resumes, name="resumes-slash"),
    path("resumes/<str:resume_id>", resume_detail, name="resume-detail"),
    path("resumes/<str:resume_id>/", resume_delete, name="resume-delete"),
]
