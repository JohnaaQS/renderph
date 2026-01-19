# models.py
from sqlalchemy import Integer, String, Numeric, DateTime, Date, ForeignKey, Boolean, Text
from sqlalchemy.dialects.postgresql import JSONB
from extensions import db
from utils import utcnow

class User(db.Model):
    """users: login + profieldata."""
    __tablename__ = "users"

    user_id = db.Column(Integer, primary_key=True)
    first_name = db.Column(String(100))
    last_name = db.Column(String(100))
    username = db.Column(String(100), unique=True, nullable=False)
    email = db.Column(String(255), unique=True, nullable=False)
    password_hash = db.Column(String(255), nullable=False)

    date_of_birth = db.Column(Date)
    leeftijd = db.Column(Integer)
    geslacht = db.Column(String(10))
    lengte_cm = db.Column(Integer)
    gewicht_kg = db.Column(Numeric(5, 2))
    levensstijl = db.Column(String(50))

    created_at = db.Column(DateTime(timezone=True), default=utcnow)

class DeviceKey(db.Model):
    """device_keys: koppelt Arduino key (hashed) aan user."""
    __tablename__ = "device_keys"

    device_id = db.Column(Integer, primary_key=True)
    user_id = db.Column(Integer, ForeignKey("users.user_id"), nullable=False)

    device_key_hash = db.Column(String(255), unique=True, nullable=False)
    label = db.Column(String(100))
    is_active = db.Column(Boolean, nullable=False, default=True)

    created_at = db.Column(DateTime(timezone=True), default=utcnow)
    last_seen_at = db.Column(DateTime(timezone=True))

class ArduinoMeasurement(db.Model):
    """arduino_measurements: metingen per user."""
    __tablename__ = "arduino_measurements"

    measurement_id = db.Column(Integer, primary_key=True)
    user_id = db.Column(Integer, ForeignKey("users.user_id"), nullable=False)

    temperatuur_c = db.Column(Numeric(4, 2))
    hartslag_bpm = db.Column(Integer)
    hrv_ms = db.Column(Integer)
    gsr = db.Column(Integer)

    timestamp = db.Column(DateTime(timezone=True), default=utcnow)

class DailyLog(db.Model):
    """daily_logs: slaap/gevoel per dag."""
    __tablename__ = "daily_logs"

    log_id = db.Column(Integer, primary_key=True)
    user_id = db.Column(Integer, ForeignKey("users.user_id"), nullable=False)

    uren_geslapen = db.Column(Numeric(4, 2))
    gevoel = db.Column(String(20))
    activiteiten = db.Column(JSONB)
    note = db.Column(Text)
    date = db.Column(Date, nullable=False)
    created_at = db.Column(DateTime(timezone=True), default=utcnow)

class User2FA(db.Model):
    """user_2fa: settings (later TOTP)."""
    __tablename__ = "user_2fa"

    user_id = db.Column(Integer, ForeignKey("users.user_id"), primary_key=True)
    is_enabled = db.Column(Boolean, nullable=False, default=False)
    email_code = db.Column(String(10))
    email_expires = db.Column(DateTime(timezone=True))
    totp_secret = db.Column(String(255))
    backup_codes_json = db.Column(Text)

    created_at = db.Column(DateTime(timezone=True), default=utcnow)
    updated_at = db.Column(DateTime(timezone=True), default=utcnow)

class UserPinCode(db.Model):
    """user_pin_codes: tijdelijke PIN met expiry."""
    __tablename__ = "user_pin_codes"

    pin_id = db.Column(Integer, primary_key=True)
    user_id = db.Column(Integer, ForeignKey("users.user_id"), nullable=False)

    pin_hash = db.Column(String(255), nullable=False)
    expires_at = db.Column(DateTime(timezone=True), nullable=False)
    is_used = db.Column(Boolean, nullable=False, default=False)

    created_at = db.Column(DateTime(timezone=True), default=utcnow)
