/* Arranque de DomiRest: sesión, rutas, tema, carrito y PWA. */
import { api } from "./api.js";
import { icon } from "./icons.js";
import {
  addRoute,
  currentPath,
  navigate,
  refreshCartUI,
  startRouter,
} from "./router.js";
import {
  applyTheme,
  loadMenu,
  state,
  toggleTheme,
} from "./state.js";
import {
  haptic,
  initPressFeedback,
  initRipples,
  toast,
} from "./ui.js";
import { initPwa } from "./pwa.js";

import {
  loginScreen,
  onboardingScreen,
  welcomeScreen,
} from "./screens/auth.js";
import {
  checkoutScreen,
  homeScreen,
  menuScreen,
  openCartSheet,
  ordersScreen,
  paymentScreen,
  productScreen,
  trackingScreen,
} from "./screens/client.js";
import { profileScreen } from "./screens/profile.js";
import {
  adminOrdersScreen,
  adminProductsScreen,
  adminScreen,
} from "./screens/admin.js";
import {
  courierHistoryScreen,
  courierOrderScreen,
  courierScreen,
} from "./screens/courier.js";

/* ---------- Rutas ---------- */
addRoute("welcome", welcomeScreen, { public: true, name: "welcome" });
addRoute("login", loginScreen, { public: true, name: "login" });
addRoute("onboarding", onboardingScreen, { name: "onboarding" });

addRoute("home", homeScreen, { roles: ["client"], name: "home" });
addRoute("menu", menuScreen, { roles: ["client"], name: "menu" });
addRoute("product/:id", productScreen, { roles: ["client"], name: "product" });
addRoute("checkout", checkoutScreen, { roles: ["client"], name: "checkout" });
addRoute("payment", paymentScreen, { roles: ["client"], name: "payment" });
addRoute("tracking/:id", trackingScreen, { roles: ["client"], name: "tracking" });
addRoute("orders", ordersScreen, { roles: ["client"], name: "orders" });

addRoute("profile", profileScreen, { name: "profile" });

addRoute("admin", adminScreen, { roles: ["admin"], name: "admin" });
addRoute("admin/orders", adminOrdersScreen, { roles: ["admin"], name: "adminOrders" });
addRoute("admin/products", adminProductsScreen, { roles: ["admin"], name: "adminProducts" });

addRoute("courier", courierScreen, { roles: ["courier"], name: "courier" });
addRoute("courier/history", courierHistoryScreen, { roles: ["courier"], name: "courierHistory" });
addRoute("courier/order/:id", courierOrderScreen, {
  roles: ["courier"],
  name: "courierOrder",
});

/* ---------- Preferencias y chrome global ---------- */
function syncThemeControls() {
  const dark = state.theme === "dark";
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const size = button.classList.contains("glass") ? 18 : button.closest(".home-actions") ? 19 : 20;
    button.innerHTML = icon(dark ? "sun" : "moon", size);
  });
  document.querySelectorAll("[data-theme-switch]").forEach((node) => {
    node.classList.toggle("on", dark);
  });
  document.querySelectorAll('[data-action="theme"]').forEach((item) => {
    const rowIcon = item.querySelector(".mi-ico");
    if (rowIcon) rowIcon.innerHTML = icon(dark ? "moon" : "sun", 18);
    const rowSub = item.querySelector(".mi-copy span");
    if (rowSub) rowSub.textContent = dark ? "Activado" : "Desactivado";
  });
}

function bindGlobalUI() {
  document.addEventListener("click", (event) => {
    const themeButton = event.target.closest("[data-theme-toggle]");
    if (themeButton) {
      toggleTheme();
      syncThemeControls();
      haptic(5);
      return;
    }

    if (event.target.closest("#cart-fab")) {
      openCartSheet();
      return;
    }
  });

  window.addEventListener("domirest:cart", refreshCartUI);
  window.addEventListener("domirest:unauthorized", () => {
    const hadSession = Boolean(state.user);
    state.user = null;
    if (currentPath() !== "welcome") {
      navigate("welcome", { replace: true });
      if (hadSession) toast("Tu sesión expiró. Vuelve a entrar.", "warn");
    }
  });
  window.addEventListener("offline", () =>
    toast("Sin conexión. Revisa tus datos móviles.", "warn", 4200)
  );
  window.addEventListener("online", () => toast("Conexión restablecida", "ok", 1800));
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            toast("DomiRest se actualizó. Recarga para ver lo nuevo.", "info", 5000);
          }
        });
      });
    } catch (_) {
      /* La app funciona igual sin service worker. */
    }
  });
}

/* ---------- Boot ---------- */
async function boot() {
  applyTheme(state.theme);
  initRipples();
  initPressFeedback();

  try {
    const response = await api.get("/auth/me");
    state.user = response.data;
    if (state.user?.role === "client") {
      loadMenu().catch(() => {});
    }
  } catch (error) {
    state.user = null;
    if (error.status && error.status !== 401) {
      toast(error.message, "warn", 4200);
    }
  }

  bindGlobalUI();
  initPwa();
  startRouter();
  registerServiceWorker();
}

boot();
