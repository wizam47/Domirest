"""
DomiRest · Sabor & Punto
Servidor Flask que expone la API REST y sirve la PWA (frontend).

Ejecutar en desarrollo:
    python app.py
    # o para abrirlo desde el celular en la misma red:
    python app.py --host 0.0.0.0
"""
import os
import sys
from pathlib import Path

import io

import segno
from flask import Flask, Response, jsonify, request, send_from_directory
from werkzeug.middleware.proxy_fix import ProxyFix

from config import Config
from models import db
from routes import register_routes
from seed import ensure_demo_data

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"


def create_app(auto_seed: bool = True) -> Flask:
    app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
    app.config.from_object(Config)
    app.json.ensure_ascii = False
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
    db.init_app(app)

    register_routes(app)

    with app.app_context():
        db.create_all()
        skip_auto_seed = os.getenv("DOMIREST_SKIP_AUTO_SEED") == "1"
        if auto_seed and not skip_auto_seed and ensure_demo_data(app):
            print("[OK] Base vacía: datos demo cargados automáticamente")

    @app.get("/api/health")
    def health():
        return jsonify(
            {
                "ok": True,
                "app": "DomiRest",
                "engine": app.config["SQLALCHEMY_DATABASE_URI"].split(":")[0],
            }
        )

    @app.get("/api/qr.svg")
    def qr_svg():
        """QR del enlace público de la app (por defecto, la URL desde la que se abre)."""
        target = (request.args.get("url") or request.host_url).strip()[:500]
        buffer = io.BytesIO()
        segno.make(target, error="m").save(
            buffer, kind="svg", scale=8, border=2, dark="#1F1B2D", light="#FFFFFF"
        )
        response = Response(buffer.getvalue(), mimetype="image/svg+xml")
        response.headers["Cache-Control"] = "public, max-age=3600"
        return response

    @app.get("/")
    def index():
        return send_from_directory(FRONTEND_DIR, "index.html")

    @app.get("/manifest.json")
    def manifest():
        response = send_from_directory(FRONTEND_DIR, "manifest.json")
        response.headers["Content-Type"] = "application/manifest+json; charset=utf-8"
        response.headers["Cache-Control"] = "no-cache"
        return response

    @app.get("/sw.js")
    def service_worker():
        response = send_from_directory(FRONTEND_DIR, "sw.js")
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Service-Worker-Allowed"] = "/"
        return response

    @app.get("/<path:path>")
    def spa_fallback(path):
        candidate = (FRONTEND_DIR / path).resolve()
        if candidate.is_file() and FRONTEND_DIR.resolve() in candidate.parents:
            return send_from_directory(FRONTEND_DIR, path)
        return send_from_directory(FRONTEND_DIR, "index.html")

    @app.errorhandler(404)
    def not_found(_error):
        if request.path.startswith("/api/"):
            return jsonify({"ok": False, "error": "Recurso no encontrado"}), 404
        return send_from_directory(FRONTEND_DIR, "index.html")

    @app.errorhandler(500)
    def server_error(_error):
        if request.path.startswith("/api/"):
            return jsonify({"ok": False, "error": "Error interno del servidor"}), 500
        return "Error interno", 500

    @app.after_request
    def common_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        elif request.path in {"/manifest.json", "/sw.js"}:
            response.headers.setdefault("Cache-Control", "no-cache")
        return response

    return app


app = create_app()


if __name__ == "__main__":
    host = "0.0.0.0" if "--host" in sys.argv else os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "1") == "1"
    print("\n  DomiRest · Sabor & Punto")
    print(f"  Local:   http://127.0.0.1:{port}")
    print("  Red:     http://<IP-DE-TU-PC>:%s" % port)
    print("  Demo:    cliente / admin / domiciliario\n")
    app.run(host=host, port=port, debug=debug)
