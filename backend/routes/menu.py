"""Categorías, catálogo y CRUD de productos para el administrador."""
from flask import Blueprint, request, session

from models import Category, OrderItem, Product, User, db
from utils import error, ok, login_required

menu_bp = Blueprint("menu", __name__, url_prefix="/api")


def _is_admin_session() -> bool:
    user_id = session.get("user_id")
    if not user_id:
        return False
    user = db.session.get(User, user_id)
    return bool(user and user.role == "admin")


@menu_bp.get("/categories")
def categories():
    items = Category.query.order_by(Category.sort_order.asc(), Category.id.asc()).all()
    return ok([c.to_dict() for c in items])


@menu_bp.get("/products")
def products():
    category = request.args.get("category", "").strip()
    search = request.args.get("search", "").strip().lower()
    featured = request.args.get("featured")
    promo = request.args.get("promo")
    include_all = request.args.get("all") == "1"

    query = Product.query
    if not (include_all and _is_admin_session()):
        query = query.filter(Product.available.is_(True))
    if category and category != "todos":
        query = query.join(Category).filter(Category.slug == category)
    if featured == "1":
        query = query.filter(Product.featured.is_(True))
    if promo == "1":
        query = query.filter(Product.is_promo.is_(True))

    items = query.order_by(Product.featured.desc(), Product.sold.desc()).all()
    if search:
        items = [
            p
            for p in items
            if search in p.name.lower() or search in (p.description or "").lower()
        ]
    return ok([p.to_dict() for p in items])


@menu_bp.get("/products/<int:product_id>")
def product_detail(product_id):
    product = db.session.get(Product, product_id)
    if not product:
        return error("Producto no encontrado", 404)
    return ok(product.to_dict())


def _payload_to_product(data, product=None):
    name = (data.get("name") or "").strip()
    if product is None and len(name) < 3:
        return None, "El nombre del producto es obligatorio"
    if product is not None and "name" in data:
        if len(name) < 3:
            return None, "El nombre del producto es obligatorio"
        product.name = name

    if product is None:
        product = Product(
            name=name,
            category_id=int(data.get("category_id") or 0),
            price=int(data.get("price") or 0),
        )
    else:
        if "category_id" in data:
            product.category_id = int(data.get("category_id") or 0)
        if "price" in data:
            product.price = int(data.get("price") or 0)

    if not db.session.get(Category, product.category_id or 0):
        return None, "Selecciona una categoría válida"
    if product.price <= 0:
        return None, "El precio debe ser mayor a cero"

    for field in ("description", "image_url", "emoji", "badge"):
        if field in data:
            setattr(product, field, (data.get(field) or "").strip())
    if "old_price" in data:
        raw = data.get("old_price")
        product.old_price = int(raw) if raw else None
    for field in ("available", "featured", "is_promo"):
        if field in data:
            setattr(product, field, bool(data.get(field)))
    if "prep_minutes" in data:
        product.prep_minutes = max(5, int(data.get("prep_minutes") or 20))
    return product, None


@menu_bp.post("/products")
@login_required("admin")
def create_product():
    product, message = _payload_to_product(request.get_json(silent=True) or {})
    if message:
        return error(message)
    db.session.add(product)
    db.session.commit()
    return ok(product.to_dict(), message="Producto creado")


@menu_bp.put("/products/<int:product_id>")
@login_required("admin")
def update_product(product_id):
    product = db.session.get(Product, product_id)
    if not product:
        return error("Producto no encontrado", 404)
    product, message = _payload_to_product(request.get_json(silent=True) or {}, product)
    if message:
        return error(message)
    db.session.commit()
    return ok(product.to_dict(), message="Producto actualizado")


@menu_bp.patch("/products/<int:product_id>/availability")
@login_required("admin")
def toggle_availability(product_id):
    product = db.session.get(Product, product_id)
    if not product:
        return error("Producto no encontrado", 404)
    data = request.get_json(silent=True) or {}
    product.available = bool(data.get("available", not product.available))
    db.session.commit()
    return ok(product.to_dict(), message="Disponibilidad actualizada")


@menu_bp.delete("/products/<int:product_id>")
@login_required("admin")
def delete_product(product_id):
    product = db.session.get(Product, product_id)
    if not product:
        return error("Producto no encontrado", 404)
    referenced = OrderItem.query.filter_by(product_id=product.id).first()
    if referenced:
        product.available = False
        db.session.commit()
        return ok(message="El producto tiene pedidos históricos; se marcó como agotado")
    db.session.delete(product)
    db.session.commit()
    return ok(message="Producto eliminado")
