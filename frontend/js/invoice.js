/* Facturas: vista previa en bottom sheet y descarga del PDF. */
import { api } from "./api.js";
import { icon } from "./icons.js";
import { isIOS, isStandalone } from "./pwa.js";
import { money } from "./state.js";
import { escapeHtml, haptic, openSheet, setLoading, toast } from "./ui.js";

const LEGAL_NOTICE =
  "Documento demostrativo generado por DomiRest. No es una factura electrónica ni tiene validez tributaria ante la DIAN.";

export function invoiceNumber(order) {
  const year = order?.created_at
    ? new Date(order.created_at).getUTCFullYear()
    : new Date().getFullYear();
  const id = String(order?.id ?? 0).padStart(6, "0");
  return `FAC-${year}-${id}`;
}

function itemRowsHTML(items) {
  return items
    .map(
      (item) => `
      <div class="inv-item">
        <span class="inv-qty">${item.quantity}</span>
        <span class="inv-product">
          <b>${escapeHtml(item.name)}</b>
          ${item.notes ? `<small>${escapeHtml(item.notes)}</small>` : ""}
          <small class="inv-unit">${money(item.unit_price)} c/u</small>
        </span>
        <b class="inv-line-total">${money(item.line_total)}</b>
      </div>`
    )
    .join("");
}

function invoiceSheetHTML(data) {
  const paid = data.payment_status === "pagado";
  return `
    <div class="inv-sheet">
      <div class="inv-sheet-head">
        <div>
          <div class="eyebrow">${icon("receipt", 12)} Factura</div>
          <h2>Factura de venta</h2>
          <div class="inv-sheet-number">${escapeHtml(data.number)}</div>
        </div>
        <button class="icon-btn" type="button" data-close-invoice aria-label="Cerrar">${icon("x", 19)}</button>
      </div>

      <div class="inv-paper">
        <div class="inv-brand">
          <div class="inv-brand-mark" aria-hidden="true">D</div>
          <div class="inv-brand-copy">
            <b>DomiRest · Sabor &amp; Punto</b>
            <span>${escapeHtml(data.restaurant.address)}</span>
            <span>NIT ${escapeHtml(data.restaurant.nit)}</span>
          </div>
          <span class="inv-status ${paid ? "paid" : ""}">${escapeHtml(data.payment_status_label)}</span>
        </div>

        <div class="inv-meta">
          <div><small>Fecha</small><b>${escapeHtml(data.date_label)}</b></div>
          <div><small>Hora</small><b>${escapeHtml(data.time_label)}</b></div>
          <div><small>Pedido</small><b>${escapeHtml(data.order_code)}</b></div>
          <div><small>Pago</small><b>${escapeHtml(data.payment_method_label)}</b></div>
        </div>

        <div class="inv-client">
          <div class="inv-label">Datos del cliente</div>
          <b>${escapeHtml(data.client.name)}</b>
          <span>${escapeHtml([data.client.email, data.client.phone].filter(Boolean).join(" · "))}</span>
          <span>${escapeHtml(data.client.address)}</span>
        </div>

        <div class="inv-label">Detalle del pedido</div>
        <div class="inv-items">
          <div class="inv-items-head">
            <span>Cant.</span><span>Producto</span><span>Total</span>
          </div>
          ${itemRowsHTML(data.items)}
        </div>

        <div class="inv-totals">
          <div><span>Subtotal</span><b>${money(data.subtotal)}</b></div>
          <div><span>Domicilio</span><b>${escapeHtml(data.delivery_fee_label)}</b></div>
          <div class="inv-total"><span>Total</span><b>${money(data.total)}</b></div>
        </div>

        <div class="inv-payment">
          <span>Método de pago</span>
          <b>${escapeHtml(data.payment_method_label)}</b>
          ${data.cash_note ? `<em>${escapeHtml(data.cash_note)}</em>` : ""}
        </div>

        <p class="inv-legal">${escapeHtml(LEGAL_NOTICE)}</p>
      </div>

      <button class="btn btn-primary btn-block inv-download" type="button" data-download-invoice>
        ${icon("download", 18)} Descargar PDF
      </button>
    </div>`;
}

export async function openInvoiceSheet(order) {
  if (!order?.id) return null;
  let data;
  try {
    const response = await api.get(`/orders/${order.id}/invoice`);
    data = response.data;
  } catch (error) {
    toast(error.message, "error");
    return null;
  }

  haptic(6);
  return openSheet(invoiceSheetHTML(data), {
    className: "invoice-sheet",
    onMount(sheet, close) {
      sheet.querySelector("[data-close-invoice]")?.addEventListener("click", close);
      const button = sheet.querySelector("[data-download-invoice]");
      button?.addEventListener("click", () => downloadInvoice(order.id, button));
    },
  });
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function canShareFile(file) {
  try {
    return typeof navigator.share === "function" && Boolean(navigator.canShare?.({ files: [file] }));
  } catch (_) {
    return false;
  }
}

function filenameFrom(response, fallback) {
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match ? decodeURIComponent(match[1]) : fallback;
}

export async function downloadInvoice(orderId, button = null) {
  if (!orderId) return;
  setLoading(button, true);
  haptic(8);
  try {
    const response = await fetch(`/api/orders/${orderId}/invoice.pdf`, {
      credentials: "same-origin",
    });
    if (!response.ok) {
      let message = "No pudimos generar la factura";
      try {
        const payload = await response.json();
        if (payload?.error) message = payload.error;
      } catch (_) {}
      throw new Error(message);
    }

    const blob = await response.blob();
    const filename = filenameFrom(response, `Factura-${invoiceNumber({ id: orderId })}.pdf`);
    let file = null;
    try {
      file = new File([blob], filename, { type: "application/pdf" });
    } catch (_) {}
    const useShare = Boolean(file) && (isIOS() || isStandalone()) && canShareFile(file);

    if (useShare) {
      try {
        await navigator.share({ files: [file], title: filename });
        toast("Factura descargada", "ok");
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }

    if (isIOS() || isStandalone()) {
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, "_blank");
      if (!opened) triggerDownload(blob, filename);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else {
      triggerDownload(blob, filename);
    }
    toast("Factura descargada", "ok");
  } catch (error) {
    toast(error?.message || "No pudimos descargar la factura", "error");
  } finally {
    setLoading(button, false);
  }
}
