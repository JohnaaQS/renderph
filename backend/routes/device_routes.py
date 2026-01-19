# routes/device_routes.py
from flask import Blueprint, request, jsonify
import secrets

from extensions import db
from models import DeviceKey
from utils import utcnow, hash_key
from utils.auth import require_auth  # of waar je require_auth staat

bp = Blueprint("devices", __name__)

@bp.route("/api/devices", methods=["POST"])
@require_auth
def create_device():
    data = request.get_json(silent=True) or {}
    label = data.get("device_name", "Arduino")

    existing = DeviceKey.query.filter_by(user_id=request.user_id).order_by(DeviceKey.device_id.asc()).first()
    if existing:
        return jsonify({
            "error": "device already exists",
            "device_id": existing.device_id,
            "device_name": existing.label,
            "is_active": existing.is_active,
        }), 409

    raw_key = secrets.token_urlsafe(32)          # <-- deze geef je terug (Arduino)
    key_hash = hash_key(raw_key)                 # <-- deze sla je op (DB)

    row = DeviceKey(
        user_id=request.user_id,
        device_key_hash=key_hash,
        label=label,
        is_active=True,
        created_at=utcnow(),
        last_seen_at=None,
    )
    db.session.add(row)
    db.session.commit()

    return jsonify({
        "status": "ok",
        "device_id": row.device_id,
        "device_name": row.label,
        "device_key": raw_key,  # <-- ENIGE KEER dat je de raw key ziet
    })

@bp.route("/api/devices", methods=["GET"])
@require_auth
def list_devices():
    rows = DeviceKey.query.filter_by(user_id=request.user_id).order_by(DeviceKey.device_id.desc()).all()
    return jsonify([{
        "device_id": r.device_id,
        "device_name": r.label,
        "is_active": r.is_active,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "last_seen_at": r.last_seen_at.isoformat() if r.last_seen_at else None,
    } for r in rows])


@bp.route("/api/devices/rotate", methods=["POST"])
@require_auth
def rotate_device_key():
    data = request.get_json(silent=True) or {}
    label = (data.get("device_name") or "").strip()

    raw_key = secrets.token_urlsafe(32)
    row = DeviceKey.query.filter_by(user_id=request.user_id).order_by(DeviceKey.device_id.asc()).first()

    if row:
        row.device_key_hash = hash_key(raw_key)
        row.is_active = True
        row.last_seen_at = None
        if label:
            row.label = label
    else:
        row = DeviceKey(
            user_id=request.user_id,
            device_key_hash=hash_key(raw_key),
            label=label or "Arduino",
            is_active=True,
            created_at=utcnow(),
            last_seen_at=None,
        )
        db.session.add(row)

    db.session.commit()

    return jsonify({
        "status": "ok",
        "device_id": row.device_id,
        "device_name": row.label,
        "device_key": raw_key,
    })
