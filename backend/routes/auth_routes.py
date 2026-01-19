import os
import re
import secrets
from datetime import date, datetime
from functools import lru_cache
from flask import Blueprint, request, jsonify, make_response
from sqlalchemy import text, or_
from werkzeug.security import generate_password_hash, check_password_hash
from extensions import db
from models import User, User2FA, DeviceKey
from utils import hash_key, utcnow
from utils.auth import create_jwt, create_2fa_token, require_auth, require_2fa_token
from twofa import generate_2fa_code, save_2fa_code, send_2fa_email, verify_2fa_code

bp = Blueprint("auth", __name__)

def is_2fa_required(user_id: int) -> bool:
    if os.getenv("FORCE_2FA_EMAIL", "1") == "1":
        return True
    row = User2FA.query.filter_by(user_id=user_id).first()
    return bool(row and row.is_enabled)

@lru_cache(maxsize=1)
def get_allowed_levensstijl():
    try:
        constraint_def = db.session.execute(
            text(
                "SELECT pg_get_constraintdef(oid) "
                "FROM pg_constraint "
                "WHERE conname = 'users_levensstijl_check'"
            )
        ).scalar()
        if not constraint_def:
            return []
        values = re.findall(r"'([^']+)'", constraint_def)
        seen = set()
        allowed = []
        for value in values:
            if value not in seen:
                allowed.append(value)
                seen.add(value)
        return allowed
    except Exception:
        return []

def canonical_levensstijl(value: str) -> str:
    cleaned = re.sub(r"[-_]+", " ", value.strip().lower())
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned

def normalize_levensstijl(value):
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None

    allowed = get_allowed_levensstijl()
    if allowed:
        mapping = {canonical_levensstijl(opt): opt for opt in allowed}
        canon = canonical_levensstijl(raw)
        if canon in mapping:
            return mapping[canon]
        for fallback in ("sedentair", "licht actief", "licht_actief", "actief", "zeer actief", "zeer_actief"):
            if fallback in allowed:
                return fallback
        return allowed[0]

    canon = canonical_levensstijl(raw)
    return canon.replace(" ", "_") if canon else None

def normalize_geslacht(value):
    if value is None:
        return None
    cleaned = str(value).strip().lower()
    if not cleaned:
        return None
    mapping = {
        "man": "man",
        "male": "man",
        "m": "man",
        "vrouw": "vrouw",
        "woman": "vrouw",
        "female": "vrouw",
        "v": "vrouw",
        "anders": "anders",
        "other": "anders",
        "x": "anders",
    }
    return mapping.get(cleaned)

def parse_birth_date(value):
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value

    raw = str(value).strip()
    if not raw:
        return None

    if raw.isdigit() and len(raw) == 8:
        try:
            return date(int(raw[:4]), int(raw[4:6]), int(raw[6:8]))
        except ValueError:
            return None

    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None

def compute_age_from_date(birth_date: date) -> int:
    today = date.today()
    age = today.year - birth_date.year
    if (today.month, today.day) < (birth_date.month, birth_date.day):
        age -= 1
    return age

def format_birth_date(value):
    if not value:
        return None
    if isinstance(value, datetime):
        value = value.date()
    if isinstance(value, date):
        return value.isoformat()

    raw = str(value).strip()
    if raw.isdigit() and len(raw) == 8:
        try:
            parsed = date(int(raw[:4]), int(raw[4:6]), int(raw[6:8]))
        except ValueError:
            return None
        return parsed.isoformat()

    try:
        return date.fromisoformat(raw).isoformat()
    except ValueError:
        return None

def ensure_device_key(user_id: int, label: str = "Arduino"):
    existing = DeviceKey.query.filter_by(user_id=user_id).order_by(DeviceKey.device_id.asc()).first()
    if existing:
        return None, existing

    raw_key = secrets.token_urlsafe(32)
    row = DeviceKey(
        user_id=user_id,
        device_key_hash=hash_key(raw_key),
        label=label,
        is_active=True,
        created_at=utcnow(),
        last_seen_at=None,
    )
    db.session.add(row)
    db.session.commit()
    return raw_key, row

