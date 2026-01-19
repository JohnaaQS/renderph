# routes/debug_routes.py
from flask import Blueprint, request, jsonify
from datetime import date
from extensions import db
from models import ArduinoMeasurement, DailyLog
from utils.auth import require_auth

bp = Blueprint("debug", __name__)

@bp.route("/debug/measurements", methods=["GET"])
@require_auth
def list_measurements():
    """Debug: list last 50 measurements for current user."""
    rows = (
        ArduinoMeasurement.query
        .filter_by(user_id=request.user_id)
        .order_by(ArduinoMeasurement.measurement_id.desc())
        .limit(50)
        .all()
    )
    return jsonify([{
        "id": m.measurement_id,
        "temperatuur_c": float(m.temperatuur_c) if m.temperatuur_c is not None else None,
        "hartslag_bpm": m.hartslag_bpm,
        "hrv_ms": m.hrv_ms,
        "gsr": m.gsr,
        "timestamp": m.timestamp.isoformat() if m.timestamp else None,
    } for m in rows])

@bp.route("/debug/daily_logs", methods=["GET"])
@require_auth
def list_daily_logs():
    """Debug: list last 50 daily logs for current user."""
    rows = (
        DailyLog.query
        .filter_by(user_id=request.user_id)
        .order_by(DailyLog.log_id.desc())
        .limit(50)
        .all()
    )
    return jsonify([{
        "id": r.log_id,
        "uren_geslapen": float(r.uren_geslapen) if r.uren_geslapen is not None else None,
        "gevoel": r.gevoel,
        "date": r.date.isoformat() if isinstance(r.date, date) else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows])