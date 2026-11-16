/* Perfil compartido para clientes, administradores y domiciliarios. */
import { api } from "../api.js";
import { icon } from "../icons.js";
import {
  ROLE_LABEL,
  addToCart,
  clearCart,
  loadMenu,
  money,
  state,
  toggleTheme,
} from "../state.js";
import { navigate, refreshCartUI, reload } from "../router.js";
import {
  emptyState,
  escapeHtml,
  haptic,
  imgHTML,
  openSheet,
  setLoading,
  toast,
} from "../ui.js";
import {
  installApp,
  installBannerHTML,
  isStandalone,
  openShareSheet,
  shareApp,
} from "../pwa.js";
import { loginDemo } from "./auth.js";

const AVATARS = ["😋", "🦊", "🐼", "🦁", "👩‍🍳", "🧑‍🌾", "🛵", "⭐", "🌮", "🍔"];

function themeButton() {
  return `<button class="icon-btn" data-theme-toggle aria-label="Cambiar tema">
    ${icon(state.theme === "dark" ? "sun" : "moon", 20)}
  </button>`;
}

function menuItem(action, iconName, title, sub = "", end = "") {
  return `<button class="menu-item" data-action="${action}">
    <span class="mi-ico">${icon(iconName, 18)}</span>
    <span class="mi-copy">
      <b>${escapeHtml(title)}</b>
      ${sub ? `<span>${escapeHtml(sub)}</span>` : ""}
    </span>
    <span class="mi-end">${end || icon("chevronRight", 16)}</span>
  </button>`;
}

async function profileStats(user) {
  try {
    if (user.role === "client") {
      const response = await api.get("/orders?limit=100");
      const orders = response.data;
      const delivered = orders.filter((order) => order.status === "entregado");
      const spent = delivered.reduce((sum, order) => sum + order.total, 0);
      return [
        { value: String(orders.length), label: "Pedidos" },
        { value: money(spent), label: "En Sabor & Punto" },
        { value: String(state.favorites.length), label: "Favoritos" },
      ];
    }
    if (user.role === "admin") {
      const response = await api.get("/admin/stats");
      const stats = response.data;
      return [
        { value: String(stats.orders_today), label: "Pedidos hoy" },
        { value: String(stats.active_orders), label: "En curso" },
        { value: `${stats.satisfaction} ★`, label: "Satisfacción" },
      ];
    }
    const response = await api.get("/courier/summary");
    const summary = response.data;
    return [
      { value: String(summary.active), label: "Entregas activas" },
      { value: String(summary.delivered_today), label: "Entregadas hoy" },
      { value: money(summary.earnings_today), label: "Ganado hoy" },
    ];
  } catch (_) {
    return [
      { value: "—", label: "Pedidos" },
      { value: "—", label: "Actividad" },
      { value: "—", label: "Favoritos" },
    ];
  }
}

