"""
Datos de demostración de DomiRest.
Uso:
    python seed.py

Reinicia la base de datos y carga usuarios, menú, pedidos históricos y
comandas activas para que el dashboard y la demo se vean "vivos".
"""
import random
from datetime import datetime, timedelta, timezone

from werkzeug.security import generate_password_hash

from models import Category, Order, OrderItem, Product, User, db

random.seed(20261106)
NOW = datetime.now(timezone.utc).replace(tzinfo=None)

IMG = "https://images.unsplash.com/{}?auto=format&fit=crop&w=900&q=72"

CATEGORIES = [
    ("Platos fuertes", "platos-fuertes", "🍛", "#FFE3D6", 1),
    ("Sabor costeño", "costenos", "🥘", "#FFEFC2", 2),
    ("Rápidos", "rapidos", "🍔", "#FFD9CE", 3),
    ("Para picar", "entradas", "🍟", "#DFF7EF", 4),
    ("Bebidas", "bebidas", "🥤", "#DDF0FF", 5),
    ("Postres", "postres", "🍮", "#F3E2FF", 6),
]

PRODUCTS = [
    {
        "name": "Bandeja paisa Sabor & Punto",
        "description": "Frijoles antioqueños, carne en polvo, chicharrón crocante, morcilla, huevo, arepa y maduro. La reina de la casa.",
        "price": 28500, "old_price": 32000, "cat": "platos-fuertes",
        "img": "photo-1546069901-ba9599a7e63c", "emoji": "🍛", "badge": "El favorito",
        "featured": True, "promo": True, "prep": 28, "rating": 4.9, "sold": 412, "emoji_fallback": "🍛",
    },
    {
        "name": "Arroz con pollo de la abuela",
        "description": "Arroz sazonado con pollo desmechado, arvejas, zanahoria y el toque secreto de la casa. Acompañado de maduro.",
        "price": 22500, "cat": "platos-fuertes",
        "img": "photo-1512058564366-18510be2db19", "emoji": "🍗", "badge": "",
        "featured": True, "promo": False, "prep": 22, "rating": 4.8, "sold": 386,
    },
    {
        "name": "Mote de queso costeño",
        "description": "Ñame cremoso con queso de hebra, suero costeño y limón. Reconfortante como el de la casa de la abuela.",
        "price": 19500, "cat": "costenos",
        "img": "photo-1547592166-23ac45744acd", "emoji": "🥣", "badge": "Tradición",
        "featured": False, "promo": False, "prep": 20, "rating": 4.7, "sold": 221,
    },
    {
        "name": "Carne a la plancha",
        "description": "Corte de res a la plancha con chimichurri de la casa, papas a la francesa y ensalada fresca.",
        "price": 32900, "cat": "platos-fuertes",
        "img": "photo-1544025162-d76694265947", "emoji": "🥩", "badge": "",
        "featured": True, "promo": False, "prep": 25, "rating": 4.8, "sold": 198,
    },
    {
        "name": "Hamburguesa Sabor & Punto",
        "description": "Doble carne 100% res, queso cheddar fundido, tocino, cebolla caramelizada y salsa de la casa. Con papas rústicas.",
        "price": 24900, "old_price": 29900, "cat": "rapidos",
        "img": "photo-1568901346375-23c9450c58cd", "emoji": "🍔", "badge": "2x1 los martes",
        "featured": True, "promo": True, "prep": 18, "rating": 4.9, "sold": 354,
    },
    {
        "name": "Patacones con hogao",
        "description": "Seis patacones de plátano verde bien crocantes con hogao de tomate y cebollín, queso costeño rallado.",
        "price": 12500, "cat": "entradas",
        "img": "photo-1573080496219-bb080dd4f877", "emoji": "🍌", "badge": "",
        "featured": False, "promo": False, "prep": 12, "rating": 4.8, "sold": 302,
    },
    {
        "name": "Arepa de huevo",
        "description": "Arepa de maíz frita rellena de huevo y carne molida. Crujiente por fuera, jugosa por dentro.",
        "price": 8500, "cat": "costenos",
        "img": "photo-1552332386-f8dd00dc2f85", "emoji": "🫓", "badge": "Recién hecha",
        "featured": False, "promo": False, "prep": 10, "rating": 4.7, "sold": 267,
    },
    {
        "name": "Jugo de corozo",
        "description": "Corozo fresco batido con hielo y un toque de limón. La bebida insignia de la costa.",
        "price": 7500, "cat": "bebidas",
        "img": "photo-1546173159-315724a31696", "emoji": "🫐", "badge": "",
        "featured": True, "promo": False, "prep": 6, "rating": 4.9, "sold": 445,
    },
    {
        "name": "Jugo de lulo",
        "description": "Lulo natural en agua o leche, endulzado a tu gusto. Refrescante y lleno de vitamina C.",
        "price": 8500, "cat": "bebidas",
        "img": "photo-1622597467836-f3285f2131b8", "emoji": "🥤", "badge": "",
        "featured": False, "promo": False, "prep": 6, "rating": 4.8, "sold": 310,
    },
    {
        "name": "Jugo de maracuyá",
        "description": "Pulpa de maracuyá fresca con hielo. Ácido, aromático y perfecto para acompañar el almuerzo.",
        "price": 7500, "cat": "bebidas",
        "img": "photo-1600271886742-f049cd451bba", "emoji": "🧃", "badge": "",
        "featured": False, "promo": False, "prep": 6, "rating": 4.7, "sold": 289,
    },
    {
        "name": "Ceviche de camarón",
        "description": "Camarones frescos en leche de coco, limón, cebolla roja, cilantro y aguacate. Servido con galletas de soda.",
        "price": 26900, "old_price": 31000, "cat": "costenos",
        "img": "photo-1535399831218-d5bd36d1a6b3", "emoji": "🦐", "badge": "Del mar",
        "featured": True, "promo": True, "prep": 20, "rating": 4.9, "sold": 176,
    },
    {
        "name": "Sancocho de gallina",
        "description": "Gallina criolla, yuca, ñame, plátano y mazorca en un caldo lleno de sabor. Con arroz y aguacate.",
        "price": 23900, "cat": "costenos",
        "img": "photo-1547592180-85f173990554", "emoji": "🍲", "badge": "",
        "featured": False, "promo": False, "prep": 26, "rating": 4.8, "sold": 243,
    },
    {
        "name": "Flan de coco",
        "description": "Flan cremoso de coco con caramelo de panela y coco tostado. El cierre perfecto.",
        "price": 9500, "cat": "postres",
        "img": "photo-1551024506-0bccd828d307", "emoji": "🍮", "badge": "",
        "featured": False, "promo": False, "prep": 8, "rating": 4.8, "sold": 201,
    },
    {
        "name": "Torta de chocolate",
        "description": "Bizcocho húmedo de cacao con ganache de chocolate oscuro y una pizca de sal marina.",
        "price": 11500, "cat": "postres",
        "img": "photo-1578985545062-69928b1d9587", "emoji": "🍰", "badge": "Antojo",
        "featured": False, "promo": False, "prep": 8, "rating": 4.9, "sold": 228,
    },
    {
        "name": "Limonada de coco",
        "description": "Limón recién exprimido, leche de coco y hielo frappé. Cremosa, fresca y adictiva.",
        "price": 9500, "cat": "bebidas",
        "img": "photo-1544145945-f90425340c7e", "emoji": "🍹", "badge": "Nueva",
        "featured": False, "promo": False, "prep": 7, "rating": 4.9, "sold": 187,
    },
]

