"""
Configuración de DomiRest.

Motor de base de datos:
  - Por defecto usa SQLite (domirest.db) para que el proyecto arranque sin instalar nada.
  - Para MySQL define DB_ENGINE=mysql y las variables MYSQL_*.
  - También puedes pasar una DATABASE_URL completa (tiene prioridad).
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def _database_uri() -> str:
    direct = os.getenv("DATABASE_URL")
    if direct:
        if direct.startswith("mysql://"):
            direct = direct.replace("mysql://", "mysql+pymysql://", 1)
        elif direct.startswith("postgres://"):
            direct = direct.replace("postgres://", "postgresql://", 1)
        return direct

    engine = os.getenv("DB_ENGINE", "sqlite").strip().lower()
    if engine == "mysql":
        user = os.getenv("MYSQL_USER", "root")
        password = os.getenv("MYSQL_PASSWORD", "")
        host = os.getenv("MYSQL_HOST", "127.0.0.1")
        port = os.getenv("MYSQL_PORT", "3306")
        name = os.getenv("MYSQL_DATABASE", "domirest")
        return f"mysql+pymysql://{user}:{password}@{host}:{port}/{name}?charset=utf8mb4"

    return f"sqlite:///{(BASE_DIR / 'domirest.db').as_posix()}"


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _is_production() -> bool:
    explicit = os.getenv("SESSION_COOKIE_SECURE")
    if explicit is not None:
        return _env_bool("SESSION_COOKIE_SECURE")
    return (
        _env_bool("PRODUCTION")
        or bool(os.getenv("RENDER"))
        or os.getenv("FLASK_ENV", "").strip().lower() == "production"
        or os.getenv("APP_ENV", "").strip().lower() == "production"
    )


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "domirest-dev-secret-cambiar-en-produccion")
    SQLALCHEMY_DATABASE_URI = _database_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = _is_production()
    PREFERRED_URL_SCHEME = "https" if _is_production() else "http"
    JSON_AS_ASCII = False
    DELIVERY_FEE = int(os.getenv("DELIVERY_FEE", "3500"))
    FREE_DELIVERY_FROM = int(os.getenv("FREE_DELIVERY_FROM", "60000"))
