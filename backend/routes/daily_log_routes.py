# routes/daily_log_routes.py
from datetime import date
from flask import Blueprint, request, jsonify, make_response
from extensions import db
from models import DailyLog
from utils import utcnow
from utils.auth import require_auth

bp = Blueprint("daily_logs", __name__)

ALLOWED_GEVOEL = {
    "heel slecht",
    "slecht",
    "neutraal",
    "goed",
    "heel goed",
}

MOOD_BY_INDEX = [
    "heel slecht",
    "slecht",
    "neutraal",
    "goed",
    "heel goed",
]

def normalize_gevoel(value):
    if value is None:
        return None

    if isinstance(value, (int, float)):
        if isinstance(value, float) and not value.is_integer():
            return None
        index = int(value)
        if 0 <= index < len(MOOD_BY_INDEX):
            return MOOD_BY_INDEX[index]
        return None

    raw = str(value).strip().lower()
    if not raw:
        return None
    if raw.isdigit():
        index = int(raw)
        if 0 <= index < len(MOOD_BY_INDEX):
            return MOOD_BY_INDEX[index]
        return None
    raw = raw.replace("_", " ")
    return raw if raw in ALLOWED_GEVOEL else None

def parse_log_date(value):
    if not value:
        return utcnow().date()
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        return None

def normalize_activiteiten(value):
    if value is None:
        return None
    if isinstance(value, str):
        items = [value]
    elif isinstance(value, list):
        items = value
    else:
        return None

    cleaned = []
    for item in items:
        if item is None:
            continue
        text = str(item).strip()
        if text:
            cleaned.append(text)
    return cleaned or None

def normalize_note(value):
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None

@bp.route("/api/daily-logs", methods=["POST", "OPTIONS"])
@bp.route("/api/daily-log", methods=["POST", "OPTIONS"])
@require_auth
def upsert_daily_log():
    if request.method == "OPTIONS":
        return make_response("", 204)

    data = request.get_json(silent=True) or {}
    gevoel = normalize_gevoel(data.get("gevoel") or data.get("mood"))
    if not gevoel:
        return jsonify({"error": "invalid gevoel"}), 400

    uren_geslapen = None
    if data.get("uren_geslapen") not in (None, ""):
        try:
            uren_geslapen = float(data.get("uren_geslapen"))
        except (TypeError, ValueError):
            return jsonify({"error": "uren_geslapen must be a number"}), 400
        if uren_geslapen < 0 or uren_geslapen > 24:
            return jsonify({"error": "uren_geslapen out of range"}), 400

    log_date = parse_log_date(data.get("date"))
    if not log_date:
        return jsonify({"error": "invalid date"}), 400

    activiteiten = normalize_activiteiten(
        data.get("activiteiten") or data.get("activities")
    )
    note = normalize_note(data.get("note") or data.get("notes") or data.get("notitie"))

    row = DailyLog.query.filter_by(user_id=request.user_id, date=log_date).first()
    status = "updated" if row else "created"
    if not row:
        row = DailyLog(
            user_id=request.user_id,
            date=log_date,
            created_at=utcnow(),
        )
        db.session.add(row)

    row.uren_geslapen = uren_geslapen
    row.gevoel = gevoel
    row.activiteiten = activiteiten
    row.note = note
    db.session.commit()

    return jsonify({
        "status": status,
        "log_id": row.log_id,
        "user_id": row.user_id,
        "date": row.date.isoformat() if row.date else None,
        "uren_geslapen": float(row.uren_geslapen) if row.uren_geslapen is not None else None,
        "gevoel": row.gevoel,
        "activiteiten": row.activiteiten,
        "note": row.note,
    })

@bp.route("/api/daily-logs", methods=["GET", "OPTIONS"])
@bp.route("/api/daily-log", methods=["GET", "OPTIONS"])
@require_auth
def list_daily_logs():
    if request.method == "OPTIONS":
        return make_response("", 204)

    rows = (
        DailyLog.query
        .filter_by(user_id=request.user_id)
        .order_by(DailyLog.date.desc())
        .limit(14)
        .all()
    )

    return jsonify([{
        "log_id": r.log_id,
        "date": r.date.isoformat() if r.date else None,
        "uren_geslapen": float(r.uren_geslapen) if r.uren_geslapen is not None else None,
        "gevoel": r.gevoel,
        "activiteiten": r.activiteiten,
        "note": r.note,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows])
