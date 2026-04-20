from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PracticeSession",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=160)),
                ("role", models.CharField(blank=True, max_length=160)),
                ("minutes_used", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="practice_sessions", to=settings.AUTH_USER_MODEL),
                ),
            ],
            options={"ordering": ["-updated_at"]},
        ),
        migrations.CreateModel(
            name="QuotaLedger",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kind", models.CharField(choices=[("credit", "Credit"), ("debit", "Debit")], max_length=16)),
                ("minutes", models.PositiveIntegerField(default=30)),
                ("amount_jpy", models.PositiveIntegerField(default=300)),
                ("stripe_session_id", models.CharField(blank=True, max_length=200)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="quota_entries", to=settings.AUTH_USER_MODEL),
                ),
            ],
        ),
        migrations.CreateModel(
            name="UploadedDocument",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("file", models.FileField(upload_to="documents/")),
                ("extracted_text", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "session",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="documents", to="interviews.practicesession"),
                ),
            ],
        ),
        migrations.CreateModel(
            name="PracticeMessage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("role", models.CharField(choices=[("user", "User"), ("assistant", "Assistant")], max_length=16)),
                ("content", models.TextField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "session",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="messages", to="interviews.practicesession"),
                ),
            ],
            options={"ordering": ["created_at"]},
        ),
        migrations.CreateModel(
            name="FeedbackReport",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("strengths", models.JSONField(default=list)),
                ("improvements", models.JSONField(default=list)),
                ("next_questions", models.JSONField(default=list)),
                ("summary", models.TextField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "session",
                    models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="feedback_report", to="interviews.practicesession"),
                ),
            ],
        ),
        migrations.AddIndex(
            model_name="quotaledger",
            index=models.Index(fields=["user", "created_at"], name="interviews_q_user_id_22e86a_idx"),
        ),
    ]

