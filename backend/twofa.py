import os
import json
import random
import smtplib
import socket
import psycopg2
from email.message import EmailMessage
from urllib.parse import urlparse, urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from dotenv import load_dotenv

# ============================
# LOAD ENV
# ============================

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
EMAIL_SENDER = os.getenv("EMAIL_SENDER")
EMAIL_SENDER_PASS = os.getenv("EMAIL_SENDER_PASS")
EMAIL_SENDER_NAME = os.getenv("EMAIL_SENDER_NAME", "PulseMind")
SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")
ELASTICEMAIL_API_KEY = os.getenv("ELASTICEMAIL_API_KEY")
ELASTICEMAIL_API_URL = os.getenv(
    "ELASTICEMAIL_API_URL",
    "https://api.elasticemail.com/v2/email/send",
)
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_TIMEOUT = float(os.getenv("SMTP_TIMEOUT", "10"))
EMAIL_HTTP_TIMEOUT = float(os.getenv("EMAIL_HTTP_TIMEOUT", "10"))


# ============================
# DATABASE CONNECTIE
# ============================

def get_db_connection():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL ontbreekt in .env")

    u = urlparse(DATABASE_URL)

    return psycopg2.connect(
        dbname=u.path.lstrip("/"),
        user=u.username,
        password=u.password,
        host=u.hostname,
        port=u.port or 5432,
        sslmode="require"
    )


# ============================
# 2FA CODE GENEREREN
# ============================

def generate_2fa_code() -> str:
    """
    Genereert een 6-cijferige 2FA code.
    """
    return str(random.randint(100000, 999999))


# ============================
# 2FA EMAIL STUREN
# ============================

def _build_2fa_message(code: str) -> str:
    return (
        "Beste gebruiker,\n\n"
        f"Uw verificatiecode voor PulseMind is: {code}\n\n"
        "Met vriendelijke groet,\n"
        "Het PulseMind Team"
    )

def _send_2fa_email_sendgrid(to_email: str, code: str) -> bool:
    if not SENDGRID_API_KEY:
        return False
    if not EMAIL_SENDER:
        print("❌ EMAIL_SENDER ontbreekt voor SendGrid.")
        return False

    payload = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {"email": EMAIL_SENDER, "name": EMAIL_SENDER_NAME},
        "subject": "PulseMind – Verification Code",
        "content": [{"type": "text/plain", "value": _build_2fa_message(code)}],
    }

    req = Request(
        "https://api.sendgrid.com/v3/mail/send",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {SENDGRID_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(req, timeout=EMAIL_HTTP_TIMEOUT) as resp:
            if 200 <= resp.status < 300:
                return True
            body = resp.read().decode("utf-8", errors="replace")
            print("❌ SendGrid error:", resp.status, body)
            return False
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print("❌ SendGrid HTTP error:", e.code, body)
        return False
    except (URLError, socket.timeout, Exception) as e:
        print("❌ SendGrid error:", e)
        return False

def _send_2fa_email_elastic(to_email: str, code: str) -> bool:
    if not ELASTICEMAIL_API_KEY:
        return False
    from_email = EMAIL_SENDER
    if not from_email:
        print("❌ EMAIL_SENDER ontbreekt voor ElasticEmail.")
        return False

    payload = {
        "apikey": ELASTICEMAIL_API_KEY,
        "from": from_email,
        "fromName": EMAIL_SENDER_NAME,
        "to": to_email,
        "subject": "PulseMind – Verification Code",
        "bodyText": _build_2fa_message(code),
        "isTransactional": "true",
    }

    req = Request(
        ELASTICEMAIL_API_URL,
        data=urlencode(payload).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urlopen(req, timeout=EMAIL_HTTP_TIMEOUT) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            if 200 <= resp.status < 300:
                try:
                    parsed = json.loads(body)
                    if "success" in parsed:
                        return bool(parsed.get("success"))
                except Exception:
                    pass
                return True
            print("❌ ElasticEmail error:", resp.status, body)
            return False
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print("❌ ElasticEmail HTTP error:", e.code, body)
        return False
    except (URLError, socket.timeout, Exception) as e:
        print("❌ ElasticEmail error:", e)
        return False

def _send_2fa_email_smtp(to_email: str, code: str) -> bool:
    if not EMAIL_SENDER or not EMAIL_SENDER_PASS:
        print("❌ EMAIL_SENDER of EMAIL_SENDER_PASS ontbreekt voor SMTP.")
        return False

    try:
        msg = EmailMessage()
        msg.set_content(_build_2fa_message(code))
        msg["Subject"] = "PulseMind – Verification Code"
        msg["From"] = EMAIL_SENDER
        msg["To"] = to_email

        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=SMTP_TIMEOUT) as server:
            server.login(EMAIL_SENDER, EMAIL_SENDER_PASS)
            server.send_message(msg)

        return True
    except Exception as e:
        print("❌ Error sending 2FA email:", e)
        return False

def send_2fa_email(to_email: str, code: str) -> bool:
    """
    Stuurt de 2FA code via e-mail naar de gebruiker.
    """
    if SENDGRID_API_KEY:
        return _send_2fa_email_sendgrid(to_email, code)
    if ELASTICEMAIL_API_KEY:
        return _send_2fa_email_elastic(to_email, code)
    return _send_2fa_email_smtp(to_email, code)


# ============================
# 2FA OPSLAAN IN DATABASE
# ============================

def save_2fa_code(user_id: int, code: str, minutes_valid: int = 5) -> bool:
    """
    Slaat de 2FA code tijdelijk op in user_2fa.
    - 1 record per user
    - code verloopt automatisch
    """

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO user_2fa (user_id, is_enabled, email_code, email_expires)
        VALUES (%s, TRUE, %s, NOW() + (%s || ' minutes')::interval)
        ON CONFLICT (user_id)
        DO UPDATE SET
            email_code = EXCLUDED.email_code,
            email_expires = EXCLUDED.email_expires,
            is_enabled = TRUE,
            updated_at = NOW();
    """, (user_id, code, minutes_valid))

    conn.commit()
    cur.close()
    conn.close()

    return True


# ============================
# 2FA VERIFIEREN
# ============================

def verify_2fa_code(user_id: int, code_input: str) -> bool:
    """
    Controleert of de ingevoerde 2FA code:
    - klopt
    - niet verlopen is
    """

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT email_code,
               (email_expires > NOW()) AS valid
        FROM user_2fa
        WHERE user_id = %s;
    """, (user_id,))

    row = cur.fetchone()

    if not row:
        cur.close()
        conn.close()
        return False

    saved_code, valid = row

    if not valid:
        cur.close()
        conn.close()
        return False

    is_correct = (saved_code == code_input)

    if is_correct:
        # one-time use: code direct ongeldig maken
        cur.execute("""
            UPDATE user_2fa
            SET email_code = NULL,
                email_expires = NULL,
                updated_at = NOW()
            WHERE user_id = %s;
        """, (user_id,))
        conn.commit()

    cur.close()
    conn.close()

    return is_correct
