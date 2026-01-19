# utils/__init__.py
from datetime import datetime, timezone
from hashlib import sha256

def utcnow():
    return datetime.now(timezone.utc)

def normalize_database_url(url: str) -> str:
    if url and url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url

def hash_key(raw: str) -> str:
    return sha256(raw.encode("utf-8")).hexdigest()