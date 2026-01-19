import os
import random
import smtplib
import psycopg2
from email.message import EmailMessage
from urllib.parse import urlparse
from dotenv import load_dotenv

# ============================
# LOAD ENV
# ============================

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
EMAIL_SENDER = os.getenv("EMAIL_SENDER")
EMAIL_SENDER_PASS = os.getenv("EMAIL_SENDER_PASS")


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

def send_2fa_email(to_email: str, code: str) -> bool:
    """
    Stuurt de 2FA code via e-mail naar de gebruiker.
    """
    try:
        msg = EmailMessage()
        msg.set_content(f"Beste gebruiker,\n\nUw verificatiecode voor PulseMind is: {code}\n\nMet vriendelijke groet,\nHet PulseMind Team")
        msg["Subject"] = "PulseMind – Verification Code"
        msg["From"] = EMAIL_SENDER
        msg["To"] = to_email

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(EMAIL_SENDER, EMAIL_SENDER_PASS)
            server.send_message(msg)

        return True

    except Exception as e:
        print("❌ Error sending 2FA email:", e)
        return False


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
