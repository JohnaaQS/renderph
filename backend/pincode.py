import os
import bcrypt
import psycopg2
from urllib.parse import urlparse
from dotenv import load_dotenv

#.env laden
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")


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
# PIN INSTELLEN
# ============================

def set_pin(user_id: int, pin: str, minutes_valid: int = 60) -> bool:
    """
    Slaat een nieuwe 4-cijferige PIN op voor deze user.
    - PIN mag gelijk zijn aan die van andere users
    - PIN wordt gehashed opgeslagen
    - Elke set = nieuwe row (history)
    """

    if not pin.isdigit() or len(pin) != 4:
        return False

    pin_hash = bcrypt.hashpw(pin.encode(), bcrypt.gensalt()).decode()

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO user_pin_codes (user_id, pin_hash, expires_at, is_used)
        VALUES (%s, %s, NOW() + (%s || ' minutes')::interval, FALSE);
    """, (user_id, pin_hash, minutes_valid))

    conn.commit()
    cur.close()
    conn.close()

    return True


# ============================
# PIN VERIFIEREN
# ============================

def verify_pin(user_id: int, pin_input: str) -> bool:
    """
    Checkt de nieuwste geldige PIN voor deze user:
    - niet gebruikt
    - niet verlopen
    """

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT pin_id, pin_hash
        FROM user_pin_codes
        WHERE user_id = %s
          AND is_used = FALSE
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1;
    """, (user_id,))

    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        return False

    pin_id, stored_hash = row

    is_correct = bcrypt.checkpw(pin_input.encode(), stored_hash.encode())

    if is_correct:
        cur.execute("""
            UPDATE user_pin_codes
            SET is_used = TRUE
            WHERE pin_id = %s;
        """, (pin_id,))
        conn.commit()

    cur.close()
    conn.close()

    return is_correct
