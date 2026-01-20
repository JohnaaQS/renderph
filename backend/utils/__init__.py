# utils/__init__.py
from datetime import datetime, timezone
from hashlib import sha256
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

def utcnow():
    return datetime.now(timezone.utc)

def normalize_database_url(url: str) -> str:
    if not url:
        return url
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    if url.startswith("postgresql://"):
        parsed = urlparse(url)
        query = parse_qs(parsed.query)
        if "sslmode" not in query:
            query["sslmode"] = ["require"]
            parsed = parsed._replace(query=urlencode(query, doseq=True))
            return urlunparse(parsed)
    return url

def hash_key(raw: str) -> str:
    return sha256(raw.encode("utf-8")).hexdigest()