# ============================================
# REGISTER
# ============================================

@bp.route("/api/auth/register", methods=["POST", "OPTIONS"])
def register():
    if request.method == "OPTIONS":
        return make_response("", 204)

    data = request.get_json(silent=True) or {}

    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    password_confirm = (
        data.get("password_confirm")
        or data.get("password_confirmation")
        or data.get("confirm_password")
        or ""
    )

    if not username or not email or not password:
        return jsonify({"error": "username, email and password required"}), 400

    if password_confirm and password_confirm != password:
        return jsonify({"error": "passwords do not match"}), 400

    first_name = (data.get("first_name") or data.get("voornaam") or "").strip()
    last_name = (data.get("last_name") or data.get("achternaam") or "").strip()
    if not first_name:
        first_name = None
    if not last_name:
        last_name = None

    geslacht = normalize_geslacht(data.get("geslacht"))
    levensstijl = normalize_levensstijl(data.get("levensstijl"))

    # check username uniek
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "username already exists"}), 409

    # check email uniek
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "email already exists"}), 409

    user = User(
        first_name=first_name,
        last_name=last_name,
        username=username,
        email=email,
        password_hash=generate_password_hash(password),
        leeftijd=data.get("leeftijd"),
        geslacht=geslacht,
        lengte_cm=data.get("lengte_cm"),
        gewicht_kg=data.get("gewicht_kg"),
        levensstijl=levensstijl,
    )

    db.session.add(user)
    db.session.commit()

    device_key, device_row = ensure_device_key(user.user_id)
    device_payload = {
        "device_id": device_row.device_id,
        "device_name": device_row.label,
    }
    if device_key:
        device_payload["device_key"] = device_key

    if is_2fa_required(user.user_id):
        temp_token = create_2fa_token(user.user_id)
        return jsonify({
            "status": "2fa_required",
            "twofa_required": True,
            "user_id": user.user_id,
            "temp_token": temp_token,
            **device_payload,
        })

    token = create_jwt(user.user_id)

    return jsonify({
        "status": "ok",
        "user_id": user.user_id,
        "token": token,
        **device_payload,
    })


# ============================================
# LOGIN
# ============================================

@bp.route("/api/auth/login", methods=["POST", "OPTIONS"])
def login():
    if request.method == "OPTIONS":
        return make_response("", 204)

    data = request.get_json(silent=True) or {}

    identifier = (data.get("identifier") or data.get("username") or data.get("email") or "").strip()
    password = data.get("password") or ""

    if not identifier or not password:
        return jsonify({"error": "email or username and password required"}), 400

    user = User.query.filter(or_(User.username == identifier, User.email == identifier)).first()

    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "invalid credentials"}), 401

    if is_2fa_required(user.user_id):
        temp_token = create_2fa_token(user.user_id)
        return jsonify({
            "status": "2fa_required",
            "twofa_required": True,
            "user_id": user.user_id,
            "temp_token": temp_token,
        })

    token = create_jwt(user.user_id)

    return jsonify({
        "status": "ok",
        "user_id": user.user_id,
        "token": token
    })


# ============================================
# 2FA SEND/VERIFY
# ============================================

@bp.route("/api/auth/2fa/send", methods=["POST", "OPTIONS"])
@bp.route("/api/auth/2fa/request", methods=["POST", "OPTIONS"])
@require_2fa_token
def send_2fa():
    data = request.get_json(silent=True) or {}

    user = db.session.get(User, request.user_id)
    if not user:
        return jsonify({"error": "user not found"}), 404

    to_email = (getattr(user, "email", None) or data.get("email") or "").strip()
    if not to_email:
        return jsonify({"error": "email required"}), 400

    code = generate_2fa_code()
    save_2fa_code(user.user_id, code)

    if not send_2fa_email(to_email, code):
        return jsonify({"error": "2fa email failed"}), 500

    return jsonify({"status": "ok"})


