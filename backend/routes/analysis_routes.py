# routes/analysis_routes.py
from flask import Blueprint, request, jsonify
from extensions import db
from models import User, ArduinoMeasurement, DailyLog
from utils.auth import require_auth
from ai_client import call_ai_analysis

bp = Blueprint("analysis", __name__)

@bp.route("/api/analysis/me", methods=["GET"])
@require_auth
def analysis_me():
    """AI analysis for current logged-in user."""
    user = db.session.get(User, request.user_id)
    if not user:
        return jsonify({"error": "user not found"}), 404

    measurements = (
        ArduinoMeasurement.query
        .filter_by(user_id=user.user_id)
        .order_by(ArduinoMeasurement.timestamp.desc())
        .limit(30)
        .all()
    )
    if not measurements:
        return jsonify({"error": "no measurements"}), 400

    daily_logs = (
        DailyLog.query
        .filter_by(user_id=user.user_id)
        .order_by(DailyLog.date.desc())
        .limit(14)
        .all()
    )

    result = call_ai_analysis(user, measurements, daily_logs)
    return jsonify({"user_id": user.user_id, "analysis": result})

@bp.route("/api/analysis/<int:user_id>", methods=["GET"])
@require_auth
def analysis_user(user_id):
    """AI analysis for specific user_id (only yourself allowed)."""
    if user_id != request.user_id:
        return jsonify({"error": "forbidden"}), 403

    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "user not found"}), 404

    measurements = (
        ArduinoMeasurement.query
        .filter_by(user_id=user_id)
        .order_by(ArduinoMeasurement.timestamp.desc())
        .limit(30)
        .all()
    )
    if not measurements:
        return jsonify({"error": "no measurements"}), 400

    daily_logs = (
        DailyLog.query
        .filter_by(user_id=user.user_id)
        .order_by(DailyLog.date.desc())
        .limit(14)
        .all()
    )

    result = call_ai_analysis(user, measurements, daily_logs)
    return jsonify({"user_id": user_id, "analysis": result})
