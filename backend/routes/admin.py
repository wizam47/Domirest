"""Dashboard, comandas y gestión del restaurante."""
from datetime import datetime, timedelta

from flask import Blueprint, g, request

from models import Order, Product, User, db, utcnow
from utils import error, login_required, ok

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")

ACTIVE_STATUSES = ("recibido", "preparando", "listo", "en_camino")


@admin_bp.get("/stats")
@login_required("admin")
def stats():
    now = utcnow()
    today_start = datetime(now.year, now.month, now.day)
    month_start = datetime(now.year, now.month, 1)
    week_start = today_start - timedelta(days=6)

    today_orders = Order.query.filter(
        Order.created_at >= today_start, Order.status != "cancelado"
    ).all()
    month_orders = Order.query.filter(
        Order.created_at >= month_start, Order.status != "cancelado"
    ).all()
    last30 = Order.query.filter(
        Order.created_at >= now - timedelta(days=30),
        Order.status == "entregado",
    ).all()

    delivered = [o for o in today_orders if o.status == "entregado"]
    on_time = 0
    for order in last30:
        if order.delivered_at and order.created_at:
            minutes = (order.delivered_at - order.created_at).total_seconds() / 60
            if minutes <= 45:
                on_time += 1
    on_time_pct = round((on_time / len(last30)) * 100) if last30 else 96

    rated = [o for o in last30 if o.rating]
    satisfaction = round(sum(o.rating for o in rated) / len(rated), 1) if rated else 4.8

    delivery_times = [
        (o.delivered_at - o.created_at).total_seconds() / 60
        for o in last30
        if o.delivered_at and o.created_at
    ]
    avg_delivery = round(sum(delivery_times) / len(delivery_times)) if delivery_times else 34

    daily = []
    for i in range(7):
        day_start = week_start + timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        day_orders = Order.query.filter(
            Order.created_at >= day_start,
            Order.created_at < day_end,
            Order.status != "cancelado",
        ).all()
        daily.append(
            {
                "label": day_start.strftime("%a").lower()[:3],
                "date": day_start.strftime("%d/%m"),
                "orders": len(day_orders),
                "sales": sum(o.total for o in day_orders),
            }
        )

    status_counts = {s: 0 for s in ACTIVE_STATUSES}
    for order in today_orders:
        if order.status in status_counts:
            status_counts[order.status] += 1

    top_products = (
        Product.query.order_by(Product.sold.desc()).limit(5).all()
    )

    active_orders = Order.query.filter(Order.status.in_(ACTIVE_STATUSES)).count()

    return ok(
        {
            "orders_today": len(today_orders),
            "sales_today": sum(o.total for o in today_orders),
            "delivered_today": len(delivered),
            "avg_ticket": round(
                sum(o.total for o in today_orders) / len(today_orders)
            )
            if today_orders
            else 0,
            "on_time_pct": on_time_pct,
            "satisfaction": satisfaction,
            "monthly_orders": len(month_orders),
            "monthly_target": 300,
            "monthly_progress": min(100, round(len(month_orders) / 300 * 100)),
            "avg_delivery": avg_delivery,
            "active_orders": active_orders,
            "daily": daily,
            "status_counts": status_counts,
            "top_products": [p.to_dict() for p in top_products],
            "generated_at": now.isoformat(timespec="seconds") + "Z",
        }
    )


@admin_bp.get("/orders")
@login_required("admin")
def admin_orders():
    active = request.args.get("active") == "1"
    status = request.args.get("status")
    limit = min(120, int(request.args.get("limit", 60)))
    query = Order.query
    if active:
        query = query.filter(Order.status.in_(ACTIVE_STATUSES))
    if status:
        query = query.filter(Order.status == status)
    items = query.order_by(Order.created_at.asc()).limit(limit).all()
    return ok([o.to_dict(detail=True) for o in items])


@admin_bp.get("/couriers")
@login_required("admin")
def couriers():
    users = User.query.filter_by(role="courier").order_by(User.id.asc()).all()
    active_by_courier = {}
    for order in Order.query.filter(
        Order.status.in_(("listo", "en_camino")), Order.courier_id.isnot(None)
    ).all():
        active_by_courier[order.courier_id] = active_by_courier.get(order.courier_id, 0) + 1
    data = []
    for user in users:
        item = user.to_dict()
        item["active_orders"] = active_by_courier.get(user.id, 0)
        data.append(item)
    return ok(data)


@admin_bp.get("/recent")
@login_required("admin")
def recent_orders():
    items = Order.query.order_by(Order.created_at.desc()).limit(8).all()
    return ok([o.to_dict(detail=False) for o in items])
