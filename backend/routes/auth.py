"""Autenticación simple con sesión Flask + contraseñas hasheadas."""
from flask import Blueprint, g, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from models import ROLES, User, db
from utils import error, login_required, ok

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if len(name) < 3:
        return error("Escribe tu nombre completo")
    if "@" not in email or len(email) < 6:
        return error("Ingresa un correo válido")
    if len(password) < 6:
        return error("La contraseña debe tener al menos 6 caracteres")
    if User.query.filter_by(email=email).first():
        return error("Ese correo ya está registrado")

    user = User(
        name=name,
        email=email,
        phone=(data.get("phone") or "").strip(),
        address=(data.get("address") or "").strip(),
        password_hash=generate_password_hash(password),
        role="client",
        avatar_emoji="😋",
    )
    db.session.add(user)
    db.session.commit()
    session["user_id"] = user.id
    return ok(user.to_dict(), message="¡Bienvenido a DomiRest!")


@auth_bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return error("Correo o contraseña incorrectos", 401)
    session.clear()
    session["user_id"] = user.id
    return ok(user.to_dict(), message=f"¡Hola de nuevo, {user.name.split()[0]}!")


@auth_bp.post("/demo/<role>")
def demo(role):
    """Acceso rápido para la presentación en vivo."""
    if role not in ROLES:
        return error("Rol inválido")
    user = User.query.filter_by(role=role).order_by(User.id.asc()).first()
    if not user:
        return error("No hay usuario demo para ese rol. Ejecuta seed.py", 404)
    session.clear()
    session["user_id"] = user.id
    return ok(user.to_dict(), message="Modo demo activado")


@auth_bp.post("/logout")
def logout():
    session.clear()
    return ok(message="Sesión cerrada")


@auth_bp.get("/me")
@login_required()
def me():
    return ok(g.user.to_dict())


@auth_bp.patch("/me")
@login_required()
def update_me():
    data = request.get_json(silent=True) or {}
    user = g.user
    if "name" in data and len((data["name"] or "").strip()) >= 3:
        user.name = data["name"].strip()
    if "phone" in data:
        user.phone = (data["phone"] or "").strip()[:40]
    if "address" in data:
        user.address = (data["address"] or "").strip()[:255]
    if "avatar_emoji" in data:
        user.avatar_emoji = (data["avatar_emoji"] or "🙂")[:8]
    if "available" in data and user.role == "courier":
        user.available = bool(data["available"])
    db.session.commit()
    return ok(user.to_dict(), message="Perfil actualizado")
