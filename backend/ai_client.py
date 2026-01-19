# ai_client.py
import os, json
from typing import Optional
from models import User, ArduinoMeasurement, DailyLog

try:
    from portkey_ai import Portkey
except Exception:
    Portkey = None

def simple_health_analysis(
    user: User,
    measurements: list[ArduinoMeasurement],
    daily_logs: Optional[list[DailyLog]] = None,
):
    """Fallback analyse als AI faalt."""
    valid_hr = [m.hartslag_bpm for m in measurements if m.hartslag_bpm is not None]
    avg_hr = sum(valid_hr) / len(valid_hr) if valid_hr else None
    valid_temp = [float(m.temperatuur_c) for m in measurements if m.temperatuur_c is not None]
    avg_temp = sum(valid_temp) / len(valid_temp) if valid_temp else None
    latest_log = daily_logs[0] if daily_logs else None
    mood = latest_log.gevoel if latest_log and latest_log.gevoel else "neutraal"
    sleep_hours = None
    if latest_log and latest_log.uren_geslapen is not None:
        sleep_hours = float(latest_log.uren_geslapen)
    bmi = None
    if user.lengte_cm and user.gewicht_kg:
        height_m = float(user.lengte_cm) / 100
        if height_m > 0:
            bmi = float(user.gewicht_kg) / (height_m ** 2)

    summary_parts = [
        f"Gemiddelde hartslag: {avg_hr:.0f} BPM" if avg_hr else "Geen hartslagdata.",
    ]
    if avg_temp is not None:
        summary_parts.append(f"Gemiddelde temperatuur: {avg_temp:.1f} °C")
    if sleep_hours is not None:
        summary_parts.append(f"Slaap: {sleep_hours:.1f} uur")
    if bmi is not None:
        summary_parts.append(f"BMI: {bmi:.1f}")
    if user.leeftijd:
        summary_parts.append(f"Leeftijd: {user.leeftijd}")
    return {
        "mood": mood,
        "risk_level": "laag",
        "summary": " | ".join(summary_parts),
        "advice": "Blijf meten voor een betere trend.",
        "source": "rule_based_fallback",
    }

def normalize_ai_result(
    user: User,
    measurements: list[ArduinoMeasurement],
    daily_logs: Optional[list[DailyLog]],
    output,
):
    fallback = simple_health_analysis(user, measurements, daily_logs)
    if not isinstance(output, dict):
        return fallback

    if isinstance(output.get("analysis"), dict):
        output = output["analysis"]

    normalized = dict(output)
    alias_map = {
        "samenvatting": "summary",
        "advies": "advice",
        "risico": "risk_level",
        "risico_niveau": "risk_level",
        "risiconiveau": "risk_level",
        "gevoel": "mood",
    }

    for src, dest in alias_map.items():
        if dest not in normalized and src in normalized:
            normalized[dest] = normalized[src]

    for key in ("summary", "advice", "risk_level", "mood"):
        if not normalized.get(key):
            normalized[key] = fallback.get(key)

    normalized["source"] = normalized.get("source") or fallback.get("source", "rule_based_fallback")
    return normalized

def call_ai_analysis(
    user: User,
    measurements: list[ArduinoMeasurement],
    daily_logs: Optional[list[DailyLog]] = None,
):
    """AI analyse via Portkey; bij error -> fallback."""
    api_key = os.getenv("PORTKEY_API_KEY")
    model = os.getenv("PORTKEY_MODEL", "gpt-5-mini")

    if not api_key or Portkey is None:
        return simple_health_analysis(user, measurements, daily_logs)

    client = Portkey(api_key=api_key)

    safe_daily_logs = daily_logs or []
    payload = {
        "user": {
            "leeftijd": user.leeftijd,
            "geslacht": user.geslacht,
            "lengte_cm": user.lengte_cm,
            "gewicht_kg": float(user.gewicht_kg) if user.gewicht_kg is not None else None,
            "levensstijl": user.levensstijl,
        },
        "metingen": [{
            "timestamp": m.timestamp.isoformat() if m.timestamp else None,
            "bpm": m.hartslag_bpm,
            "temp": float(m.temperatuur_c) if m.temperatuur_c is not None else None,
            "gsr": m.gsr,
            "hrv_ms": m.hrv_ms,
        } for m in measurements],
        "daily_logs": [{
            "date": d.date.isoformat() if d.date else None,
            "uren_geslapen": float(d.uren_geslapen) if d.uren_geslapen is not None else None,
            "gevoel": d.gevoel,
            "activiteiten": d.activiteiten,
            "note": d.note,
        } for d in safe_daily_logs],
    }

    try:
        resp = client.chat.completions.create(
            model=model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "Je bent een digitale gezondheidscoach. Geen diagnose. Geef een mooi uitgebreid antwoord. Antwoord JSON."},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}
            ],
        )
        out = json.loads(resp.choices[0].message.content)
        out["source"] = "portkey"
        return normalize_ai_result(user, measurements, daily_logs, out)
    except Exception as e:
        print("AI error:", e)
        return simple_health_analysis(user, measurements, daily_logs)
