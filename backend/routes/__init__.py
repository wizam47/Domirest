"""Registro de blueprints de la API."""
from .admin import admin_bp
from .auth import auth_bp
from .courier import courier_bp
from .menu import menu_bp
from .orders import orders_bp


def register_routes(app):
    app.register_blueprint(auth_bp)
    app.register_blueprint(menu_bp)
    app.register_blueprint(orders_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(courier_bp)
