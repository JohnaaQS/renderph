import os
from flask import Flask, jsonify
from dotenv import load_dotenv
from pathlib import Path
from flask_cors import CORS

from config import Config
from extensions import db

from routes.auth_routes import bp as auth_bp
from routes.device_routes import bp as device_bp
from routes.measurement_routes import bp as measurement_bp
from routes.analysis_routes import bp as analysis_bp
from routes.daily_log_routes import bp as daily_log_bp
from routes.debug_routes import bp as debug_bp


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # ✅ CORS: allow configured frontend origins (fallback: allow all for local dev)
    raw_origins = os.getenv("FRONTEND_ORIGINS", "").strip()
    if raw_origins:
        origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
    else:
        origins = ["*"]
    CORS(
        app,
        resources={r"/*": {"origins": origins}},
        supports_credentials=False,
        allow_headers=["Content-Type", "Authorization", "X-DEVICE-KEY"],
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    )

    print("DB =", app.config["SQLALCHEMY_DATABASE_URI"])

    db.init_app(app)

    app.register_blueprint(auth_bp)
    app.register_blueprint(device_bp)
    app.register_blueprint(measurement_bp)
    app.register_blueprint(analysis_bp)
    app.register_blueprint(daily_log_bp)
    app.register_blueprint(debug_bp)

    print(app.url_map)


    @app.route("/")
    def index():
        return jsonify({"status": "ok", "message": "PulseMind backend draait"})

    @app.route("/dev/init-db", methods=["POST"])
    def init_db():
        if os.getenv("ALLOW_DB_INIT", "0") != "1":
            return jsonify({"error": "DB init disabled"}), 403
        with app.app_context():
            db.create_all()
        return jsonify({"status": "ok", "message": "tables created"}), 200

    return app

app = create_app()

if __name__ == "__main__":
    port = int(os.getenv("PORT", "3000"))
    app.run(debug=True, host="0.0.0.0", port=port)