USERS = [
    ("Valentina Ríos", "cliente@saborpunto.co", "300 123 4567", "client", "😋",
     "Calle 35 #8-24, Barrio La Castellana, Montería"),
    ("Chef Andrés", "admin@saborpunto.co", "312 555 0101", "admin", "👨‍🍳",
     "Sabor & Punto · Carrera 6 #62-18, Centro, Montería"),
    ("Carlos Meza", "domiciliario@saborpunto.co", "320 456 7890", "courier", "🛵",
     "Montería, Córdoba"),
    ("Yuli Herrera", "yuli@saborpunto.co", "318 777 2211", "courier", "🛵",
     "Montería, Córdoba"),
    ("Jorge Pineda", "jorge@correo.co", "301 222 3344", "client", "🧑🏽",
     "Carrera 12 #79-30, Monteverde, Montería"),
    ("María Fernanda López", "mafe@correo.co", "305 888 1122", "client", "👩🏽",
     "Calle 24 #4-56, Centro, Montería"),
    ("Luis Torres", "luis@correo.co", "310 444 5566", "client", "🧔🏽",
     "Carrera 8 #50-21, Los Almendros, Montería"),
    ("Andrea Gómez", "andrea@correo.co", "317 999 8877", "client", "👩🏽‍🦱",
     "Calle 50 #10-15, Sucre, Montería"),
]

