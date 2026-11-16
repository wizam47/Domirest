"""Facturas de DomiRest: datos para la vista previa y PDF con fpdf2.

El número de factura se deriva del pedido (año de creación + id), así que no
hace falta agregar columnas ni tablas a la base de datos.
"""
from datetime import datetime, timedelta, timezone

from fpdf import FPDF

RESTAURANT_NAME = "DomiRest"
RESTAURANT_TAGLINE = "Sabor & Punto"
RESTAURANT_ADDRESS = "Carrera 6 #62-18, Centro, Montería, Córdoba"
RESTAURANT_NIT = "900.000.000-0"

PAYMENT_LABELS = {
    "efectivo": "Efectivo",
    "tarjeta": "Tarjeta",
    "nequi": "Nequi",
    "daviplata": "Daviplata",
}

PAYMENT_STATUS_LABELS = {
    "pagado": "Pagado",
    "simulado": "Pago simulado",
    "pendiente": "Pendiente",
    "cancelado": "Cancelado",
}

MONTHS_ES = (
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
)

# Paleta de la app
CORAL = (255, 90, 54)
MANGO = (255, 182, 39)
PLUM = (31, 27, 45)
CREAM = (255, 246, 236)
CREAM_SOFT = (255, 250, 244)
LINE = (232, 222, 212)
MUTED = (141, 130, 153)
WHITE = (255, 255, 255)


def _fallback_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def invoice_number(order) -> str:
    """FAC-{año UTC de created_at}-{id con 6 dígitos}."""
    created = order.created_at or _fallback_now()
    return f"FAC-{created.year}-{order.id:06d}"


def colombia_datetime(order) -> datetime:
    """created_at se guarda en UTC sin zona; Colombia es UTC-5."""
    created = order.created_at or _fallback_now()
    return created - timedelta(hours=5)


def _money(value) -> str:
    return "$" + f"{int(value or 0):,}".replace(",", ".")


def _date_label(dt: datetime) -> str:
    return f"{dt.day} de {MONTHS_ES[dt.month - 1]} de {dt.year}"


def _time_label(dt: datetime) -> str:
    return f"{dt.hour:02d}:{dt.minute:02d}"


def _clean(text) -> str:
    """Deja solo caracteres que las fuentes base de FPDF (Latin-1) soportan."""
    value = str(text or "")
    replacements = {
        "\u00a0": " ",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2013": "-",
        "\u2014": "-",
        "\u2026": "...",
        "\u2022": "-",
    }
    for source, target in replacements.items():
        value = value.replace(source, target)
    return value.encode("latin-1", "ignore").decode("latin-1").strip()


def invoice_payload(order) -> dict:
    """Datos de la factura para la vista previa en el cliente."""
    created = colombia_datetime(order)
    client = order.client
    items = [
        {
            "name": _clean(item.name),
            "notes": _clean(item.notes),
            "quantity": item.quantity,
            "unit_price": item.price,
            "line_total": item.price * item.quantity,
        }
        for item in order.items
    ]
    payment_method = (order.payment_method or "efectivo").lower()
    payment_status = (order.payment_status or "simulado").lower()
    fee = int(order.delivery_fee or 0)

    return {
        "number": invoice_number(order),
        "date_label": _date_label(created),
        "time_label": _time_label(created),
        "issued_at": created.isoformat(timespec="seconds"),
        "order_code": order.code,
        "order_status": order.status,
        "payment_method": payment_method,
        "payment_method_label": PAYMENT_LABELS.get(payment_method, payment_method.title()),
        "payment_status": payment_status,
        "payment_status_label": PAYMENT_STATUS_LABELS.get(
            payment_status, payment_status.title()
        ),
        "cash_note": "Pago contra entrega" if payment_method == "efectivo" else "",
        "client": {
            "name": _clean(client.name) if client else "Cliente DomiRest",
            "email": _clean(client.email) if client else "",
            "phone": _clean(client.phone) if client else "",
            "address": _clean(order.address),
        },
        "items": items,
        "subtotal": int(order.subtotal or 0),
        "delivery_fee": fee,
        "delivery_fee_label": "Gratis" if fee == 0 else _money(fee),
        "total": int(order.total or 0),
        "currency": "COP",
        "restaurant": {
            "name": RESTAURANT_NAME,
            "tagline": RESTAURANT_TAGLINE,
            "address": RESTAURANT_ADDRESS,
            "nit": RESTAURANT_NIT,
        },
    }


