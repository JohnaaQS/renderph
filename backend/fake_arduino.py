import os
import time
import random
from dotenv import load_dotenv

# Laad .env als je wil (optioneel)
load_dotenv()

BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:3000")
JWT = "PASTE_JWT_HERE"

DEVICE_NAME = os.getenv("DEVICE_NAME", "Fake Arduino R4")
DEVICE_KEY = os.getenv("DEVICE_KEY") or "uhqrU1FKAvAed7M329r_gz9wpplUDVvJKzwrq5_2wJo    "
SEND_INTERVAL_SEC = float(os.getenv("SEND_INTERVAL_SEC", "5"))

def register_device(jwt: str) -> str:
    """
    Doet POST /api/devices met Authorization Bearer JWT
    en haalt device_key uit response.
    """
    import requests

    if not jwt or jwt == "PASTE_JWT_HERE" or len(jwt) < 20 or jwt.count(".") != 2:
        raise ValueError(
            "JWT ontbreekt of is geen geldige JWT. "
            "Log in via de frontend (na 2FA) en plak de JWT direct in fake_arduino.py."
        )

    url = f"{BASE_URL}/api/devices"
    headers = {"Authorization": f"Bearer {jwt}", "Content-Type": "application/json"}
    payload = {"device_name": DEVICE_NAME}

    r = requests.post(url, headers=headers, json=payload, timeout=10)
    if r.status_code == 409:
        raise RuntimeError(
            "Device bestaat al. Gebruik de bestaande device_key (zet DEVICE_KEY in fake_arduino.py)."
        )
    if r.status_code == 401:
        raise RuntimeError(
            "JWT is ongeldig of verlopen. "
            "Log opnieuw in en plak de nieuwe token in fake_arduino.py."
        )
    if r.status_code != 200:
        raise RuntimeError(f"Device register failed [{r.status_code}]: {r.text}")

    data = r.json()
    device_key = data.get("device_key")
    if not device_key:
        raise RuntimeError(f"Geen device_key in response: {data}")

    print(f"✅ Device geregistreerd: id={data.get('device_id')} name={data.get('device_name')}")
    print(f"🔑 device_key = {device_key}  (dit is wat Arduino zou bewaren)")
    return device_key

def send_measurement(device_key: str, bpm: float, raw: int):
    """
    Doet POST /api/measurements met header X-DEVICE-KEY
    """
    import requests

    url = f"{BASE_URL}/api/measurements"
    headers = {"X-DEVICE-KEY": device_key, "Content-Type": "application/json"}
    payload = {"bpm": round(bpm, 1), "raw": int(raw)}

    r = requests.post(url, headers=headers, json=payload, timeout=10)
    if r.status_code != 200:
        print(f"❌ measurement failed [{r.status_code}]: {r.text}")
        return

    print(f"✅ measurement ok: {r.json()} | bpm={payload['bpm']} raw={payload['raw']}")

def fake_bpm_generator():
    """
    Simpele fake data: bpm 65-95 met soms piek
    """
    base = random.uniform(68, 85)
    if random.random() < 0.08:
        base += random.uniform(15, 35)  # piek
    return max(40, min(190, base))

def fake_raw_generator():
    """
    Fake raw sensorwaarde (0-1023 achtig)
    """
    return random.randint(300, 900)

def fake_temp_generator():
    """
    Simpele fake temperatuur in Celsius.
    """
    base = random.uniform(36.2, 37.3)
    if random.random() < 0.05:
        base += random.uniform(0.3, 0.8)
    return round(base, 2)

def fake_hrv_generator():
    """
    Simpele fake HRV in ms.
    """
    base = random.uniform(45, 85)
    if random.random() < 0.1:
        base += random.uniform(-10, 15)
    return int(max(20, min(140, base)))

def main():
    print(f"🌐 BASE_URL = {BASE_URL}")
    device_key = (DEVICE_KEY or "").strip()
    if not device_key or device_key == "PASTE_DEVICE_KEY_HERE":
        device_key = register_device(JWT)

    print(f"📡 Start metingen sturen elke {SEND_INTERVAL_SEC}s (Ctrl+C om te stoppen)\n")
    while True:
        bpm = fake_bpm_generator()
        raw = fake_raw_generator()
        send_measurement(device_key, bpm, raw)
        time.sleep(SEND_INTERVAL_SEC)

if __name__ == "__main__":
    main()