function openEditSheet() {
  const user = state.user;
  let avatar = user.avatar_emoji || "😋";

  const content = `
    <div class="sheet-head">
      <div>
        <div class="eyebrow">${icon("user", 12)} Mi cuenta</div>
        <h2>Mis datos</h2>
      </div>
      <button class="icon-btn" data-close-edit aria-label="Cerrar">${icon("x", 19)}</button>
    </div>

    <div class="stack-12">
      <div class="field">
        <span class="field-label">Elige tu avatar</span>
        <div class="row wrap-gap" id="avatar-picker">
          ${AVATARS.map(
            (emoji) =>
              `<button class="avatar ${emoji === avatar ? "ring" : ""}" data-avatar="${emoji}"
                 style="cursor:pointer" aria-label="Avatar ${emoji}">${emoji}</button>`
          ).join("")}
        </div>
      </div>

      <div class="field">
        <label for="pf-name">Nombre completo</label>
        <div class="input">${icon("user", 18)}<input id="pf-name" value="${escapeHtml(user.name)}" maxlength="120" /></div>
      </div>

      <div class="field">
        <label for="pf-email">Correo</label>
        <div class="input" style="opacity:.65">${icon("mail", 18)}<input id="pf-email" value="${escapeHtml(user.email)}" readonly /></div>
      </div>

      <div class="field">
        <label for="pf-phone">Teléfono</label>
        <div class="input">${icon("phoneDevice", 18)}<input id="pf-phone" inputmode="tel" value="${escapeHtml(user.phone || "")}" placeholder="300 000 0000" maxlength="40" /></div>
      </div>

      <div class="field">
        <label for="pf-address">Dirección de entrega</label>
        <div class="input">${icon("mapPin", 18)}<input id="pf-address" value="${escapeHtml(user.address || "")}" placeholder="Barrio, calle y número" maxlength="255" /></div>
      </div>

      <button class="btn btn-primary btn-lg btn-block" id="pf-save">
        ${icon("check", 18)} Guardar cambios
      </button>
    </div>`;

  openSheet(content, {
    onMount(sheet, close) {
      const save = sheet.querySelector("#pf-save");
      const picker = sheet.querySelector("#avatar-picker");

      sheet.querySelector("[data-close-edit]").addEventListener("click", close);

      picker.addEventListener("click", (event) => {
        const button = event.target.closest("[data-avatar]");
        if (!button) return;
        avatar = button.dataset.avatar;
        picker.querySelectorAll("[data-avatar]").forEach((item) => {
          item.classList.toggle("ring", item === button);
        });
        haptic(5);
      });

      save.addEventListener("click", async () => {
        const name = sheet.querySelector("#pf-name").value.trim();
        if (name.length < 3) {
          toast("Escribe tu nombre completo", "error");
          return;
        }
        setLoading(save, true);
        try {
          const response = await api.patch("/auth/me", {
            name,
            phone: sheet.querySelector("#pf-phone").value.trim(),
            address: sheet.querySelector("#pf-address").value.trim(),
            avatar_emoji: avatar,
          });
          state.user = response.data;
          toast("Perfil actualizado", "ok");
          haptic(10);
          close();
          reload();
        } catch (error) {
          toast(error.message, "error");
          setLoading(save, false);
        }
      });
    },
  });
}

async function openFavoritesSheet() {
  await loadMenu().catch(() => {});
  const favorites = state.products.filter((product) => state.favorites.includes(product.id));

  const content = favorites.length
    ? `
      <div class="sheet-head">
        <div>
          <div class="eyebrow">${icon("heart", 12)} Guardados</div>
          <h2>Tus favoritos</h2>
        </div>
        <button class="icon-btn" data-close-fav aria-label="Cerrar">${icon("x", 19)}</button>
      </div>
      <div class="stagger">
        ${favorites
          .map(
            (product, index) => `
          <article class="product-row" data-product="${product.id}" role="button" tabindex="0" style="--i:${index}">
            <div class="pr-img">${imgHTML(product.image_url, product.emoji, product.name)}</div>
            <div class="pr-body">
              <div class="pr-name">${escapeHtml(product.name)}</div>
              <div class="pr-desc">${escapeHtml(product.description)}</div>
              <div class="pr-bottom"><span class="p-price">${money(product.price)}</span>
                <span class="p-rating">${icon("star", 10)} ${product.rating}</span></div>
            </div>
            <button class="p-add" data-add-fav="${product.id}" aria-label="Agregar ${escapeHtml(product.name)}">
              ${icon("plus", 17)}
            </button>
          </article>`
          )
          .join("")}
      </div>`
    : `
      <div class="sheet-head">
        <div><h2>Tus favoritos</h2></div>
        <button class="icon-btn" data-close-fav aria-label="Cerrar">${icon("x", 19)}</button>
      </div>
      ${emptyState({
        emoji: "💛",
        title: "Aún no tienes favoritos",
        text: "Toca el corazón de tus platos preferidos y vuelve a pedirlos en segundos.",
        action: `<button class="btn btn-primary" data-browse-fav>${icon("menu", 18)} Explorar menú</button>`,
      })}`;

  openSheet(content, {
    onMount(sheet, close) {
      sheet.addEventListener("click", (event) => {
        if (event.target.closest("[data-close-fav]")) {
          close();
          return;
        }
        if (event.target.closest("[data-browse-fav]")) {
          close();
          navigate("menu");
          return;
        }
        const add = event.target.closest("[data-add-fav]");
        if (add) {
          const product = state.products.find(
            (item) => item.id === Number(add.dataset.addFav)
          );
          if (!product) return;
          addToCart(product, 1);
          refreshCartUI();
          haptic(8);
          toast(`${product.name} agregado`, "ok", 1600);
          return;
        }
        const row = event.target.closest("[data-product]");
        if (row) {
          close();
          navigate(`product/${row.dataset.product}`);
        }
      });
    },
  });
}

function openRoleSheet() {
  const content = `
    <div class="sheet-head">
      <div>
        <div class="eyebrow">${icon("sparkles", 12)} Modo demo</div>
        <h2>Cambiar de rol</h2>
      </div>
      <button class="icon-btn" data-close-role aria-label="Cerrar">${icon("x", 19)}</button>
    </div>
    <p class="tiny muted" style="margin:-4px 0 12px">
      Salta entre las tres experiencias de DomiRest sin escribir contraseñas.
    </p>
    <div class="menu-list">
      ${[
        { role: "client", emoji: "😋", sub: "Pide y sigue tu domicilio" },
        { role: "admin", emoji: "👨‍🍳", sub: "Comandas, métricas y menú" },
        { role: "courier", emoji: "🛵", sub: "Rutas y entregas" },
      ]
        .map(
          (item) => `
        <button class="menu-item" data-demo-role="${item.role}">
          <span class="mi-ico" style="background:var(--surface-2);font-size:17px">${item.emoji}</span>
          <span class="mi-copy"><b>${ROLE_LABEL[item.role]}</b><span>${item.sub}</span></span>
          <span class="mi-end">
            ${state.user.role === item.role ? `<span class="badge badge-mint">Actual</span>` : icon("arrowRight", 15)}
          </span>
        </button>`
        )
        .join("")}
    </div>`;

  openSheet(content, {
    onMount(sheet, close) {
      sheet.querySelector("[data-close-role]").addEventListener("click", close);
      sheet.querySelectorAll("[data-demo-role]").forEach((button) => {
        button.addEventListener("click", async () => {
          const role = button.dataset.demoRole;
          if (role === state.user.role) {
            close();
            return;
          }
          if (button.dataset.busy) return;
          button.dataset.busy = "1";
          close();
          try {
            await loginDemo(role);
          } catch (error) {
            toast(error.message, "error");
          }
        });
      });
    },
  });
}

