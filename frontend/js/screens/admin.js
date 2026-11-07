/* Panel del restaurante: métricas, comandas (kanban) y gestión del menú. */
import { api } from "../api.js";
import { icon } from "../icons.js";
import {
  PAYMENT_LABEL,
  STATUS_LABEL,
  formatDateTime,
  invalidateMenu,
  money,
  shortMoney,
  state,
  timeAgo,
} from "../state.js";
import { navigate, reload } from "../router.js";
import {
  countUp,
  debounce,
  emptyState,
  escapeHtml,
  haptic,
  imgHTML,
  moneyLine,
  openSheet,
  setLoading,
  statusBadge,
  toast,
} from "../ui.js";

const ACTIVE_STATUSES = ["recibido", "preparando", "listo", "en_camino"];
const STATUS_FLOW = {
  recibido: "preparando",
  preparando: "listo",
  listo: "en_camino",
  en_camino: "entregado",
};
const NEXT_LABEL = {
  preparando: "Preparar",
  listo: "Marcar listo",
  en_camino: "Iniciar ruta",
  entregado: "Entregado",
};

function themeButton() {
  return `<button class="icon-btn" data-theme-toggle aria-label="Cambiar tema">
    ${icon(state.theme === "dark" ? "sun" : "moon", 19)}
  </button>`;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function monthLabel() {
  return new Intl.DateTimeFormat("es-CO", { month: "long" }).format(new Date());
}

function todayLabel() {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

function chartBarsHTML(daily, metric = "orders") {
  const values = daily.map((day) => (metric === "orders" ? day.orders : day.sales));
  const max = Math.max(1, ...values);
  return daily
    .map((day, index) => {
      const value = metric === "orders" ? day.orders : day.sales;
      const pct = Math.max(6, Math.round((value / max) * 100));
      return `<div class="chart-col ${index === daily.length - 1 ? "today" : ""}" style="--i:${index}">
        <div class="chart-track" style="--h:${pct}%"><div class="chart-bar"></div></div>
        <span class="chart-label">${day.label}</span>
        <span class="chart-value">${metric === "orders" ? value : shortMoney(value)}</span>
      </div>`;
    })
    .join("");
}

function kpiCard({ accent = false, iconName, value, moneyValue = false, label, trend }) {
  return `<div class="kpi ${accent ? "accent" : ""}">
    <div class="kpi-top">
      <span class="kpi-ico">${icon(iconName, 18)}</span>
      <span class="kpi-trend">${trend}</span>
    </div>
    <div>
      <div class="kpi-value" data-count="${value}" ${moneyValue ? 'data-money="1"' : ""}>0</div>
      <div class="kpi-label">${label}</div>
    </div>
  </div>`;
}

function recentOrderHTML(order) {
  const client = order.client || {};
  return `<button class="recent-order" data-order="${order.id}" style="width:100%;text-align:left">
    <span class="ro-avatar">${client.avatar_emoji || "😋"}</span>
    <span class="ro-copy">
      <b>${escapeHtml(client.name || "Cliente")}</b>
      <span>${escapeHtml(order.code)} · ${timeAgo(order.created_at)}</span>
    </span>
    ${statusBadge(order.status)}
    <span class="ro-total">${money(order.total)}</span>
  </button>`;
}

/* ---------- Acciones compartidas de comandas ---------- */
async function moveOrder(order, status, button) {
  if (status === "en_camino" && !order.courier_id) {
    toast("Asigna un domiciliario antes de iniciar la ruta", "warn");
    return null;
  }
  setLoading(button, true);
  try {
    const response = await api.post(`/orders/${order.id}/status`, { status });
    Object.assign(order, response.data);
    toast(response.message || "Estado actualizado", "ok");
    haptic(8);
    return response.data;
  } catch (error) {
    toast(error.message, "error");
    setLoading(button, false);
    return null;
  }
}

async function assignOrder(order, courierId, select) {
  if (!courierId) return null;
  select?.setAttribute("disabled", "true");
  try {
    const response = await api.post(`/orders/${order.id}/assign`, {
      courier_id: Number(courierId),
    });
    Object.assign(order, response.data);
    toast(response.message || "Domiciliario asignado", "ok");
    haptic(6);
    return response.data;
  } catch (error) {
    toast(error.message, "error");
    select?.removeAttribute("disabled");
    return null;
  }
}

function courierOptionsHTML(couriers, selectedId) {
  return `<option value="">Domiciliario…</option>${couriers
    .map(
      (courier) =>
        `<option value="${courier.id}" ${Number(selectedId) === courier.id ? "selected" : ""}>
          ${escapeHtml(courier.name)}${courier.available ? "" : " (no disponible)"}
        </option>`
    )
    .join("")}`;
}

function openOrderDetailSheet(order, couriers, onChanged) {
  if (!order.items) {
    api
      .get(`/orders/${order.id}`)
      .then((response) => openOrderDetailSheet(response.data, couriers, onChanged))
      .catch((error) => toast(error.message, "error"));
    return;
  }
  const client = order.client || {};
  const next = STATUS_FLOW[order.status];
  const finished = ["entregado", "cancelado"].includes(order.status);
  const items = order.items
    .map(
      (item) => `<div class="kdetail-item">
        <span class="qty-pill">${item.quantity}</span>
        <span class="grow">${escapeHtml(item.name)}${item.notes ? `<span class="tiny muted"> · ${escapeHtml(item.notes)}</span>` : ""}</span>
        <span class="price">${money(item.line_total)}</span>
      </div>`
    )
    .join("");

  const content = `
    <div class="sheet-head">
      <div>
        <div class="eyebrow">${icon("kanban", 12)} Detalle de comanda</div>
        <h2>${escapeHtml(order.code)}</h2>
      </div>
      <button class="icon-btn" data-kd-close aria-label="Cerrar">${icon("x", 19)}</button>
    </div>

    <div class="kdetail">
      <div class="kdetail-client">
        <span class="avatar">${client.avatar_emoji || "😋"}</span>
        <div class="kc-name">
          <b>${escapeHtml(client.name || "Cliente")}</b>
          <span>${escapeHtml(client.phone || "Sin teléfono")}</span>
        </div>
        ${statusBadge(order.status)}
      </div>

      <div class="kdetail-items">${items}</div>

      <div class="card" style="padding:12px">
        <div class="stack-8">
          ${moneyLine("Subtotal", order.subtotal)}
          ${moneyLine("Domicilio", order.delivery_fee, order.delivery_fee === 0 ? "Gratis" : money(order.delivery_fee))}
          <hr class="divider" />
          ${moneyLine("Total", order.total)}
        </div>
      </div>

      <div class="co-address">
        ${icon("mapPin", 16)}
        <span>${escapeHtml(order.address)}${order.notes ? `<br /><b>Nota:</b> ${escapeHtml(order.notes)}` : ""}</span>
      </div>

      <div class="between" style="gap:8px">
        <span class="badge badge-info">${icon("wallet", 11)} ${PAYMENT_LABEL[order.payment_method] || "Pago"}</span>
        <span class="tiny muted">${formatDateTime(order.created_at)}</span>
      </div>

      ${
        !finished
          ? `<div class="field">
              <label>Domiciliario</label>
              <div class="input">${icon("bike", 18)}
                <select id="kd-courier">${courierOptionsHTML(couriers, order.courier_id)}</select>
              </div>
            </div>`
          : ""
      }

      <div class="kdetail-actions">
        ${
          next
            ? `<button class="btn btn-primary" data-kd-advance data-next="${next}">
                ${icon("arrowRight", 17)} ${NEXT_LABEL[next]}
              </button>`
            : ""
        }
        ${
          !finished
            ? `<button class="btn btn-ghost" data-kd-cancel style="color:var(--danger)">
                ${icon("x", 16)} Cancelar pedido
              </button>`
            : ""
        }
      </div>
    </div>`;

  openSheet(content, {
    onMount(sheet, close) {
      sheet.querySelector("[data-kd-close]").addEventListener("click", close);

      const select = sheet.querySelector("#kd-courier");
      select?.addEventListener("change", async () => {
        const assigned = await assignOrder(order, select.value, select);
        if (assigned) {
          select.removeAttribute("disabled");
          onChanged?.();
        }
      });

      sheet.querySelector("[data-kd-advance]")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const moved = await moveOrder(order, button.dataset.next, button);
        if (moved) {
          close();
          onChanged?.();
        }
      });

      sheet.querySelector("[data-kd-cancel]")?.addEventListener("click", async (event) => {
        if (!window.confirm(`¿Cancelar el pedido ${order.code}? Esta acción no se puede deshacer.`)) {
          return;
        }
        const button = event.currentTarget;
        setLoading(button, true);
        try {
          const response = await api.post(`/orders/${order.id}/status`, { status: "cancelado" });
          toast(response.message || "Pedido cancelado", "info");
          close();
          onChanged?.();
        } catch (error) {
          toast(error.message, "error");
          setLoading(button, false);
        }
      });
    },
  });
}

