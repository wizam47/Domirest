/* Experiencia del domiciliario: entregas activas, detalle e historial. */
import { api } from "../api.js";
import { icon } from "../icons.js";
import {
  PAYMENT_LABEL,
  STATUS_LABEL,
  formatDateTime,
  money,
  state,
  timeAgo,
} from "../state.js";
import { createTrackingMap } from "../maps.js";
import { navigate, reload } from "../router.js";
import {
  confetti,
  emptyState,
  escapeHtml,
  haptic,
  moneyLine,
  setLoading,
  statusBadge,
  toast,
} from "../ui.js";

const ACTION_BY_STATUS = {
  listo: { next: "en_camino", label: "Iniciar ruta", icon: "bike" },
  en_camino: { next: "entregado", label: "Confirmar entrega", icon: "checkCircle" },
};

function themeButton(glass = false) {
  return `<button class="icon-btn ${glass ? "glass" : ""}" data-theme-toggle aria-label="Cambiar tema">
    ${icon(state.theme === "dark" ? "sun" : "moon", glass ? 18 : 19)}
  </button>`;
}

function todayLabel() {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

function courierOrderHTML(order, index) {
  const client = order.client || {};
  const action = ACTION_BY_STATUS[order.status];
  return `<article class="courier-order" style="--i:${index}">
    <div class="co-top">
      <div class="co-client">
        <span class="avatar">${client.avatar_emoji || "😋"}</span>
        <div>
          <b>${escapeHtml(client.name || "Cliente")}</b>
          <span>${escapeHtml(order.code)} · ${timeAgo(order.created_at)}</span>
        </div>
      </div>
      ${statusBadge(order.status)}
    </div>

    <div class="co-address">
      ${icon("mapPin", 16)}
      <span>${escapeHtml(order.address)}${order.notes ? `<br /><b>Nota:</b> ${escapeHtml(order.notes)}` : ""}</span>
    </div>

    <div class="between">
      <span class="badge badge-info">${icon("wallet", 11)} ${PAYMENT_LABEL[order.payment_method] || "Pago"}</span>
      <span class="kc-total">${money(order.total)}</span>
    </div>

    <div class="co-actions" style="${action ? "" : "grid-template-columns:1fr"}">
      <button class="btn btn-ghost btn-sm" data-view="${order.id}">
        ${icon("mapPin", 15)} Detalle
      </button>
      ${
        action
          ? `<button class="btn btn-primary btn-sm" data-advance="${order.id}" data-next="${action.next}">
              ${icon(action.icon, 15)} ${action.label}
            </button>`
          : `<span class="btn btn-soft btn-sm" style="pointer-events:none">
              ${icon("chef", 15)} En cocina
            </span>`
      }
    </div>
  </article>`;
}

function statsHTML(summary) {
  return `
    <div class="courier-stat"><b>${summary.active}</b><span>Entregas activas</span></div>
    <div class="courier-stat"><b>${summary.delivered_today}</b><span>Completadas hoy</span></div>
    <div class="courier-stat"><b>${money(summary.earnings_today)}</b><span>Ganado hoy</span></div>`;
}

export async function courierScreen() {
  let summary = null;
  try {
    const response = await api.get("/courier/summary");
    summary = response.data;
  } catch (error) {
    return {
      html: `<section class="screen courier-screen">${emptyState({
        emoji: "🛵",
        title: "No pudimos cargar tus entregas",
        text: error.message,
        action: `<button class="btn btn-primary" data-retry>Reintentar</button>`,
      })}</section>`,
      nav: true,
      cart: false,
      name: "courier",
      title: "Entregas",
      mount(root) {
        root.querySelector("[data-retry]")?.addEventListener("click", () => reload());
      },
    };
  }

  const user = state.user;
  const firstName = user?.name?.split(" ")[0] || "parcero";

  const html = `
  <section class="screen courier-screen">
    <div class="courier-hero">
      <div class="ch-top">
        <div>
          <div class="eyebrow" style="color:rgba(255,255,255,.55)">${icon("bike", 12)} Domiciliario</div>
          <h1>Hola, ${escapeHtml(firstName)}</h1>
          <p>${todayLabel()}</p>
        </div>
        ${themeButton(true)}
      </div>

      <div class="ch-availability">
        <button class="switch ${summary.available ? "on" : ""}" id="courier-available"
          role="switch" aria-checked="${summary.available}" aria-label="Disponibilidad"></button>
        <span id="courier-available-label">${summary.available ? "Disponible para entregas" : "Sin disponibilidad"}</span>
      </div>

      <div class="courier-stats" id="courier-stats">${statsHTML(summary)}</div>
    </div>

    <div class="section-head" style="margin-bottom:10px">
      <h2 class="section-title">Entregas activas</h2>
      <button class="section-link" data-refresh>${icon("refresh", 13)} Actualizar</button>
    </div>

    <div id="courier-orders"></div>
  </section>`;

  return {
    html,
    nav: true,
    cart: false,
    name: "courier",
    title: "Entregas",
    mount(root) {
      let current = summary;
      const list = root.querySelector("#courier-orders");
      const stats = root.querySelector("#courier-stats");
      const availability = root.querySelector("#courier-available");
      const availabilityLabel = root.querySelector("#courier-available-label");

      const paintOrders = () => {
        if (!current.orders.length) {
          list.innerHTML = `<div class="courier-empty">${emptyState({
            emoji: "🌤️",
            title: "No tienes entregas activas",
            text: current.available
              ? "Cuando el restaurante te asigne una comanda, aparecerá aquí al instante."
              : "Activa tu disponibilidad para recibir entregas.",
          })}</div>`;
          return;
        }
        list.innerHTML = `<div class="stagger">${current.orders
          .map((order, index) => courierOrderHTML(order, index))
          .join("")}</div>`;
      };

      const paint = () => {
        stats.innerHTML = statsHTML(current);
        availability.classList.toggle("on", current.available);
        availability.setAttribute("aria-checked", String(current.available));
        availabilityLabel.textContent = current.available
          ? "Disponible para entregas"
          : "Sin disponibilidad";
        paintOrders();
      };

      const refresh = async (quiet = true) => {
        if (document.activeElement?.tagName === "SELECT") return;
        try {
          const response = await api.get("/courier/summary");
          current = response.data;
          paint();
        } catch (error) {
          if (!quiet) toast(error.message, "error");
        }
      };

      root.querySelector("[data-refresh]")?.addEventListener("click", () => {
        toast("Actualizando entregas…", "info", 1200);
        refresh(false);
      });

      availability.addEventListener("click", async () => {
        availability.disabled = true;
        try {
          const response = await api.patch("/auth/me", { available: !current.available });
          state.user = response.data;
          current.available = response.data.available;
          paint();
          toast(
            current.available ? "Disponibilidad activada" : "Quedaste sin disponibilidad",
            current.available ? "ok" : "warn"
          );
          if (!current.available && current.active) {
            toast("Aún tienes entregas activas. Termínalas antes de desconectarte.", "warn", 4200);
          }
          haptic(8);
        } catch (error) {
          toast(error.message, "error");
        } finally {
          availability.disabled = false;
        }
      });

      root.addEventListener("click", async (event) => {
        const view = event.target.closest("[data-view]");
        if (view) {
          navigate(`courier/order/${view.dataset.view}`);
          return;
        }

        const advance = event.target.closest("[data-advance]");
        if (!advance) return;
        const order = current.orders.find((item) => item.id === Number(advance.dataset.advance));
        if (!order) return;
        const next = advance.dataset.next;
        setLoading(advance, true);
        try {
          const response = await api.post(`/orders/${order.id}/status`, { status: next });
          toast(
            next === "entregado" ? "¡Entrega completada! Buen trabajo." : "Ruta iniciada",
            "ok"
          );
          haptic([10, 30, 10]);
          if (next === "entregado") confetti(28);
          await refresh(false);
        } catch (error) {
          toast(error.message, "error");
          setLoading(advance, false);
        }
      });

      paintOrders();
      const interval = setInterval(() => refresh(true), 12000);
      return () => clearInterval(interval);
    },
  };
}

export async function courierOrderScreen({ params }) {
  let order;
  try {
    const response = await api.get(`/orders/${params.id}`);
    order = response.data;
  } catch (error) {
    toast(error.message, "error");
    navigate("courier");
    return null;
  }

  const client = order.client || {};
  const action = ACTION_BY_STATUS[order.status];
  const items = order.items
    .map(
      (item) => `<div class="kdetail-item">
        <span class="qty-pill">${item.quantity}</span>
        <span class="grow">${escapeHtml(item.name)}</span>
        <span class="price">${money(item.line_total)}</span>
      </div>`
    )
    .join("");

  const html = `
  <section class="screen screen--no-nav courier-screen" style="padding-bottom:140px">
    <div class="top-bar">
      <button class="back-btn" data-back aria-label="Volver">${icon("chevronLeft", 21)}</button>
      <div class="grow" style="margin-left:4px">
        <h1 style="font-size:20px">${escapeHtml(order.code)}</h1>
        <div class="sub">${STATUS_LABEL[order.status] || order.status} · ${timeAgo(order.created_at)}</div>
      </div>
      ${statusBadge(order.status)}
    </div>

    <div class="map-shell courier-detail-map" id="courier-map">
      <div class="map-fallback">Cargando ruta…</div>
    </div>

    <div class="card" style="padding:14px;margin-bottom:12px">
      <div class="kdetail-client">
        <span class="avatar">${client.avatar_emoji || "😋"}</span>
        <div class="kc-name">
          <b>${escapeHtml(client.name || "Cliente")}</b>
          <span>${escapeHtml(client.phone || "Sin teléfono")}</span>
        </div>
        ${
          client.phone
            ? `<a class="icon-btn" href="tel:${escapeHtml(client.phone)}" aria-label="Llamar al cliente">${icon("phone", 18)}</a>`
            : ""
        }
      </div>

      <div class="co-address" style="margin-top:11px">
        ${icon("mapPin", 16)}
        <span>${escapeHtml(order.address)}${order.notes ? `<br /><b>Nota:</b> ${escapeHtml(order.notes)}` : ""}</span>
      </div>

      <div class="kdetail-items" style="margin-top:12px">${items}</div>

      <div class="stack-8" style="margin-top:12px">
        ${moneyLine("Subtotal", order.subtotal)}
        ${moneyLine("Domicilio", order.delivery_fee, order.delivery_fee === 0 ? "Gratis" : money(order.delivery_fee))}
        <hr class="divider" />
        ${moneyLine("Total", order.total)}
      </div>

      <div class="between" style="margin-top:10px">
        <span class="badge badge-info">${icon("wallet", 11)} ${PAYMENT_LABEL[order.payment_method] || "Pago"}</span>
        <span class="tiny muted">${formatDateTime(order.created_at)}</span>
      </div>
    </div>
  </section>

  <div class="courier-detail-actions">
    <button class="btn btn-ghost" data-back>
      ${icon("arrowLeft", 18)} Volver
    </button>
    ${
      action
        ? `<button class="btn btn-primary" data-advance data-next="${action.next}">
            ${icon(action.icon, 19)} ${action.label}
          </button>`
        : `<a class="btn btn-soft" href="tel:${escapeHtml(client.phone || "")}">
            ${icon("phone", 18)} Llamar
          </a>`
    }
  </div>`;

  return {
    html,
    nav: false,
    cart: false,
    name: "courierOrder",
    title: order.code,
    mount(root) {
      let mapCtx = null;
      setTimeout(() => {
        const mapEl = root.querySelector("#courier-map");
        if (!mapEl || !document.body.contains(mapEl)) return;
        mapCtx = createTrackingMap(mapEl, order);
      }, 80);

      root.querySelectorAll("[data-back]").forEach((button) => {
        button.addEventListener("click", () => navigate("courier"));
      });

      const advance = root.querySelector("[data-advance]");
      advance?.addEventListener("click", async () => {
        setLoading(advance, true);
        try {
          const response = await api.post(`/orders/${order.id}/status`, {
            status: advance.dataset.next,
          });
          toast(
            advance.dataset.next === "entregado"
              ? "¡Entrega completada! Buen trabajo."
              : "Ruta iniciada",
            "ok"
          );
          haptic([10, 30, 10]);
          if (advance.dataset.next === "entregado") confetti(30);
          navigate("courier");
        } catch (error) {
          toast(error.message, "error");
          setLoading(advance, false);
        }
      });

      return () => mapCtx?.destroy?.();
    },
  };
}

export async function courierHistoryScreen() {
  let orders = [];
  try {
    const response = await api.get("/orders?limit=100");
    orders = response.data.filter((order) => ["entregado", "cancelado"].includes(order.status));
  } catch (error) {
    toast(error.message, "error");
  }

  const delivered = orders.filter((order) => order.status === "entregado");
  const earnings = delivered.reduce((sum, order) => sum + order.delivery_fee, 0);

  const html = `
  <section class="screen courier-screen">
    <div class="admin-head">
      <div>
        <div class="eyebrow">${icon("clock", 12)} Tus entregas</div>
        <h1>Historial</h1>
        <p class="sub">${delivered.length} entregas completadas</p>
      </div>
      ${themeButton()}
    </div>

    <div class="card" style="display:flex;gap:12px;align-items:center;margin-bottom:14px">
      <span class="avatar lg" style="background:var(--success-bg);color:var(--success)">${icon("wallet", 28)}</span>
      <div class="grow">
        <span class="tiny muted">Ganado por domicilios</span>
        <b style="display:block;font-family:var(--font-display);font-size:26px;color:var(--heading);letter-spacing:-.04em">
          ${money(earnings)}
        </b>
      </div>
      <span class="badge badge-mint">${icon("checkCircle", 11)} ${delivered.length} entregas</span>
    </div>

    <div class="section-head" style="margin-bottom:10px">
      <h2 class="section-title">Completadas y canceladas</h2>
      <button class="section-link" data-back-courier>Volver ${icon("chevronRight", 13)}</button>
    </div>

    ${
      orders.length
        ? orders
            .map(
              (order, index) => `<button class="courier-history-item" data-view="${order.id}" style="width:100%;text-align:left;--i:${index}">
                <span class="avatar sm">${order.client?.avatar_emoji || "😋"}</span>
                <span class="chi-copy">
                  <b>${escapeHtml(order.code)} · ${escapeHtml(order.client?.name || "Cliente")}</b>
                  <span>${formatDateTime(order.delivered_at || order.created_at)} · ${escapeHtml(order.address)}</span>
                </span>
                ${
                  order.status === "entregado"
                    ? `<span class="chi-amount">+${money(order.delivery_fee)}</span>`
                    : statusBadge(order.status)
                }
              </button>`
            )
            .join("")
        : `<div class="courier-empty">${emptyState({
            emoji: "📦",
            title: "Aún no tienes entregas",
            text: "Tus entregas completadas aparecerán aquí con lo que ganaste.",
            action: `<button class="btn btn-primary" data-back-courier>${icon("bike", 18)} Ver entregas activas</button>`,
          })}</div>`
    }
  </section>`;

  return {
    html,
    nav: true,
    cart: false,
    name: "courierHistory",
    title: "Historial",
    mount(root) {
      root.querySelectorAll("[data-back-courier]").forEach((button) => {
        button.addEventListener("click", () => navigate("courier"));
      });
      root.querySelectorAll("[data-view]").forEach((button) => {
        button.addEventListener("click", () => navigate(`courier/order/${button.dataset.view}`));
      });
    },
  };
}