export async function profileScreen() {
  const user = state.user;
  if (!user) {
    navigate("welcome");
    return null;
  }

  const stats = await profileStats(user);
  const isClient = user.role === "client";
  const isAdmin = user.role === "admin";
  const isCourier = user.role === "courier";

  const html = `
  <section class="screen profile-screen">
    <div class="top-bar" style="margin-bottom:13px">
      <div>
        <div class="eyebrow">${icon("user", 12)} Mi cuenta</div>
        <h1 class="page-title" style="margin-top:6px">Perfil</h1>
      </div>
      ${themeButton()}
    </div>

    <div class="profile-hero">
      <div class="profile-top">
        <div class="profile-avatar">${user.avatar_emoji || "😋"}</div>
        <div>
          <h1>${escapeHtml(user.name)}</h1>
          <p>${escapeHtml(user.email)}</p>
          <span class="profile-role">${icon("sparkles", 10)} ${ROLE_LABEL[user.role]}</span>
        </div>
      </div>
      <div class="profile-stats">
        ${stats
          .map(
            (item) =>
              `<div class="profile-stat"><b>${escapeHtml(item.value)}</b><span>${escapeHtml(item.label)}</span></div>`
          )
          .join("")}
      </div>
    </div>

    ${installBannerHTML()}

    <div class="menu-list">
      ${menuItem("edit", "user", "Mis datos", user.phone || "Agrega tu teléfono")}
      ${menuItem(
        "edit",
        "mapPin",
        "Dirección de entrega",
        user.address || "Aún no tienes dirección guardada"
      )}
      ${
        isClient
          ? menuItem(
              "favorites",
              "heart",
              "Mis favoritos",
              `${state.favorites.length} plato${state.favorites.length === 1 ? "" : "s"} guardado${state.favorites.length === 1 ? "" : "s"}`,
              `<span class="badge">${state.favorites.length}</span>`
            ) +
            menuItem("orders", "receipt", "Mis pedidos", "Historial y seguimiento en vivo") +
            menuItem("menu", "menu", "Explorar menú", "Los antojos de Sabor & Punto")
          : ""
      }
      ${
        isAdmin
          ? menuItem("admin", "grid", "Panel del restaurante", "Ventas, tiempos y satisfacción") +
            menuItem("admin-orders", "kanban", "Comandas", "Tablero de cocina y entregas") +
            menuItem("admin-products", "menu", "Gestionar menú", "Precios, disponibilidad y promos")
          : ""
      }
      ${
        isCourier
          ? menuItem("courier", "bike", "Mis entregas", "Rutas activas y disponibilidad") +
            menuItem("courier-history", "clock", "Historial", "Entregas completadas")
          : ""
      }
      ${menuItem(
        "theme",
        state.theme === "dark" ? "moon" : "sun",
        "Modo oscuro",
        state.theme === "dark" ? "Activado" : "Desactivado",
        `<span class="switch sm ${state.theme === "dark" ? "on" : ""}" data-theme-switch aria-hidden="true"></span>`
      )}
      ${menuItem(
        "demo",
        "sparkles",
        "Cambiar de rol",
        "Acceso rápido para la demo",
        `<span class="badge badge-coral">${ROLE_LABEL[user.role]}</span>`
      )}
      ${!isStandalone() ? menuItem("install", "download", "Instalar app", "Acceso directo y pantalla completa") : ""}
      ${menuItem("share", "share", "Compartir app", "Envía el enlace a otro celular")}
      ${menuItem("qr", "qr", "Código QR", "Escanea la demo desde otro dispositivo")}
    </div>

    <button class="logout-btn" data-logout>
      ${icon("logout", 18)} Cerrar sesión
    </button>
    <p class="app-version">DomiRest 1.0 · Sabor &amp; Punto · Montería, Córdoba</p>
  </section>`;

  return {
    html,
    nav: true,
    cart: false,
    name: "profile",
    title: "Perfil",
    mount(root) {
      root.addEventListener("click", async (event) => {
        const logout = event.target.closest("[data-logout]");
        if (logout) {
          if (logout.dataset.busy) return;
          logout.dataset.busy = "1";
          setLoading(logout, true);
          try {
            await api.post("/auth/logout", {});
          } catch (_) {}
          state.user = null;
          clearCart();
          refreshCartUI();
          toast("Sesión cerrada", "info");
          navigate("welcome");
          return;
        }

        const action = event.target.closest("[data-action]");
        if (!action) return;
        const kind = action.dataset.action;

        if (kind === "edit") {
          openEditSheet();
          return;
        }
        if (kind === "favorites") {
          openFavoritesSheet();
          return;
        }
        if (kind === "theme") {
          toggleTheme();
          root.querySelectorAll("[data-theme-toggle]").forEach((button) => {
            button.innerHTML = icon(state.theme === "dark" ? "sun" : "moon", 20);
          });
          root.querySelectorAll("[data-theme-switch]").forEach((node) => {
            node.classList.toggle("on", state.theme === "dark");
          });
          const themeItem = root.querySelector('[data-action="theme"]');
          if (themeItem) {
            const rowIcon = themeItem.querySelector(".mi-ico");
            if (rowIcon) rowIcon.innerHTML = icon(state.theme === "dark" ? "moon" : "sun", 18);
            const rowSub = themeItem.querySelector(".mi-copy span");
            if (rowSub) rowSub.textContent = state.theme === "dark" ? "Activado" : "Desactivado";
          }
          haptic(5);
          return;
        }
        if (kind === "demo") {
          openRoleSheet();
          return;
        }
        if (kind === "install") {
          installApp();
          return;
        }
        if (kind === "share") {
          shareApp();
          return;
        }
        if (kind === "qr") {
          openShareSheet();
          return;
        }
        if (kind === "orders") navigate("orders");
        else if (kind === "menu") navigate("menu");
        else if (kind === "admin") navigate("admin");
        else if (kind === "admin-orders") navigate("admin/orders");
        else if (kind === "admin-products") navigate("admin/products");
        else if (kind === "courier") navigate("courier");
        else if (kind === "courier-history") navigate("courier/history");
      });

      root.querySelector("[data-theme-switch]")?.addEventListener("click", (event) => {
        event.stopPropagation();
      });
    },
  };
}