/* ---------- Dashboard ---------- */
export async function adminScreen() {
  let stats = null;
  let recent = [];
  let couriers = [];
  try {
    const [statsResponse, recentResponse, couriersResponse] = await Promise.all([
      api.get("/admin/stats"),
      api.get("/admin/recent"),
      api.get("/admin/couriers"),
    ]);
    stats = statsResponse.data;
    recent = recentResponse.data;
    couriers = couriersResponse.data;
  } catch (error) {
    return {
      html: `<section class="screen admin-screen">${emptyState({
        emoji: "📊",
        title: "No pudimos cargar el panel",
        text: error.message,
        action: `<button class="btn btn-primary" data-retry>Reintentar</button>`,
      })}</section>`,
      nav: true,
      cart: false,
      name: "admin",
      title: "Panel",
      mount(root) {
        root.querySelector("[data-retry]")?.addEventListener("click", () => reload());
      },
    };
  }

  const statusCounts = stats.status_counts || {};
  const statusStrip = ACTIVE_STATUSES.map(
    (status) => `<button class="status-mini" data-status-link="${status}">
      <b>${statusCounts[status] || 0}</b>
      <span>${STATUS_LABEL[status]}</span>
    </button>`
  ).join("");

  const topProducts = (stats.top_products || [])
    .map(
      (product, index) => `<div class="top-item">
        <span class="top-rank">${index + 1}</span>
        <span class="top-name">${product.emoji || "🍽️"} ${escapeHtml(product.name)}</span>
        <span class="top-sold">${product.sold} vendidos</span>
      </div>`
    )
    .join("");

  const html = `
  <section class="screen admin-screen">
    <div class="admin-head">
      <div>
        <div class="eyebrow">${icon("grid", 12)} Sabor &amp; Punto</div>
        <h1>${greeting()}, Chef</h1>
        <p class="sub">${todayLabel()}</p>
      </div>
      <div class="row" style="gap:6px">
        <button class="icon-btn" data-refresh aria-label="Actualizar panel">${icon("refresh", 19)}</button>
        ${themeButton()}
      </div>
    </div>

    <div class="row" style="gap:8px;margin-bottom:13px">
      <button class="btn btn-dark btn-sm grow" data-go-orders>
        ${icon("kanban", 16)} Comandas
        <span class="badge badge-glass">${stats.active_orders}</span>
      </button>
      <button class="btn btn-soft btn-sm grow" data-go-products>${icon("menu", 16)} Menú</button>
    </div>

    <div class="kpi-grid">
      ${kpiCard({
        accent: true,
        iconName: "wallet",
        value: stats.sales_today,
        moneyValue: true,
        label: "Ventas de hoy",
        trend: `${stats.monthly_progress}% de la meta`,
      })}
      ${kpiCard({
        iconName: "receipt",
        value: stats.orders_today,
        label: "Pedidos hoy",
        trend: `${stats.delivered_today} entregados`,
      })}
      ${kpiCard({
        iconName: "trendingUp",
        value: stats.avg_ticket,
        moneyValue: true,
        label: "Ticket promedio",
        trend: `${stats.on_time_pct}% a tiempo`,
      })}
      ${kpiCard({
        iconName: "bike",
        value: stats.active_orders,
        label: "Pedidos en curso",
        trend: `${stats.avg_delivery} min prom.`,
      })}
    </div>

    <div class="goal-card">
      <div class="goal-top">
        <div>
          <h3>Meta del mes</h3>
          <p>Pedidos completados en ${monthLabel()}</p>
        </div>
        <span class="badge badge-glass">${stats.monthly_progress}%</span>
      </div>
      <div class="goal-num" style="margin-top:12px">
        ${stats.monthly_orders} <small>/ ${stats.monthly_target} pedidos</small>
      </div>
      <div class="progress"><i style="width:${stats.monthly_progress}%"></i></div>
      <div class="goal-meta">
        <span>${icon("clock", 11)} ${stats.avg_delivery} min de entrega</span>
        <span><b>${stats.satisfaction} ★</b> satisfacción</span>
      </div>
    </div>

    <div class="chart-card">
      <div class="chart-head">
        <h3>Últimos 7 días</h3>
        <div class="segmented" id="chart-toggle">
          <button class="active" data-metric="orders">Pedidos</button>
          <button data-metric="sales">Ventas</button>
        </div>
      </div>
      <div class="chart-bars" id="chart-bars">${chartBarsHTML(stats.daily, "orders")}</div>
    </div>

    <div class="status-strip">${statusStrip}</div>

    <div class="chart-card">
      <div class="chart-head">
        <h3>Más vendidos</h3>
        <button class="section-link" data-go-products>Ver menú ${icon("chevronRight", 13)}</button>
      </div>
      <div class="top-list">${topProducts || `<p class="tiny muted">Aún no hay ventas registradas.</p>`}</div>
    </div>

    <div class="chart-card">
      <div class="chart-head">
        <h3>Últimos pedidos</h3>
        <button class="section-link" data-go-orders>Ver comandas ${icon("chevronRight", 13)}</button>
      </div>
      ${
        recent.length
          ? recent.map(recentOrderHTML).join("")
          : `<p class="tiny muted">Todavía no hay pedidos.</p>`
      }
    </div>
  </section>`;

  return {
    html,
    nav: true,
    cart: false,
    name: "admin",
    title: "Panel",
    mount(root) {
      let metric = "orders";

      root.querySelectorAll("[data-count]").forEach((node) => {
        const target = Number(node.dataset.count) || 0;
        countUp(node, target, {
          format:
            node.dataset.money === "1"
              ? (value) => shortMoney(value)
              : (value) => Math.round(value).toLocaleString("es-CO"),
        });
      });

      const toggle = root.querySelector("#chart-toggle");
      toggle?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-metric]");
        if (!button) return;
        metric = button.dataset.metric;
        toggle.querySelectorAll("button").forEach((item) => {
          item.classList.toggle("active", item === button);
        });
        const bars = root.querySelector("#chart-bars");
        if (bars) bars.innerHTML = chartBarsHTML(stats.daily, metric);
        haptic(4);
      });

      root.querySelector("[data-refresh]")?.addEventListener("click", () => reload());
      root.querySelectorAll("[data-go-orders], [data-status-link]").forEach((button) => {
        button.addEventListener("click", () => navigate("admin/orders"));
      });
      root.querySelectorAll("[data-go-products]").forEach((button) => {
        button.addEventListener("click", () => navigate("admin/products"));
      });

      const openOrder = async (id) => {
        try {
          const response = await api.get(`/orders/${id}`);
          openOrderDetailSheet(response.data, couriers, () => reload());
        } catch (error) {
          toast(error.message, "error");
        }
      };
      root.querySelectorAll("[data-order]").forEach((button) => {
        button.addEventListener("click", () => openOrder(button.dataset.order));
      });

      const interval = setInterval(async () => {
        if (document.querySelector(".sheet-root.active")) return;
        try {
          const response = await api.get("/admin/stats");
          const fresh = response.data;
          root.querySelectorAll("[data-count]").forEach((node) => {
            const key = node.closest(".kpi")?.querySelector(".kpi-label")?.textContent;
            let value = null;
            if (key === "Ventas de hoy") value = fresh.sales_today;
            else if (key === "Pedidos hoy") value = fresh.orders_today;
            else if (key === "Ticket promedio") value = fresh.avg_ticket;
            else if (key === "Pedidos en curso") value = fresh.active_orders;
            if (value === null) return;
            node.textContent =
              node.dataset.money === "1"
                ? shortMoney(value)
                : Math.round(value).toLocaleString("es-CO");
          });
          root.querySelectorAll("[data-status-link]").forEach((button) => {
            const count = fresh.status_counts?.[button.dataset.statusLink] || 0;
            const node = button.querySelector("b");
            if (node) node.textContent = count;
          });
        } catch (_) {}
      }, 20000);

      return () => clearInterval(interval);
    },
  };
}

/* ---------- Comandas (kanban) ---------- */
function kanbanCardHTML(order, index, couriers) {
  const client = order.client || {};
  const summary = (order.items || [])
    .slice(0, 3)
    .map((item) => `${item.quantity}× ${item.name}`)
    .join(" · ");
  const next = STATUS_FLOW[order.status];
  const action = next
    ? `<button class="kc-advance" data-advance="${order.id}" data-next="${next}">
        ${NEXT_LABEL[next]} ${icon("arrowRight", 12)}
      </button>`
    : "";
  const select =
    order.status === "listo"
      ? `<select class="kc-courier-select" data-assign="${order.id}" aria-label="Asignar domiciliario">
          ${courierOptionsHTML(couriers, order.courier_id)}
        </select>`
      : "";

  return `<article class="kanban-card" draggable="true" data-order="${order.id}" style="--i:${index}">
    <div class="kc-top">
      <span class="kc-code">${escapeHtml(order.code)}</span>
      <button class="mini-icon" data-detail="${order.id}" aria-label="Ver detalle">${icon("eye", 14)}</button>
    </div>
    <div class="kc-client">
      <span class="avatar sm">${client.avatar_emoji || "😋"}</span>
      <span class="truncate">${escapeHtml(client.name || "Cliente")}</span>
    </div>
    <div class="kc-items">${escapeHtml(summary)}</div>
    <div class="kc-meta">
      <span class="kc-total">${money(order.total)}</span>
      <span class="kc-time">${icon("clock", 10)} ${timeAgo(order.created_at)}</span>
    </div>
    <div class="kc-actions">${select}${action}</div>
    ${
      order.courier
        ? `<div class="kc-assigned">
            <span class="avatar">${order.courier.avatar_emoji || "🛵"}</span>
            ${escapeHtml(order.courier.name)}
          </div>`
        : ""
    }
  </article>`;
}

function columnsHTML(orders, couriers) {
  return ACTIVE_STATUSES.map((status) => {
    const items = orders.filter((order) => order.status === status);
    return `<div class="kanban-col" data-status="${status}">
      <div class="kcol-head">
        <span class="kcol-dot"></span>
        <h3>${STATUS_LABEL[status]}</h3>
        <span class="kcol-count">${items.length}</span>
      </div>
      ${
        items.length
          ? items.map((order, index) => kanbanCardHTML(order, index, couriers)).join("")
          : `<div class="kcol-empty">Sin comandas</div>`
      }
    </div>`;
  }).join("");
}

export async function adminOrdersScreen() {
  let orders = [];
  let couriers = [];
  try {
    const [ordersResponse, couriersResponse] = await Promise.all([
      api.get("/admin/orders?active=1&limit=120"),
      api.get("/admin/couriers"),
    ]);
    orders = ordersResponse.data;
    couriers = couriersResponse.data;
  } catch (error) {
    return {
      html: `<section class="screen kanban-screen">${emptyState({
        emoji: "🧾",
        title: "No pudimos cargar las comandas",
        text: error.message,
        action: `<button class="btn btn-primary" data-retry>Reintentar</button>`,
      })}</section>`,
      nav: true,
      cart: false,
      name: "adminOrders",
      title: "Comandas",
      mount(root) {
        root.querySelector("[data-retry]")?.addEventListener("click", () => reload());
      },
    };
  }

  const html = `
  <section class="screen kanban-screen">
    <div class="admin-head">
      <div>
        <div class="eyebrow">${icon("kanban", 12)} Cocina en vivo</div>
        <h1>Comandas</h1>
        <p class="sub"><span id="kanban-count">${orders.length}</span> activas · se actualiza cada 12s</p>
      </div>
      <div class="row" style="gap:6px">
        <button class="icon-btn" data-refresh aria-label="Actualizar comandas">${icon("refresh", 19)}</button>
        ${themeButton()}
      </div>
    </div>
    <div class="kanban" id="kanban">${columnsHTML(orders, couriers)}</div>
  </section>`;

  return {
    html,
    nav: true,
    cart: false,
    name: "adminOrders",
    title: "Comandas",
    mount(root) {
      const board = root.querySelector("#kanban");
      const countNode = root.querySelector("#kanban-count");
      let draggingId = null;

      const findByCard = (id) => orders.find((order) => order.id === Number(id));

      const paint = () => {
        board.innerHTML = columnsHTML(orders, couriers);
        if (countNode) countNode.textContent = orders.length;
      };

      const refreshBoard = async () => {
        if (
          root.querySelector(".kanban-card.dragging") ||
          document.activeElement?.tagName === "SELECT" ||
          document.querySelector(".sheet-root.active")
        ) {
          return;
        }
        try {
          const [ordersResponse, couriersResponse] = await Promise.all([
            api.get("/admin/orders?active=1&limit=120"),
            api.get("/admin/couriers"),
          ]);
          orders = ordersResponse.data;
          couriers = couriersResponse.data;
          paint();
        } catch (_) {}
      };

      const openDetail = (order) =>
        openOrderDetailSheet(order, couriers, () => refreshBoard());

      root.querySelector("[data-refresh]")?.addEventListener("click", refreshBoard);

      root.addEventListener("click", async (event) => {
        const detail = event.target.closest("[data-detail]");
        if (detail) {
          const order = findByCard(detail.dataset.detail);
          if (order) openDetail(order);
          return;
        }

        const advance = event.target.closest("[data-advance]");
        if (advance) {
          const order = findByCard(advance.dataset.advance);
          if (!order) return;
          const moved = await moveOrder(order, advance.dataset.next, advance);
          if (moved) paint();
          return;
        }
      });

      root.addEventListener("change", async (event) => {
        const select = event.target.closest("[data-assign]");
        if (!select) return;
        const order = findByCard(select.dataset.assign);
        if (!order) return;
        const assigned = await assignOrder(order, select.value, select);
        if (assigned) paint();
      });

      root.addEventListener("dragstart", (event) => {
        const card = event.target.closest(".kanban-card");
        if (!card) return;
        draggingId = card.dataset.order;
        card.classList.add("dragging");
        event.dataTransfer?.setData("text/plain", draggingId);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });

      root.addEventListener("dragend", (event) => {
        event.target.closest(".kanban-card")?.classList.remove("dragging");
        root.querySelectorAll(".kanban-col").forEach((col) => col.classList.remove("drag-over"));
        draggingId = null;
      });

      root.addEventListener("dragover", (event) => {
        const column = event.target.closest(".kanban-col");
        if (!column || !draggingId) return;
        event.preventDefault();
        root.querySelectorAll(".kanban-col").forEach((col) => {
          col.classList.toggle("drag-over", col === column);
        });
      });

      root.addEventListener("dragleave", (event) => {
        const column = event.target.closest(".kanban-col");
        if (column && !column.contains(event.relatedTarget)) {
          column.classList.remove("drag-over");
        }
      });

      root.addEventListener("drop", async (event) => {
        const column = event.target.closest(".kanban-col");
        if (!column) return;
        event.preventDefault();
        column.classList.remove("drag-over");
        const id = event.dataTransfer?.getData("text/plain") || draggingId;
        const order = findByCard(id);
        const status = column.dataset.status;
        draggingId = null;
        if (!order || !status || order.status === status) return;
        const moved = await moveOrder(order, status, null);
        if (moved) paint();
      });

      const interval = setInterval(refreshBoard, 12000);
      return () => clearInterval(interval);
    },
  };
}

