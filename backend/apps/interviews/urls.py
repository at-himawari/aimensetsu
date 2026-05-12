from django.urls import path

from .views import (
    history_detail,
    history_list,
    interview_session_complete,
    interview_session_detail,
    interview_sessions,
    realtime_call,
    session_messages,
    session_reflection,
)


urlpatterns = [
    path("interview-sessions", interview_sessions, name="interview-sessions"),
    path("interview-sessions/", interview_sessions, name="interview-sessions-slash"),
    path("interview-sessions/<str:session_id>", interview_session_detail, name="interview-session-detail"),
    path("interview-sessions/<str:session_id>/messages", session_messages, name="session-messages"),
    path("interview-sessions/<str:session_id>/messages/", session_messages, name="session-messages-slash"),
    path("interview-sessions/<str:session_id>/realtime-call", realtime_call, name="realtime-call"),
    path("interview-sessions/<str:session_id>/realtime-call/", realtime_call, name="realtime-call-slash"),
    path("interview-sessions/<str:session_id>/reflection", session_reflection, name="session-reflection"),
    path("interview-sessions/<str:session_id>/reflection/", session_reflection, name="session-reflection-slash"),
    path(
        "interview-sessions/<str:session_id>/complete",
        interview_session_complete,
        name="interview-session-complete",
    ),
    path("history", history_list, name="history-list"),
    path("history/", history_list, name="history-list-slash"),
    path("history/<str:session_id>", history_detail, name="history-detail"),
    path("history/<str:session_id>/", history_detail, name="history-detail-slash"),
]
