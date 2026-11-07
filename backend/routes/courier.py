"""Resumen del domiciliario."""
from datetime import datetime

from flask import Blueprint, g

from models import Order, db, utcnow
from utils import login_required, ok

courier_bp = Blueprint("courier", __name__, url_prefix="/api/courier")


@courier_bp.get("/summary")
@login_required("courier")
def summary():
    now = utcnow()
    today_start = datetime(now.year, now.month, now.day)
    assigned = (
        Order.query.filter(
            Order.courier_id == g.user.id,
            Order.status.in_(("recibido", "preparando", "listo", "en_camino")),
        )
        .order_by(Order.created_at.asc())
        .all()
    )
    delivered_today = Order.query.filter(
        Order.courier_id == g.user.id,
        Order.status == "entregado",
        Order.delivered_at >= today_start,
    ).all()

    return ok(
        {
            "available": bool(g.user.available),
            "active": len(assigned),
            "delivered_today": len(delivered_today),
            "earnings_today": sum(o.delivery_fee for o in delivered_today),
            "orders": [o.to_dict(detail=True) for o in assigned],
        }
    )