@bp.route("/api/auth/2fa/verify", methods=["POST", "OPTIONS"])
@bp.route("/api/auth/2fa/confirm", methods=["POST", "OPTIONS"])
@require_2fa_token
def verify_2fa():
    data = request.get_json(silent=True) or {}

    code = (data.get("code") or data.get("pin") or "").strip()
    if not code:
        return jsonify({"error": "code required"}), 400

    if not verify_2fa_code(request.user_id, code):
        return jsonify({"error": "invalid or expired code"}), 401

    token = create_jwt(request.user_id)

    return jsonify({
        "status": "ok",
        "user_id": request.user_id,
        "token": token,
    })


# ============================================
# ME (JWT TEST)
# ============================================

@bp.route("/api/auth/me", methods=["GET", "OPTIONS"])
@require_auth
def me():
    if request.method == "OPTIONS":
        return make_response("", 204)

    user = db.session.get(User, request.user_id)
    if not user:
        return jsonify({"error": "user not found"}), 404

    return jsonify({
        "user_id": user.user_id,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "username": user.username,
        "email": user.email,
        "date_of_birth": format_birth_date(user.date_of_birth),
        "birth_date": format_birth_date(user.date_of_birth),
        "leeftijd": user.leeftijd,
        "geslacht": user.geslacht,
        "lengte_cm": user.lengte_cm,
        "gewicht_kg": float(user.gewicht_kg) if user.gewicht_kg is not None else None,
        "levensstijl": user.levensstijl,
    })


@bp.route("/api/auth/me", methods=["PUT", "OPTIONS"])
@require_auth
def update_me():
    if request.method == "OPTIONS":
        return make_response("", 204)

    data = request.get_json(silent=True) or {}
    user = db.session.get(User, request.user_id)
    if not user:
        return jsonify({"error": "user not found"}), 404

    def parse_int(value):
        if value is None or value == "":
            return None
        return int(value)

    def parse_float(value):
        if value is None or value == "":
            return None
        return float(value)

    try:
        if "first_name" in data:
            user.first_name = (data.get("first_name") or "").strip()
        if "last_name" in data:
            user.last_name = (data.get("last_name") or "").strip()

        birth_value = None
        for key in ("birth_date", "day_of_birth", "date_of_birth", "geboortedatum"):
            if key in data:
                birth_value = data.get(key)
                break
        if birth_value not in (None, ""):
            birth_date = parse_birth_date(birth_value)
            if not birth_date:
                return jsonify({"error": "invalid birth date"}), 400
            user.date_of_birth = birth_date
            user.leeftijd = compute_age_from_date(birth_date)
        elif "leeftijd" in data:
            user.leeftijd = parse_int(data.get("leeftijd"))

        if "geslacht" in data:
            raw_gender = data.get("geslacht")
            if raw_gender not in (None, ""):
                normalized = normalize_geslacht(raw_gender)
                if not normalized:
                    return jsonify({"error": "invalid geslacht"}), 400
                user.geslacht = normalized

        if "lengte_cm" in data:
            user.lengte_cm = parse_int(data.get("lengte_cm"))
        if "gewicht_kg" in data:
            user.gewicht_kg = parse_float(data.get("gewicht_kg"))
        if "levensstijl" in data:
            levensstijl = normalize_levensstijl(data.get("levensstijl"))
            if levensstijl:
                user.levensstijl = levensstijl
    except (ValueError, TypeError):
        return jsonify({"error": "invalid profile values"}), 400

    db.session.commit()

    return jsonify({
        "user_id": user.user_id,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "username": user.username,
        "email": user.email,
        "date_of_birth": format_birth_date(user.date_of_birth),
        "birth_date": format_birth_date(user.date_of_birth),
        "leeftijd": user.leeftijd,
        "geslacht": user.geslacht,
        "lengte_cm": user.lengte_cm,
        "gewicht_kg": float(user.gewicht_kg) if user.gewicht_kg is not None else None,
        "levensstijl": user.levensstijl,
    })