/* ---------- Productos ---------- */
function adminProductRow(product) {
  return `<div class="prod-admin-row ${product.available ? "" : "unavailable"}" data-product-row="${product.id}">
    <div class="prod-admin-thumb">${imgHTML(product.image_url, product.emoji, product.name)}</div>
    <div class="prod-admin-body">
      <b>${escapeHtml(product.name)}</b>
      <div class="pa-meta">
        <span class="pa-price">${money(product.price)}</span>
        <span class="pa-cat">· ${escapeHtml(product.category || "Sin categoría")}</span>
      </div>
      <div class="pa-meta">
        <span class="tiny muted">${product.sold} vendidos</span>
        ${product.featured ? `<span class="badge badge-coral">Top</span>` : ""}
        ${product.is_promo ? `<span class="badge badge-warn">Promo</span>` : ""}
      </div>
    </div>
    <div class="prod-admin-actions">
      <button class="switch sm ${product.available ? "on" : ""}" data-toggle="${product.id}"
        role="switch" aria-checked="${product.available}" aria-label="Disponibilidad"></button>
      <div class="row">
        <button class="mini-icon" data-edit="${product.id}" aria-label="Editar">${icon("edit", 15)}</button>
        <button class="mini-icon danger" data-del="${product.id}" aria-label="Eliminar">${icon("trash", 15)}</button>
      </div>
    </div>
  </div>`;
}

