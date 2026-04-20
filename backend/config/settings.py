from pathlib import Path
import os


BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).lower() in {"1", "true", "yes", "on"}


SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-secret-change-me")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = [host.strip() for host in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")]

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "corsheaders",
    "apps.users",
    "apps.interviews",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
]

ROOT_URLCONF = "config.urls"
TEMPLATES = []
WSGI_APPLICATION = "config.wsgi.application"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///db.sqlite3")
if DATABASE_URL.startswith("sqlite:///"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / DATABASE_URL.replace("sqlite:///", ""),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("POSTGRES_DB", ""),
            "USER": os.getenv("POSTGRES_USER", ""),
            "PASSWORD": os.getenv("POSTGRES_PASSWORD", ""),
            "HOST": os.getenv("POSTGRES_HOST", ""),
            "PORT": os.getenv("POSTGRES_PORT", "5432"),
        }
    }

LANGUAGE_CODE = "ja"
TIME_ZONE = "Asia/Tokyo"
USE_I18N = True
USE_TZ = True

CORS_ALLOWED_ORIGINS = [os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")]
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS

MEDIA_ROOT = BASE_DIR / "media"
MEDIA_URL = "/media/"

AUTH_MODE = os.getenv("AUTH_MODE", "demo")
PRACTICE_BLOCK_MINUTES = 30
PRACTICE_BLOCK_PRICE_JPY = 300

