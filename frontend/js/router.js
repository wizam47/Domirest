/* Router SPA basado en hash, con View Transitions y navegación por rol. */
import { icon } from "./icons.js";
import {
  cartCount,
  homeForRole,
  isReducedMotion,
  state,
} from "./state.js";

const routes = [];
let currentCleanup = null;
let rendering = false;
let queued = null;
let lastChromeResult = {};

const NAVS = {
  client: [
    { path: "home", label: "Inicio", icon: "home" },
    { path: "menu", label: "Menú", icon: "menu" },
    { path: "orders", label: "Pedidos", icon: "receipt" },
    { path: "profile", label: "Perfil", icon: "user" },
  ],
  admin: [
    { path: "admin", label: "Panel", icon: "grid" },
    { path: "admin/orders", label: "Comandas", icon: "kanban" },
    { path: "admin/products", label: "Menú", icon: "menu" },
    { path: "profile", label: "Perfil", icon: "user" },
  ],
  courier: [
    { path: "courier", label: "Entregas", icon: "bike" },
    { path: "courier/history", label: "Historial", icon: "clock" },
    { path: "profile", label: "Perfil", icon: "user" },
  ],
};

export function addRoute(pattern, handler, options = {}) {
  const keys = [];
  const regex = new RegExp(
    "^" +
      pattern
        .replace(/^\/|\/$/g, "")
        .replace(/:([^/]+)/g, (_, key) => {
          keys.push(key);
          return "([^/]+)";
        }) +
      "$"
  );
  routes.push({ pattern, regex, keys, handler, ...options });
}

export function currentPath() {
  const raw = location.hash.replace(/^#\/?/, "").replace(/\/+$/, "");
  return raw || "";
}

export function defaultPath() {
  if (!state.user) return "welcome";
  return homeForRole(state.user.role);
}

export function navigate(path, { replace = false } = {}) {
  const normalized = String(path).replace(/^#?\/?/, "");
  const hash = `#/${normalized}`;
  if (location.hash === hash) {
    render();
    return;
  }
  if (replace) {
    history.replaceState(null, "", hash);
    render();
  } else {
    location.hash = hash;
  }
}

export function reload() {
  render();
}

function resolve(path) {
  for (const route of routes) {
    const match = route.regex.exec(path);
    if (match) {
      const params = {};
      route.keys.forEach((key, index) => {
        params[key] = decodeURIComponent(match[index + 1]);
      });
      return { route, params };
    }
  }
  return null;
}

async function paint(result, { isFirst = false } = {}) {
  const app = document.getElementById("app");
  if (!app || !result) return;
  app.innerHTML = result.html;
  document.title = result.title
    ? `${result.title} · DomiRest`
    : "DomiRest · Sabor & Punto";
  updateChrome(result);
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  if (typeof result.mount === "function") {
    const cleanup = await result.mount(app);
    if (typeof cleanup === "function") currentCleanup = cleanup;
  }
}

export async function render() {
  if (rendering) {
    queued = true;
    return;
  }
  rendering = true;
  try {
    const path = currentPath();

    if (path === "onboarding" && state.user) {
      // permitido
    }

    const found = resolve(path);
    if (!found) {
      navigate(defaultPath(), { replace: true });
      return;
    }

    const { route, params } = found;

    // Guards de autenticación y rol
    if (!route.public && !state.user) {
      navigate("welcome", { replace: true });
      return;
    }
    if (state.user && ["welcome", "login"].includes(route.name) && !route.allowLogged) {
      navigate(homeForRole(state.user.role), { replace: true });
      return;
    }
    if (route.roles && state.user && !route.roles.includes(state.user.role)) {
      navigate(homeForRole(state.user.role), { replace: true });
      return;
    }

    if (typeof currentCleanup === "function") {
      try {
        currentCleanup();
      } catch (_) {}
      currentCleanup = null;
    }

    const result = await route.handler({ path, params, route });
    if (!result) return;

    if (isReducedMotion() || !document.startViewTransition) {
      await paint(result);
    } else {
      try {
        await document.startViewTransition(() => {
          const app = document.getElementById("app");
          if (app) app.innerHTML = result.html;
          document.title = result.title
            ? `${result.title} · DomiRest`
            : "DomiRest · Sabor & Punto";
          updateChrome(result);
          window.scrollTo({ top: 0 });
          if (typeof result.mount === "function") {
            return Promise.resolve(result.mount(app)).then((cleanup) => {
              if (typeof cleanup === "function") currentCleanup = cleanup;
            });
          }
        }).finished;
      } catch (_) {
        await paint(result);
      }
    }

    window.dispatchEvent(
      new CustomEvent("domirest:route", { detail: { name: result.name, path } })
    );
  } finally {
    rendering = false;
    if (queued) {
      queued = null;
      render();
    }
  }
}

/* ---------- Chrome: nav inferior y carrito flotante ---------- */
export function updateChrome(result = {}) {
  lastChromeResult = result;
  const nav = document.getElementById("bottom-nav");
  const fab = document.getElementById("cart-fab");
  if (!nav || !fab) return;

  const user = state.user;
  const showNav = Boolean(user) && result.nav !== false;
  const role = user?.role;
  const items = NAVS[role] || [];

  if (!showNav || items.length === 0) {
    nav.classList.add("hidden");
  } else {
    const path = currentPath();
    let activeIndex = 0;
    items.forEach((item, index) => {
      if (path === item.path) activeIndex = index;
      else if (item.path !== "admin" && path.startsWith(item.path + "/")) activeIndex = index;
    });
    nav.style.setProperty("--nav-count", items.length);
    nav.style.setProperty("--nav-i", activeIndex);
    nav.innerHTML =
      `<span class="nav-pill" aria-hidden="true"></span>` +
      items
        .map((item, index) => {
          const active = index === activeIndex;
          return `<a href="#/${item.path}" class="nav-item ${active ? "active" : ""}"
                    ${active ? 'aria-current="page"' : ""} data-nav="${item.path}">
                    ${icon(item.icon, 21)}
                    <span>${item.label}</span>
                  </a>`;
        })
        .join("");
    nav.classList.remove("hidden");
  }

  const count = cartCount();
  const showCart =
    Boolean(user) &&
    role === "client" &&
    result.cart !== false &&
    count > 0 &&
    !["checkout", "payment", "tracking", "onboarding"].includes(result.name);

  if (showCart) {
    fab.classList.remove("hidden");
    const badge = document.getElementById("cart-count");
    if (badge) {
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.style.display = "grid";
    }
  } else {
    fab.classList.add("hidden");
  }
}

export function refreshCartUI() {
  updateChrome(lastChromeResult);
}

/* Arranque del router */
export function startRouter() {
  window.addEventListener("hashchange", render);
  const initial = currentPath();
  if (!initial) {
    history.replaceState(null, "", `#/${defaultPath()}`);
  }
  render();
}
