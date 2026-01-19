import os
import threading
import time
from datetime import timedelta
from flask import Blueprint, request, jsonify, make_response, current_app
from extensions import db
from models import ArduinoMeasurement, DeviceKey
from utils import utcnow, hash_key
from utils.auth import require_auth
from fake_arduino import (
    fake_bpm_generator,
    fake_raw_generator,
    fake_temp_generator,
    fake_hrv_generator,
)

bp = Blueprint("measurements", __name__)
ACTIVE_SESSIONS = {}
FAKE_STREAMS = {}

def get_fake_interval_sec():
    raw = os.getenv("FAKE_ARDUINO_INTERVAL_SEC") or os.getenv("SEND_INTERVAL_SEC", "5")
    try:
        interval = float(raw)
    except (TypeError, ValueError):
        return 5.0
    return max(0.5, interval)

def get_active_session(user_id: int):
    session = ACTIVE_SESSIONS.get(user_id)
    if not session:
        return None
    if session["ends_at"] <= utcnow():
        ACTIVE_SESSIONS.pop(user_id, None)
        return None
    return session

def get_active_session_end(user_id: int):
    session = get_active_session(user_id)
    return session["ends_at"] if session else None

def start_fake_stream(user_id: int):
    if os.getenv("ENABLE_FAKE_ARDUINO", "1") != "1":
        return

    thread = FAKE_STREAMS.get(user_id)
    if thread and thread.is_alive():
        return

    app = current_app._get_current_object()
    interval_sec = get_fake_interval_sec()

    def run():
        with app.app_context():
            while True:
                session = get_active_session(user_id)
                if not session:
                    break

                bpm = fake_bpm_generator()
                raw = fake_raw_generator()
                m = ArduinoMeasurement(
                    user_id=user_id,
                    hartslag_bpm=int(float(bpm)),
                    gsr=int(raw),
                    temperatuur_c=fake_temp_generator(),
                    hrv_ms=fake_hrv_generator(),
                    timestamp=utcnow(),
                )
                db.session.add(m)
                db.session.commit()
                time.sleep(interval_sec)
        FAKE_STREAMS.pop(user_id, None)

    thread = threading.Thread(target=run, daemon=True)
    FAKE_STREAMS[user_id] = thread
    thread.start()

@bp.route("/api/measurements", methods=["POST", "OPTIONS"])
def receive_measurement():
    """Arduino POST: resolve user via X-DEVICE-KEY and insert measurement."""
    if request.method == "OPTIONS":
        return make_response("", 204)

    data = request.get_json(force=True)

    raw_device_key = request.headers.get("X-DEVICE-KEY")
    if not raw_device_key:
        return jsonify({"error": "missing X-DEVICE-KEY header"}), 401

    dev = DeviceKey.query.filter_by(device_key_hash=hash_key(raw_device_key), is_active=True).first()
    if not dev:
        return jsonify({"error": "invalid device key"}), 401

    dev.last_seen_at = utcnow()
    db.session.commit()

    bpm = data.get("bpm")
    raw = data.get("raw")
    temp = data.get("temperatuur_c")
    if temp is None:
        temp = data.get("temperature")
    if temp is None:
        temp = data.get("temp")

    if bpm is None:
        return jsonify({"error": "bpm is required"}), 400

    m = ArduinoMeasurement(
        user_id=dev.user_id,
        hartslag_bpm=int(float(bpm)),
        gsr=int(raw) if raw is not None else None,
        temperatuur_c=temp,
        hrv_ms=data.get("hrv_ms"),
        timestamp=utcnow(),
    )
    db.session.add(m)
    db.session.commit()

    return jsonify({"status": "ok", "id": m.measurement_id, "user_id": dev.user_id})


@bp.route("/api/measurements/start", methods=["POST", "OPTIONS"])
@require_auth
def start_measurement():
    if request.method == "OPTIONS":
        return make_response("", 204)

    data = request.get_json(silent=True) or {}
    duration = data.get("duration_sec", data.get("duration", 30))
    try:
        duration_sec = int(duration)
    except (TypeError, ValueError):
        return jsonify({"error": "duration_sec must be an integer"}), 400

    duration_sec = max(5, min(duration_sec, 600))
    started_at = utcnow()
    ends_at = started_at + timedelta(seconds=duration_sec)
    ACTIVE_SESSIONS[request.user_id] = {
        "started_at": started_at,
        "ends_at": ends_at,
        "duration_sec": duration_sec,
    }
    start_fake_stream(request.user_id)

    return jsonify({
        "status": "ok",
        "active": True,
        "duration_sec": duration_sec,
        "started_at": started_at.isoformat(),
        "ends_at": ends_at.isoformat(),
    })


@bp.route("/api/measurements/status", methods=["GET", "OPTIONS"])
@require_auth
def measurement_status():
    if request.method == "OPTIONS":
        return make_response("", 204)

    session = get_active_session(request.user_id)

    return jsonify({
        "active": bool(session),
        "started_at": session["started_at"].isoformat() if session else None,
        "ends_at": session["ends_at"].isoformat() if session else None,
        "duration_sec": session["duration_sec"] if session else None,
    })


@bp.route("/api/measurements/me", methods=["GET", "OPTIONS"])
@require_auth
def list_my_measurements():
    if request.method == "OPTIONS":
        return make_response("", 204)

    limit_raw = request.args.get("limit", "50")
    days_raw = request.args.get("days")
    try:
        limit = int(limit_raw)
    except (TypeError, ValueError):
        limit = 50
    limit = max(1, min(limit, 5000))

    days = None
    if days_raw is not None:
        try:
            days = int(days_raw)
        except (TypeError, ValueError):
            days = None
        if days is not None and days <= 0:
            days = None

    query = (
        ArduinoMeasurement.query
        .filter_by(user_id=request.user_id)
        .order_by(ArduinoMeasurement.timestamp.desc())
    )

    if days:
        since = utcnow() - timedelta(days=days)
        query = query.filter(ArduinoMeasurement.timestamp >= since)

    rows = query.limit(limit).all()

    return jsonify([{
        "measurement_id": r.measurement_id,
        "timestamp": r.timestamp.isoformat() if r.timestamp else None,
        "bpm": r.hartslag_bpm,
        "gsr": r.gsr,
        "temp": float(r.temperatuur_c) if r.temperatuur_c is not None else None,
        "hrv_ms": r.hrv_ms,
    } for r in rows])
