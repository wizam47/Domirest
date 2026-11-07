"""Modelos de datos de DomiRest (SQLAlchemy)."""
from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

ROLES = ("client", "admin", "courier")
STATUSES = ("recibido", "preparando", "listo", "en_camino", "entregado", "cancelado")


def utcnow() -> datetime:
    """Hora UTC sin zona para guardar de forma consistente en SQLite/MySQL."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(dt):
    if not dt:
        return None
    return dt.isoformat(timespec="seconds") + "Z"


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(160), unique=True, nullable=False, index=True)
    phone = db.Column(db.String(40), default="")
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="client")
    address = db.Column(db.String(255), default="")
    avatar_emoji = db.Column(db.String(8), default="🙂")
    available = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=utcnow)

    def to_dict(self, private: bool = False):
        data = {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "phone": self.phone,
            "role": self.role,
            "address": self.address,
            "avatar_emoji": self.avatar_emoji,
            "available": bool(self.available),
            "created_at": iso(self.created_at),
        }
        if private:
            data["email"] = self.email
        return data


class Category(db.Model):
    __tablename__ = "categories"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    slug = db.Column(db.String(80), unique=True, nullable=False)
    icon = db.Column(db.String(120), default="🍽️")
    tint = db.Column(db.String(30), default="#FFE3D6")
    sort_order = db.Column(db.Integer, default=0)

    products = db.relationship("Product", backref="category", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "slug": self.slug,
            "icon": self.icon,
            "tint": self.tint,
            "sort_order": self.sort_order,
        }


class Product(db.Model):
    __tablename__ = "products"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(140), nullable=False)
    description = db.Column(db.Text, default="")
    price = db.Column(db.Integer, nullable=False)
    old_price = db.Column(db.Integer)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=False)
    image_url = db.Column(db.String(500), default="")
    emoji = db.Column(db.String(12), default="🍽️")
    badge = db.Column(db.String(40), default="")
    available = db.Column(db.Boolean, default=True)
    featured = db.Column(db.Boolean, default=False)
    is_promo = db.Column(db.Boolean, default=False)
    prep_minutes = db.Column(db.Integer, default=20)
    rating = db.Column(db.Float, default=4.8)
    sold = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "price": self.price,
            "old_price": self.old_price,
            "category_id": self.category_id,
            "category": self.category.name if self.category else None,
            "category_slug": self.category.slug if self.category else None,
            "image_url": self.image_url,
            "emoji": self.emoji,
            "badge": self.badge,
            "available": bool(self.available),
            "featured": bool(self.featured),
            "is_promo": bool(self.is_promo),
            "prep_minutes": self.prep_minutes,
            "rating": round(self.rating or 0, 1),
            "sold": self.sold,
        }


class Order(db.Model):
    __tablename__ = "orders"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(20), unique=True, nullable=False, index=True)
    client_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    courier_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    status = db.Column(db.String(20), nullable=False, default="recibido", index=True)
    subtotal = db.Column(db.Integer, nullable=False, default=0)
    delivery_fee = db.Column(db.Integer, nullable=False, default=0)
    total = db.Column(db.Integer, nullable=False, default=0)
    payment_method = db.Column(db.String(30), default="efectivo")
    payment_status = db.Column(db.String(30), default="simulado")
    address = db.Column(db.String(255), default="")
    lat = db.Column(db.Float, default=8.7480)
    lng = db.Column(db.Float, default=-75.8814)
    notes = db.Column(db.Text, default="")
    estimated_minutes = db.Column(db.Integer, default=35)
    rating = db.Column(db.Integer)
    rating_comment = db.Column(db.Text, default="")
    created_at = db.Column(db.DateTime, default=utcnow, index=True)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)
    delivered_at = db.Column(db.DateTime)

    client = db.relationship("User", foreign_keys=[client_id])
    courier = db.relationship("User", foreign_keys=[courier_id])
    items = db.relationship(
        "OrderItem", backref="order", cascade="all, delete-orphan", lazy=True
    )

    def to_dict(self, detail: bool = False):
        data = {
            "id": self.id,
            "code": self.code,
            "client_id": self.client_id,
            "client": self.client.to_dict() if self.client else None,
            "courier_id": self.courier_id,
            "courier": self.courier.to_dict() if self.courier else None,
            "status": self.status,
            "subtotal": self.subtotal,
            "delivery_fee": self.delivery_fee,
            "total": self.total,
            "payment_method": self.payment_method,
            "payment_status": self.payment_status,
            "address": self.address,
            "lat": self.lat,
            "lng": self.lng,
            "notes": self.notes,
            "estimated_minutes": self.estimated_minutes,
            "rating": self.rating,
            "rating_comment": self.rating_comment,
            "created_at": iso(self.created_at),
            "updated_at": iso(self.updated_at),
            "delivered_at": iso(self.delivered_at),
            "items_count": sum(i.quantity for i in self.items),
        }
        if detail:
            data["items"] = [i.to_dict() for i in self.items]
        return data


class OrderItem(db.Model):
    __tablename__ = "order_items"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"))
    name = db.Column(db.String(140), nullable=False)
    price = db.Column(db.Integer, nullable=False)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    notes = db.Column(db.String(255), default="")
    emoji = db.Column(db.String(12), default="🍽️")
    image_url = db.Column(db.String(500), default="")

    def to_dict(self):
        return {
            "id": self.id,
            "product_id": self.product_id,
            "name": self.name,
            "price": self.price,
            "quantity": self.quantity,
            "notes": self.notes,
            "emoji": self.emoji,
            "image_url": self.image_url,
            "line_total": self.price * self.quantity,
        }
