# utils/auth.py
import os
from functools import wraps
from datetime import timedelta
import jwt
from flask import request, jsonify, current_app
from utils import utcnow

def create_jwt(user_id: int, expires_min=None, twofa_pending: bool = False) -> str:
    now = utcnow()
    exp_minutes = expires_min if expires_min is not None else current_app.config["JWT_EXPIRES_MIN"]
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=exp_minutes)).timestamp()),
    }
    if twofa_pending:
        payload["twofa_pending"] = True
    return jwt.encode(payload, current_app.config["JWT_SECRET"], algorithm="HS256")

def create_2fa_token(user_id: int) -> str:
    expires_min = int(os.getenv("JWT_2FA_EXPIRES_MIN", "10"))
    return create_jwt(user_id, expires_min=expires_min, twofa_pending=True)

def get_user_id_from_token(token: str, require_twofa_pending: bool = False):
    try:
        payload = jwt.decode(token, current_app.config["JWT_SECRET"], algorithms=["HS256"])
        is_pending = bool(payload.get("twofa_pending"))
        if require_twofa_pending and not is_pending:
            return None
        if not require_twofa_pending and is_pending:
            return None
        return int(payload["sub"])
    except Exception:
        return None


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        # ✅ preflight nooit blokkeren
        if request.method == "OPTIONS":
            return ("", 204)

        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "missing Authorization Bearer token"}), 401
        token = auth.split(" ", 1)[1].strip()
        user_id = get_user_id_from_token(token)
        if not user_id:
            return jsonify({"error": "invalid or expired token"}), 401
        request.user_id = user_id
        return fn(*args, **kwargs)
    return wrapper


def require_2fa_token(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if request.method == "OPTIONS":
            return ("", 204)

        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "missing Authorization Bearer token"}), 401
        token = auth.split(" ", 1)[1].strip()
        user_id = get_user_id_from_token(token, require_twofa_pending=True)
        if not user_id:
            return jsonify({"error": "invalid or expired 2fa token"}), 401
        request.user_id = user_id
        return fn(*args, **kwargs)
    return wrapper
