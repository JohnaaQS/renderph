# config.py
import os
from utils import normalize_database_url
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")  # zorgt dat DATABASE_URL bestaat vóór Config

from utils import normalize_database_url
class Config:
    """App config loaded from env."""
    SQLALCHEMY_DATABASE_URI = normalize_database_url(
        os.getenv("DATABASE_URL", "postgresql:///personal_health")
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
    JWT_EXPIRES_MIN = int(os.getenv("JWT_EXPIRES_MIN", "60"))

    PORTKEY_API_KEY = os.getenv("PORTKEY_API_KEY")
    PORTKEY_MODEL = os.getenv("PORTKEY_MODEL", "gpt-5-mini")

    ALLOW_DB_INIT = os.getenv("ALLOW_DB_INIT", "0")