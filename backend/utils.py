"""Utilidades compartidas: autenticación por sesión, validaciones y respuestas."""
from functools import wraps

from flask import g, jsonify, session

from models import Order, User, db

# Flujo normal de una comanda. Los administradores pueden saltar estados.
NEXT_STATUS = {
    "recibido": ["preparando", "cancelado"],
    "preparando": ["listo", "cancelado"],
    "listo": ["en_camino", "cancelado"],
    "en_camino": ["entregado", "cancelado"],
    "entregado": [],
    "cancelado": [],
}

STATUS_LABELS = {
    "recibido": "Recibido",
    "preparando": "Preparando",
    "listo": "Listo",
    "en_camino": "En camino",
    "entregado": "Entregado",
    "cancelado": "Cancelado",
}


def error(message: str, code: int = 400):
    return jsonify({"ok": False, "error": message}), code


def ok(data=None, **extra):
    payload = {"ok": True}
    if data is not None:
        payload["data"] = data
    payload.update(extra)
    return jsonify(payload)


def login_required(*roles):
    """Exige sesión activa y, opcionalmente, uno o varios roles."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user_id = session.get("user_id")
            if not user_id:
                return error("Debes iniciar sesión", 401)
            user = db.session.get(User, user_id)
            if not user:
                session.clear()
                return error("Sesión expirada", 401)
            if roles and user.role not in roles:
                return error("No tienes permisos para esta acción", 403)
            g.user = user
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def get_order_or_404(order_id):
    order = db.session.get(Order, order_id)
    if not order:
        return None
    return order


def can_access_order(user, order: Order) -> bool:
    if user.role == "admin":
        return True
    if user.role == "client":
        return order.client_id == user.id
    if user.role == "courier":
        return order.courier_id == user.id
    return False