function openProductForm(product, categories, onSaved) {
  const editing = Boolean(product);
  const current = product || {
    name: "",
    description: "",
    price: "",
    old_price: "",
    category_id: categories[0]?.id || 0,
    image_url: "",
    emoji: "🍽️",
    badge: "",
    available: true,
    featured: false,
    is_promo: false,
    prep_minutes: 20,
  };

  const content = `
    <div class="sheet-head">
      <div>
        <div class="eyebrow">${icon(editing ? "edit" : "plus", 12)} ${editing ? "Editar plato" : "Nuevo plato"}</div>
        <h2>${editing ? escapeHtml(current.name) : "Agregar al menú"}</h2>
      </div>
      <button class="icon-btn" data-close-product aria-label="Cerrar">${icon("x", 19)}</button>
    </div>

    <div class="stack-12">
      <div class="row" style="gap:12px;align-items:flex-start">
        <div class="prod-admin-thumb" id="product-preview" style="width:76px;height:76px">
          ${imgHTML(current.image_url, current.emoji, current.name)}
        </div>
        <div class="grow stack-8">
          <div class="field">
            <label for="prod-name">Nombre</label>
            <div class="input"><input id="prod-name" value="${escapeHtml(current.name)}" placeholder="Ej. Bandeja paisa" maxlength="140" /></div>
          </div>
          <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:9px">
            <div class="field">
              <label for="prod-emoji">Emoji</label>
              <div class="input"><input id="prod-emoji" value="${escapeHtml(current.emoji || "🍽️")}" maxlength="8" /></div>
            </div>
            <div class="field">
              <label for="prod-category">Categoría</label>
              <div class="input">
                <select id="prod-category">
                  ${categories
                    .map(
                      (category) =>
                        `<option value="${category.id}" ${Number(current.category_id) === category.id ? "selected" : ""}>${escapeHtml(category.name)}</option>`
                    )
                    .join("")}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="field">
        <label for="prod-desc">Descripción</label>
        <div class="input"><textarea id="prod-desc" maxlength="400" placeholder="Cuéntale a tus clientes qué hace especial este plato…">${escapeHtml(current.description || "")}</textarea></div>
      </div>

      <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:9px">
        <div class="field">
          <label for="prod-price">Precio (COP)</label>
          <div class="input">${icon("tag", 17)}<input id="prod-price" inputmode="numeric" value="${current.price ?? ""}" placeholder="25000" /></div>
        </div>
        <div class="field">
          <label for="prod-old">Precio anterior</label>
          <div class="input">${icon("tag", 17)}<input id="prod-old" inputmode="numeric" value="${current.old_price ?? ""}" placeholder="Opcional" /></div>
        </div>
      </div>

      <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:9px">
        <div class="field">
          <label for="prod-prep">Preparación (min)</label>
          <div class="input">${icon("clock", 17)}<input id="prod-prep" inputmode="numeric" value="${current.prep_minutes ?? 20}" /></div>
        </div>
        <div class="field">
          <label for="prod-badge">Etiqueta</label>
          <div class="input"><input id="prod-badge" value="${escapeHtml(current.badge || "")}" placeholder="Ej. Nuevo" maxlength="40" /></div>
        </div>
      </div>

      <div class="field">
        <label for="prod-image">URL de imagen</label>
        <div class="input">${icon("image", 17)}<input id="prod-image" value="${escapeHtml(current.image_url || "")}" placeholder="https://…" maxlength="500" /></div>
      </div>

      <div class="menu-list" style="margin:0">
        <div class="menu-item" style="cursor:default">
          <span class="mi-copy"><b>Disponible</b><span>Se puede pedir ahora</span></span>
          <button class="switch ${current.available ? "on" : ""}" data-flag="available" role="switch" aria-checked="${current.available}"></button>
        </div>
        <div class="menu-item" style="cursor:default">
          <span class="mi-copy"><b>Destacado</b><span>Aparece en el home</span></span>
          <button class="switch ${current.featured ? "on" : ""}" data-flag="featured" role="switch" aria-checked="${current.featured}"></button>
        </div>
        <div class="menu-item" style="cursor:default">
          <span class="mi-copy"><b>Promoción</b><span>Se muestra en promos</span></span>
          <button class="switch ${current.is_promo ? "on" : ""}" data-flag="is_promo" role="switch" aria-checked="${current.is_promo}"></button>
        </div>
      </div>

      <button class="btn btn-primary btn-lg btn-block" id="product-save">
        ${icon("check", 18)} ${editing ? "Guardar cambios" : "Crear plato"}
      </button>
    </div>`;

  openSheet(content, {
    onMount(sheet, close) {
      const preview = sheet.querySelector("#product-preview");
      const imageInput = sheet.querySelector("#prod-image");
      const emojiInput = sheet.querySelector("#prod-emoji");
      const save = sheet.querySelector("#product-save");

      const refreshPreview = () => {
        preview.innerHTML = imgHTML(imageInput.value.trim(), emojiInput.value.trim() || "🍽️", "Vista previa");
      };

      sheet.querySelector("[data-close-product]").addEventListener("click", close);
      imageInput.addEventListener("input", debounce(refreshPreview, 250));
      emojiInput.addEventListener("input", debounce(refreshPreview, 250));

      sheet.querySelectorAll("[data-flag]").forEach((button) => {
        button.addEventListener("click", () => {
          const on = !button.classList.contains("on");
          button.classList.toggle("on", on);
          button.setAttribute("aria-checked", String(on));
          haptic(4);
        });
      });

      save.addEventListener("click", async () => {
        const name = sheet.querySelector("#prod-name").value.trim();
        const price = Number(sheet.querySelector("#prod-price").value.replace(/\D/g, ""));
        if (name.length < 3) {
          toast("Escribe el nombre del plato", "error");
          return;
        }
        if (!price) {
          toast("Ingresa un precio mayor a cero", "error");
          return;
        }
        const oldRaw = sheet.querySelector("#prod-old").value.replace(/\D/g, "");
        const data = {
          name,
          description: sheet.querySelector("#prod-desc").value.trim(),
          price,
          old_price: oldRaw ? Number(oldRaw) : null,
          category_id: Number(sheet.querySelector("#prod-category").value),
          image_url: imageInput.value.trim(),
          emoji: emojiInput.value.trim() || "🍽️",
          badge: sheet.querySelector("#prod-badge").value.trim(),
          prep_minutes: Number(sheet.querySelector("#prod-prep").value.replace(/\D/g, "")) || 20,
        };
        sheet.querySelectorAll("[data-flag]").forEach((button) => {
          data[button.dataset.flag] = button.classList.contains("on");
        });

        setLoading(save, true);
        try {
          const response = editing
            ? await api.put(`/products/${current.id}`, data)
            : await api.post("/products", data);
          invalidateMenu();
          toast(response.message || "Producto guardado", "ok");
          haptic(10);
          close();
          onSaved?.();
        } catch (error) {
          toast(error.message, "error");
          setLoading(save, false);
        }
      });
    },
  });
}