ADDRESSES = [
    ("Calle 35 #8-24, Barrio La Castellana", 8.7572, -75.8810),
    ("Carrera 6 #62-18, Centro", 8.7480, -75.8814),
    ("Calle 24 #4-56, Centro", 8.7521, -75.8849),
    ("Carrera 12 #79-30, Monteverde", 8.7695, -75.8682),
    ("Calle 50 #10-15, Los Almendros", 8.7391, -75.8740),
    ("Carrera 8 #50-21, Sucre", 8.7602, -75.8901),
    ("Calle 14 #7-40, La Granja", 8.7412, -75.8952),
    ("Carrera 4 #68-12, La Ceiba", 8.7648, -75.8853),
]

PAYMENTS = ("efectivo", "tarjeta", "nequi", "daviplata")


def _populate_demo_data():
    users = {}
    for name, email, phone, role, emoji, address in USERS:
        user = User(
            name=name,
            email=email,
            phone=phone,
            role=role,
            avatar_emoji=emoji,
            address=address,
            password_hash=generate_password_hash("Demo1234"),
            available=True,
        )
        db.session.add(user)
        users[email] = user
    db.session.flush()

    clients = [u for u in users.values() if u.role == "client"]
    couriers = [u for u in users.values() if u.role == "courier"]
    demo_client = users["cliente@saborpunto.co"]
    carlos = users["domiciliario@saborpunto.co"]

    cats = {}
    for name, slug, icon, tint, order in CATEGORIES:
        category = Category(name=name, slug=slug, icon=icon, tint=tint, sort_order=order)
        db.session.add(category)
        cats[slug] = category
    db.session.flush()

    products = []
    for raw in PRODUCTS:
        product = Product(
            name=raw["name"],
            description=raw["description"],
            price=raw["price"],
            old_price=raw.get("old_price"),
            category_id=cats[raw["cat"]].id,
            image_url=IMG.format(raw["img"]),
            emoji=raw["emoji"],
            badge=raw.get("badge", ""),
            available=True,
            featured=raw.get("featured", False),
            is_promo=raw.get("promo", False),
            prep_minutes=raw.get("prep", 20),
            rating=raw.get("rating", 4.8),
            sold=raw.get("sold", 0),
        )
        products.append(product)
        db.session.add(product)
    db.session.flush()

    counter = {"n": 1000}

    def new_code():
        counter["n"] += random.randint(1, 7)
        return f"DR-{counter['n']}"

    def make_order(client, when, status, courier=None, payment=None, address=None):
        if address is None:
            address = random.choice(ADDRESSES)
        chosen = random.sample(products, random.randint(1, 4))
        subtotal = 0
        lines = []
        for product in chosen:
            quantity = random.randint(1, 2)
            subtotal += product.price * quantity
            lines.append((product, quantity))
        fee = 0 if subtotal >= 60000 else 3500
        minutes = random.randint(26, 42) if random.random() > 0.14 else random.randint(46, 61)
        delivered_at = None
        rating = None
        comment = ""
        if status == "entregado":
            delivered_at = when + timedelta(minutes=minutes)
            rating = random.choices([5, 4, 3, None], weights=[58, 30, 7, 5])[0]
            if rating == 5:
                comment = random.choice(
                    ["Todo delicioso, llegó calientito.", "El mejor arroz con pollo de Montería.", "Muy rápido, gracias."]
                )
            elif rating == 4:
                comment = random.choice(["Muy rico, solo un poquito de demora.", "Buen sabor y buena atención."])
            elif rating == 3:
                comment = "La comida rica, pero llegó tibia."

        order = Order(
            code=new_code(),
            client_id=client.id,
            courier_id=(courier.id if courier else (random.choice(couriers).id if status != "recibido" else None)),
            status=status,
            subtotal=subtotal,
            delivery_fee=fee,
            total=subtotal + fee,
            payment_method=payment or random.choice(PAYMENTS),
            payment_status="pagado" if status == "entregado" else ("cancelado" if status == "cancelado" else "simulado"),
            address=address[0],
            lat=address[1] + random.uniform(-0.004, 0.004),
            lng=address[2] + random.uniform(-0.004, 0.004),
            notes=random.choice(["", "", "Sin cebolla, por favor.", "Timbre dos veces.", "Agregar ají."]),
            estimated_minutes=35,
            created_at=when,
            updated_at=delivered_at or when,
            delivered_at=delivered_at,
            rating=rating,
            rating_comment=comment,
        )
        db.session.add(order)
        db.session.flush()
        for product, quantity in lines:
            db.session.add(
                OrderItem(
                    order_id=order.id,
                    product_id=product.id,
                    name=product.name,
                    price=product.price,
                    quantity=quantity,
                    emoji=product.emoji,
                    image_url=product.image_url,
                )
            )
        return order

    # --- Pedidos activos de hoy (para comandas y seguimiento) ---
    today = datetime(NOW.year, NOW.month, NOW.day)
    active_specs = [
        ("recibido", 4), ("recibido", 11), ("recibido", 18),
        ("preparando", 22), ("preparando", 31), ("preparando", 46),
        ("listo", 52), ("listo", 63),
        ("en_camino", 24), ("en_camino", 38),
    ]
    for i, (status, mins_ago) in enumerate(active_specs):
        when = NOW - timedelta(minutes=mins_ago)
        if when < today:
            when = today + timedelta(minutes=2 + i)
        client = demo_client if i == 8 else random.choice(clients)
        courier = carlos if i == 8 else (random.choice(couriers) if status in ("listo", "en_camino") else None)
        address = ADDRESSES[0] if i == 8 else None
        make_order(client, when, status, courier=courier, address=address)

    # --- Pedidos entregados de hoy ---
    for i in range(6):
        when = max(today + timedelta(minutes=3 + i * 7), NOW - timedelta(hours=7 - i))
        make_order(random.choice(clients), when, "entregado", courier=random.choice(couriers))

    # --- Dos cancelados para variar el tablero ---
    for i in range(2):
        make_order(random.choice(clients), today + timedelta(minutes=30 + i * 9), "cancelado")

    # --- Historial del mes: mantiene viva la meta de 300 pedidos ---
    month_start = datetime(NOW.year, NOW.month, 1)
    span = max((NOW - timedelta(minutes=40)) - month_start, timedelta(hours=2))
    total_month_history = 214
    for i in range(total_month_history):
        when = month_start + timedelta(seconds=random.random() * span.total_seconds())
        status = "entregado" if random.random() > 0.04 else "cancelado"
        make_order(random.choice(clients), when, status, courier=random.choice(couriers))

    # --- Historial del mes anterior ---
    prev_start = month_start - timedelta(days=32)
    prev_end = month_start - timedelta(hours=3)
    span_prev = (prev_end - prev_start).total_seconds()
    for _ in range(55):
        when = prev_start + timedelta(seconds=random.random() * span_prev)
        make_order(random.choice(clients), when, "entregado", courier=random.choice(couriers))

    # Pedidos históricos de la clienta demo para el botón "Repetir pedido"
    comments = [
        ("entregado", 2, 5, "La bandeja paisa espectacular, llegó calientita."),
        ("entregado", 6, 5, "Rapidísimos. El corozo estaba fresquísimo."),
        ("entregado", 12, 4, "Muy rico todo, el domiciliario muy amable."),
    ]
    for status, days_ago, rating, comment in comments:
        order = make_order(
            demo_client,
            NOW - timedelta(days=days_ago),
            status,
            courier=carlos,
            address=ADDRESSES[0],
        )
        order.rating = rating
        order.rating_comment = comment

    db.session.commit()

    print("\n[OK] Base de datos creada y datos cargados")
    print(f"     Usuarios demo: {len(users)} | Productos: {len(products)}")
    print(f"     Pedidos: {Order.query.count()} | Items: {OrderItem.query.count()}")
    print("\n     Credenciales demo (clave para todos: Demo1234)")
    print("     Cliente:       cliente@saborpunto.co")
    print("     Administrador: admin@saborpunto.co")
    print("     Domiciliario:  domiciliario@saborpunto.co\n")


def seed():
    import os

    os.environ["DOMIREST_SKIP_AUTO_SEED"] = "1"
    from app import create_app

    app = create_app(auto_seed=False)
    with app.app_context():
        db.drop_all()
        db.create_all()
        _populate_demo_data()


def ensure_demo_data(app):
    with app.app_context():
        if User.query.first() or Product.query.first():
            return False
        _populate_demo_data()
        return True


if __name__ == "__main__":
    seed()