class _InvoicePDF(FPDF):
    def footer(self):
        self.set_y(-19)
        self.set_draw_color(*LINE)
        self.set_line_width(0.25)
        self.line(14, self.get_y(), 196, self.get_y())
        self.set_y(-16)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*MUTED)
        self.cell(
            0,
            4,
            _clean("Gracias por pedir en Sabor & Punto"),
            align="C",
            new_x="LMARGIN",
            new_y="NEXT",
        )
        self.set_font("Helvetica", "", 6.5)
        self.cell(
            0,
            3.5,
            _clean(
                "Documento demostrativo generado por DomiRest. No es una factura "
                "electrónica ni tiene validez tributaria ante la DIAN."
            ),
            align="C",
        )


def _wrap_lines(pdf: FPDF, text: str, width: float) -> int:
    if not text:
        return 1
    return len(pdf.multi_cell(width, 4.2, text, dry_run=True, output="LINES"))


def build_invoice_pdf(order) -> bytes:
    """Devuelve los bytes del PDF A4 de la factura del pedido."""
    data = invoice_payload(order)
    client = data["client"]

    pdf = _InvoicePDF(orientation="P", unit="mm", format="A4")
    pdf.set_margins(14, 14, 14)
    pdf.set_auto_page_break(auto=True, margin=25)
    pdf.add_page()

    # ---------- Encabezado con fondo crema ----------
    pdf.set_fill_color(*CREAM)
    pdf.rect(0, 0, 210, 40, style="F")

    pdf.set_fill_color(*CORAL)
    pdf.rect(14, 12, 16, 16, style="F", round_corners=True, corner_radius=4)
    pdf.set_xy(14, 12)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(*WHITE)
    pdf.cell(16, 16, "D", align="C")

    pdf.set_xy(35, 10)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(*PLUM)
    pdf.cell(100, 7, _clean("DomiRest · Sabor & Punto"))
    pdf.set_xy(35, 17.5)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*MUTED)
    pdf.cell(120, 4, _clean(RESTAURANT_ADDRESS))
    pdf.set_xy(35, 21.8)
    pdf.cell(80, 4, _clean(f"NIT {RESTAURANT_NIT}"))

    pdf.set_xy(135, 12)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*CORAL)
    pdf.cell(61, 4, "FACTURA DE VENTA", align="R")
    pdf.set_xy(135, 17)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*PLUM)
    pdf.cell(61, 5, _clean(data["number"]), align="R")

    # ---------- Datos de la factura ----------
    pdf.set_xy(14, 49)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*CORAL)
    pdf.cell(90, 4, "DATOS DE LA FACTURA")

    pdf.set_xy(14, 54)
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(*PLUM)
    pdf.cell(90, 9, _clean(data["number"]))
    pdf.set_xy(14, 64)
    pdf.set_font("Helvetica", "", 8.5)
    pdf.set_text_color(*MUTED)
    pdf.cell(90, 5, _clean(f"Pedido {data['order_code']}"))

    meta = (
        ("Fecha", data["date_label"]),
        ("Hora", data["time_label"]),
        ("Estado de pago", data["payment_status_label"]),
        ("Método de pago", data["payment_method_label"]),
    )
    row_y = 49
    for label, value in meta:
        pdf.set_xy(116, row_y)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(*MUTED)
        pdf.cell(26, 5, _clean(label))
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(*PLUM)
        pdf.cell(54, 5, _clean(value), align="R")
        row_y += 6

    # ---------- Datos del cliente ----------
    box_y = 78
    pdf.set_fill_color(*CREAM_SOFT)
    pdf.set_draw_color(*LINE)
    pdf.set_line_width(0.3)
    pdf.rect(14, box_y, 182, 30, style="DF", round_corners=True, corner_radius=4)

    pdf.set_xy(19, box_y + 4)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*CORAL)
    pdf.cell(100, 4, "DATOS DEL CLIENTE")

    pdf.set_xy(19, box_y + 9)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*PLUM)
    pdf.cell(80, 5, _clean(client["name"]))

    contact = " · ".join(part for part in (client["email"], client["phone"]) if part)
    if contact:
        pdf.set_xy(19, box_y + 15)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(*MUTED)
        pdf.cell(170, 4, _clean(contact))

    pdf.set_xy(19, box_y + 21)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*PLUM)
    pdf.cell(170, 4, _clean(f"Entrega: {client['address']}"))

    # ---------- Tabla de ítems ----------
    pdf.set_xy(14, 116)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*CORAL)
    pdf.cell(90, 4, "DETALLE DEL PEDIDO")

    columns = (
        ("Cant.", 12, "C"),
        ("Producto", 70, "L"),
        ("Notas", 42, "L"),
        ("Unitario", 28, "R"),
        ("Total", 30, "R"),
    )
    table_x = 14
    header_y = 122

    def draw_table_header(y: float) -> float:
        pdf.set_fill_color(*PLUM)
        pdf.rect(table_x, y, 182, 8, style="F", round_corners=True, corner_radius=2)
        pdf.set_y(y)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(*WHITE)
        x = table_x
        for title, width, align in columns:
            pdf.set_xy(x, y)
            pdf.cell(width, 8, _clean(title), align=align)
            x += width
        return y + 8

    y = draw_table_header(header_y)

    for index, item in enumerate(data["items"]):
        product = _clean(item["name"])
        notes = _clean(item["notes"])
        unit = _money(item["unit_price"])
        line_total = _money(item["line_total"])

        lines = max(_wrap_lines(pdf, product, 68), _wrap_lines(pdf, notes, 40), 1)
        row_h = max(8, lines * 4.2 + 3)

        if y + row_h > 270:
            pdf.add_page()
            y = draw_table_header(20)

        if index % 2 == 0:
            pdf.set_fill_color(255, 250, 244)
            pdf.rect(table_x, y, 182, row_h, style="F")

        text_y = y + (row_h - lines * 4.2) / 2 + 0.6
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(*PLUM)
        pdf.set_xy(table_x, y + (row_h - 5) / 2)
        pdf.cell(12, 5, str(item["quantity"]), align="C")

        pdf.set_font("Helvetica", "", 8)
        pdf.set_xy(table_x + 12, text_y)
        pdf.multi_cell(70, 4.2, product or "-", align="L")

        pdf.set_text_color(*MUTED)
        pdf.set_xy(table_x + 82, text_y)
        pdf.multi_cell(42, 4.2, notes or "-", align="L")

        pdf.set_text_color(*PLUM)
        pdf.set_xy(table_x + 124, y + (row_h - 5) / 2)
        pdf.cell(28, 5, unit, align="R")
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_xy(table_x + 152, y + (row_h - 5) / 2)
        pdf.cell(30, 5, line_total, align="R")

        pdf.set_draw_color(*LINE)
        pdf.set_line_width(0.2)
        pdf.line(table_x, y + row_h, table_x + 182, y + row_h)
        y += row_h

    # ---------- Totales ----------
    y += 6
    if y > 246:
        pdf.add_page()
        y = 24

    total_x = 118
    label_w = 46
    value_w = 32

    pdf.set_xy(total_x, y)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*MUTED)
    pdf.cell(label_w, 6, "Subtotal")
    pdf.set_text_color(*PLUM)
    pdf.cell(value_w, 6, _money(data["subtotal"]), align="R", new_x="LMARGIN", new_y="NEXT")

    pdf.set_xy(total_x, y + 6)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*MUTED)
    pdf.cell(label_w, 6, "Domicilio")
    pdf.set_text_color(*PLUM)
    pdf.cell(value_w, 6, _clean(data["delivery_fee_label"]), align="R")

    pdf.set_draw_color(*LINE)
    pdf.line(total_x, y + 14, 196, y + 14)

    pdf.set_xy(total_x, y + 16)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*PLUM)
    pdf.cell(label_w, 8, "TOTAL")
    pdf.set_font("Helvetica", "B", 17)
    pdf.set_text_color(*CORAL)
    pdf.cell(value_w, 8, _money(data["total"]), align="R")

    # ---------- Pago ----------
    note_y = max(y + 30, 190)
    pdf.set_xy(14, note_y)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*CORAL)
    pdf.cell(90, 4, "PAGO")

    pdf.set_xy(14, note_y + 5)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*PLUM)
    payment_line = f"Método de pago: {data['payment_method_label']}"
    pdf.cell(170, 5, _clean(payment_line))

    if data["cash_note"]:
        pdf.set_xy(14, note_y + 10)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(*MANGO)
        pdf.cell(170, 5, _clean(data["cash_note"]))

    return bytes(pdf.output())