function confirmDelete(product, onDeleted) {
  const content = `
    <div class="rate-sheet">
      <div class="rate-art" style="background:var(--danger-bg);color:var(--danger)">🗑️</div>
      <h2>¿Eliminar “${escapeHtml(product.name)}”?</h2>
      <p>Si tiene pedidos históricos, se marcará como agotado para no perder las cuentas.</p>
      <button class="btn btn-danger btn-lg btn-block" data-confirm-delete>
        ${icon("trash", 18)} Sí, eliminar
      </button>
      <button class="btn btn-ghost btn-block" data-cancel-delete>Mejor no</button>
    </div>`;

  openSheet(content, {
    onMount(sheet, close) {
      const button = sheet.querySelector("[data-confirm-delete]");
      sheet.querySelector("[data-cancel-delete]").addEventListener("click", close);
      button.addEventListener("click", async () => {
        setLoading(button, true);
        try {
          const response = await api.del(`/products/${product.id}`);
          invalidateMenu();
          toast(response.message || "Producto eliminado", "ok");
          close();
          onDeleted?.();
        } catch (error) {
          toast(error.message, "error");
          setLoading(button, false);
        }
      });
    },
  });
}

export async function adminProductsScreen() {
  let products = [];
  let categories = [];
  try {
    const [productsResponse, categoriesResponse] = await Promise.all([
      api.get("/products?all=1"),
      api.get("/categories"),
    ]);
    products = productsResponse.data;
    categories = categoriesResponse.data;
  } catch (error) {
    return {
      html: `<section class="screen admin-products-screen">${emptyState({
        emoji: "🍽️",
        title: "No pudimos cargar el menú",
        text: error.message,
        action: `<button class="btn btn-primary" data-retry>Reintentar</button>`,
      })}</section>`,
      nav: true,
      cart: false,
      name: "adminProducts",
      title: "Menú",
      mount(root) {
        root.querySelector("[data-retry]")?.addEventListener("click", () => reload());
      },
    };
  }

  const html = `
  <section class="screen admin-products-screen">
    <div class="admin-head">
      <div>
        <div class="eyebrow">${icon("menu", 12)} Carta de la casa</div>
        <h1>Menú</h1>
        <p class="sub"><span id="prod-count">${products.length}</span> platos · administra precios y disponibilidad</p>
      </div>
      <div class="row" style="gap:6px">
        <button class="icon-btn" data-new-product aria-label="Agregar plato">${icon("plus", 19)}</button>
        ${themeButton()}
      </div>
    </div>

    <form class="search-bar" id="prod-search" role="search" style="margin-bottom:12px">
      ${icon("search", 19)}
      <input id="prod-search-input" type="search" placeholder="Buscar plato…" autocomplete="off" />
    </form>

    <div class="chip-row no-scrollbar" id="prod-chips" style="margin-bottom:14px">
      <button class="chip active" data-cat="todos"><span class="chip-emoji">✨</span>Todos</button>
      ${categories
        .map(
          (category) =>
            `<button class="chip" data-cat="${category.slug}"><span class="chip-emoji">${category.icon}</span>${escapeHtml(category.name)}</button>`
        )
        .join("")}
    </div>

    <div id="admin-prod-list"></div>
    <button class="page-fab" data-new-product aria-label="Agregar plato">${icon("plus", 24)}</button>
  </section>`;

  return {
    html,
    nav: true,
    cart: false,
    name: "adminProducts",
    title: "Menú",
    mount(root) {
      const list = root.querySelector("#admin-prod-list");
      const count = root.querySelector("#prod-count");
      const searchInput = root.querySelector("#prod-search-input");
      const chips = root.querySelector("#prod-chips");
      let category = "todos";
      let search = "";

      const renderList = () => {
        const term = search.trim().toLowerCase();
        const filtered = products.filter((product) => {
          const matchCategory = category === "todos" || product.category_slug === category;
          const matchSearch =
            !term ||
            product.name.toLowerCase().includes(term) ||
            (product.description || "").toLowerCase().includes(term);
          return matchCategory && matchSearch;
        });
        count.textContent = filtered.length;
        list.innerHTML = filtered.length
          ? filtered.map(adminProductRow).join("")
          : emptyState({
              emoji: "🔎",
              title: "Sin platos por aquí",
              text: "Prueba con otra búsqueda o crea un plato nuevo.",
              action: `<button class="btn btn-soft" data-reset-prod>Ver todo</button>`,
            });
      };

      const findProduct = (id) => products.find((product) => product.id === Number(id));

      root.querySelector("#prod-search").addEventListener("submit", (event) => {
        event.preventDefault();
        search = searchInput.value;
        renderList();
      });
      searchInput.addEventListener(
        "input",
        debounce(() => {
          search = searchInput.value;
          renderList();
        }, 180)
      );
      chips.addEventListener("click", (event) => {
        const chip = event.target.closest("[data-cat]");
        if (!chip) return;
        category = chip.dataset.cat;
        chips.querySelectorAll(".chip").forEach((item) => {
          item.classList.toggle("active", item === chip);
        });
        renderList();
        haptic(4);
      });

      root.addEventListener("click", async (event) => {
        if (event.target.closest("[data-reset-prod]")) {
          search = "";
          category = "todos";
          searchInput.value = "";
          chips.querySelectorAll(".chip").forEach((chip) => {
            chip.classList.toggle("active", chip.dataset.cat === "todos");
          });
          renderList();
          return;
        }

        if (event.target.closest("[data-new-product]")) {
          openProductForm(null, categories, () => reload());
          return;
        }

        const toggle = event.target.closest("[data-toggle]");
        if (toggle) {
          const product = findProduct(toggle.dataset.toggle);
          if (!product) return;
          toggle.disabled = true;
          try {
            const response = await api.patch(`/products/${product.id}/availability`, {
              available: !product.available,
            });
            product.available = response.data.available;
            invalidateMenu();
            toggle.classList.toggle("on", product.available);
            toggle.setAttribute("aria-checked", String(product.available));
            toggle.closest("[data-product-row]")?.classList.toggle("unavailable", !product.available);
            toast(
              product.available ? `${product.name} disponible` : `${product.name} agotado`,
              product.available ? "ok" : "warn"
            );
            haptic(5);
          } catch (error) {
            toast(error.message, "error");
          } finally {
            toggle.disabled = false;
          }
          return;
        }

        const edit = event.target.closest("[data-edit]");
        if (edit) {
          const product = findProduct(edit.dataset.edit);
          if (product) openProductForm(product, categories, () => reload());
          return;
        }

        const del = event.target.closest("[data-del]");
        if (del) {
          const product = findProduct(del.dataset.del);
          if (product) confirmDelete(product, () => reload());
        }
      });

      renderList();
    },
  };
}
