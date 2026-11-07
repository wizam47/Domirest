"""Pedidos: creación, seguimiento, estados, calificación y repetición."""
import random
from datetime import datetime

from flask import Blueprint, current_app, g, request

from models import Order, OrderItem, Product, User, db, utcnow
from utils import (
    NEXT_STATUS,
    can_access_order,
    error,
    get_order_or_404,
    login_required,
    ok,
)

orders_bp = Blueprint("orders", __name__, url_prefix="/api/orders")

PAYMENT_METHODS = ("efectivo", "tarjeta", "nequi", "daviplata")


def _new_code() -> str:
    for _ in range(30):
        code = f"DR-{random.randint(1000, 9999)}"
        if not Order.query.filter_by(code=code).first():
            return code
    return f"DR-{random.randint(10000, 99999)}"


@orders_bp.post("")
@login_required("client")
def create_order():
    data = request.get_json(silent=True) or {}
    raw_items = data.get("items") or []
    address = (data.get("address") or "").strip()
    payment_method = data.get("payment_method") or "efectivo"

    if not raw_items:
        return error("Tu carrito está vacío")
    if len(address) < 6:
        return error("Escribe una dirección de entrega válida")
    if payment_method not in PAYMENT_METHODS:
        return error("Método de pago no válido")

    items = []
    subtotal = 0
    max_prep = 15
    for raw in raw_items:
        product = db.session.get(Product, int(raw.get("product_id") or 0))
        quantity = max(1, min(20, int(raw.get("quantity") or 1)))
        if not product or not product.available:
            return error("Uno de los productos ya no está disponible")
        subtotal += product.price * quantity
        max_prep = max(max_prep, product.prep_minutes or 20)
        items.append((product, quantity, (raw.get("notes") or "").strip()[:255]))

    fee = 0 if subtotal >= current_app.config["FREE_DELIVERY_FROM"] else current_app.config["DELIVERY_FEE"]
    estimated = min(45, max(25, max_prep + 15 + random.randint(0, 5)))

    order = Order(
        code=_new_code(),
        client_id=g.user.id,
        status="recibido",
        subtotal=subtotal,
        delivery_fee=fee,
        total=subtotal + fee,
        payment_method=payment_method,
        payment_status="simulado",
        address=address,
        lat=float(data.get("lat") or 8.7480),
        lng=float(data.get("lng") or -75.8814),
        notes=(data.get("notes") or "").strip()[:500],
        estimated_minutes=estimated,
    )
    db.session.add(order)
    db.session.flush()

    for product, quantity, notes in items:
        db.session.add(
            OrderItem(
                order_id=order.id,
                product_id=product.id,
                name=product.name,
                price=product.price,
                quantity=quantity,
                notes=notes,
                emoji=product.emoji,
                image_url=product.image_url,
            )
        )
        product.sold = (product.sold or 0) + quantity

    db.session.commit()
    return ok(order.to_dict(detail=True), message="¡Pedido confirmado!")


@orders_bp.get("")
@login_required()
def list_orders():
    limit = min(100, int(request.args.get("limit", 60)))
    if g.user.role == "client":
        items = (
            Order.query.filter_by(client_id=g.user.id)
            .order_by(Order.created_at.desc())
            .limit(limit)
            .all()
        )
    elif g.user.role == "courier":
        items = (
            Order.query.filter_by(courier_id=g.user.id)
            .order_by(Order.created_at.desc())
            .limit(limit)
            .all()
        )
    else:
        items = Order.query.order_by(Order.created_at.desc()).limit(limit).all()
    return ok([o.to_dict(detail=True) for o in items])


@orders_bp.get("/<int:order_id>")
@login_required()
def order_detail(order_id):
    order = get_order_or_404(order_id)
    if not order:
        return error("Pedido no encontrado", 404)
    if not can_access_order(g.user, order):
        return error("No tienes acceso a este pedido", 403)
    return ok(order.to_dict(detail=True))


@orders_bp.post("/<int:order_id>/status")
@login_required("admin", "courier")
def update_status(order_id):
    order = get_order_or_404(order_id)
    if not order:
        return error("Pedido no encontrado", 404)
    if g.user.role == "courier" and order.courier_id != g.user.id:
        return error("Este pedido no está asignado a ti", 403)

    data = request.get_json(silent=True) or {}
    new_status = data.get("status")
    if new_status not in NEXT_STATUS:
        return error("Estado inválido")

    if g.user.role == "courier" and new_status not in ("en_camino", "entregado"):
        return error("El domiciliario solo puede iniciar ruta o entregar")

    allowed = NEXT_STATUS.get(order.status, [])
    if g.user.role == "admin":
        allowed = [s for s in NEXT_STATUS if s != order.status]
    if new_status not in allowed:
        return error(f"No se puede pasar de {order.status} a {new_status}")

    order.status = new_status
    order.updated_at = utcnow()
    if new_status == "entregado":
        order.delivered_at = utcnow()
        order.payment_status = "pagado"
    if new_status == "cancelado":
        order.payment_status = "cancelado"
    db.session.commit()
    return ok(order.to_dict(detail=True), message="Estado actualizado")


@orders_bp.post("/<int:order_id>/assign")
@login_required("admin")
def assign_courier(order_id):
    order = get_order_or_404(order_id)
    if not order:
        return error("Pedido no encontrado", 404)
    data = request.get_json(silent=True) or {}
    courier = db.session.get(User, int(data.get("courier_id") or 0))
    if not courier or courier.role != "courier":
        return error("Selecciona un domiciliario válido")
    order.courier_id = courier.id
    order.updated_at = utcnow()
    db.session.commit()
    return ok(order.to_dict(detail=True), message=f"Asignado a {courier.name}")


@orders_bp.post("/<int:order_id>/rate")
@login_required("client")
def rate_order(order_id):
    order = get_order_or_404(order_id)
    if not order or order.client_id != g.user.id:
        return error("Pedido no encontrado", 404)
    if order.status != "entregado":
        return error("Solo puedes calificar pedidos entregados")
    data = request.get_json(silent=True) or {}
    rating = int(data.get("rating") or 0)
    if rating < 1 or rating > 5:
        return error("La calificación debe estar entre 1 y 5")
    order.rating = rating
    order.rating_comment = (data.get("comment") or "").strip()[:400]
    db.session.commit()
    return ok(order.to_dict(detail=True), message="¡Gracias por tu calificación!")


@orders_bp.get("/<int:order_id>/repeat")
@login_required("client")
def repeat_order(order_id):
    """Devuelve los ítems del pedido adaptados para volver a agregarlos al carrito."""
    order = get_order_or_404(order_id)
    if not order or order.client_id != g.user.id:
        return error("Pedido no encontrado", 404)
    payload = []
    for item in order.items:
        product = db.session.get(Product, item.product_id) if item.product_id else None
        payload.append(
            {
                "product_id": product.id if product else None,
                "name": item.name,
                "price": product.price if product and product.available else item.price,
                "quantity": item.quantity,
                "notes": item.notes,
                "emoji": item.emoji,
                "image_url": item.image_url,
                "available": bool(product and product.available),
            }
        )
    return ok(payload, message="Productos listos para repetir")
