/* Estado global del cliente: usuario, carrito, menú y preferencias. */
import { api } from "./api.js";

const CART_KEY = "domirest_cart";
const THEME_KEY = "domirest_theme";
const ONBOARD_KEY = "domirest_onboarded";
const FAV_KEY = "domirest_favs";

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {}
}

export const state = {
  user: null,
  categories: [],
  products: [],
  menuLoaded: false,
  cart: readJSON(CART_KEY, []),
  favorites: readJSON(FAV_KEY, []),
  theme: document.documentElement.dataset.theme || "light",
};

/* ---------- Dinero y fechas ---------- */
const cop = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

export function money(value) {
  return "$" + cop.format(Number(value) || 0);
}

export function shortMoney(value) {
  const n = Number(value) || 0;
  if (n >= 1000000) return "$" + (n / 1000000).toFixed(1).replace(".0", "") + "M";
  if (n >= 1000) return "$" + Math.round(n / 1000) + "k";
  return "$" + n;
}

export function parseDate(iso) {
  if (!iso) return null;
  return new Date(iso);
}

export function formatTime(iso) {
  const date = parseDate(iso);
  if (!date) return "";
  return new Intl.DateTimeFormat("es-CO", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatDateTime(iso) {
  const date = parseDate(iso);
  if (!date) return "";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function timeAgo(iso) {
  const date = parseDate(iso);
  if (!date) return "";
  const diff = Math.max(0, Date.now() - date.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Ayer";
  if (days < 7) return `Hace ${days} días`;
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short" }).format(date);
}

/* ---------- Carrito ---------- */
export function saveCart() {
  writeJSON(CART_KEY, state.cart);
  window.dispatchEvent(new CustomEvent("domirest:cart", { detail: cartCount() }));
}

export function cartCount() {
  return state.cart.reduce((sum, item) => sum + item.quantity, 0);
}

export function cartSubtotal() {
  return state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function deliveryFee(subtotal = cartSubtotal()) {
  return subtotal >= 60000 ? 0 : 3500;
}

export function cartTotal() {
  const subtotal = cartSubtotal();
  return subtotal + (subtotal > 0 ? deliveryFee(subtotal) : 0);
}

export function addToCart(product, quantity = 1, notes = "") {
  const cleanNotes = (notes || "").trim();
  const key = `${product.id}::${cleanNotes}`;
  const existing = state.cart.find((item) => item.key === key);
  if (existing) {
    existing.quantity = Math.min(20, existing.quantity + quantity);
  } else {
    state.cart.push({
      key,
      product_id: product.id,
      name: product.name,
      price: product.price,
      quantity: Math.min(20, quantity),
      notes: cleanNotes,
      emoji: product.emoji || "🍽️",
      image_url: product.image_url || "",
      available: product.available !== false,
    });
  }
  saveCart();
  return state.cart.find((item) => item.key === key);
}

export function setQuantity(key, quantity) {
  const item = state.cart.find((entry) => entry.key === key);
  if (!item) return;
  if (quantity <= 0) {
    state.cart = state.cart.filter((entry) => entry.key !== key);
  } else {
    item.quantity = Math.min(20, quantity);
  }
  saveCart();
}

export function removeFromCart(key) {
  state.cart = state.cart.filter((entry) => entry.key !== key);
  saveCart();
}

export function clearCart() {
  state.cart = [];
  saveCart();
}

export function cartToOrderItems() {
  return state.cart.map((item) => ({
    product_id: item.product_id,
    quantity: item.quantity,
    notes: item.notes || "",
  }));
}

/* ---------- Menú ---------- */
export async function loadMenu(force = false) {
  if (state.menuLoaded && !force) {
    return { categories: state.categories, products: state.products };
  }
  const [cats, products] = await Promise.all([
    api.get("/categories"),
    api.get("/products"),
  ]);
  state.categories = cats.data;
  state.products = products.data;
  state.menuLoaded = true;
  return { categories: state.categories, products: state.products };
}

export function invalidateMenu() {
  state.menuLoaded = false;
}

export function productById(id) {
  return state.products.find((p) => p.id === Number(id));
}

/* ---------- Favoritos ---------- */
export function isFavorite(id) {
  return state.favorites.includes(Number(id));
}

export function toggleFavorite(id) {
  const value = Number(id);
  if (isFavorite(value)) {
    state.favorites = state.favorites.filter((x) => x !== value);
  } else {
    state.favorites.push(value);
  }
  writeJSON(FAV_KEY, state.favorites);
  return isFavorite(value);
}

/* ---------- Tema ---------- */
export function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (_) {}
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#120E1C" : "#FFF6EC");
}

export function toggleTheme() {
  applyTheme(state.theme === "dark" ? "light" : "dark");
  return state.theme;
}

/* ---------- Onboarding ---------- */
export function needsOnboarding() {
  try {
    return !localStorage.getItem(ONBOARD_KEY);
  } catch (_) {
    return false;
  }
}

export function completeOnboarding() {
  try {
    localStorage.setItem(ONBOARD_KEY, "1");
  } catch (_) {}
}

/* ---------- Utilidades de rol ---------- */
export const ROLE_LABEL = {
  client: "Cliente",
  admin: "Administrador",
  courier: "Domiciliario",
};

export const STATUS_LABEL = {
  recibido: "Recibido",
  preparando: "Preparando",
  listo: "Listo",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export const STATUS_ICON = {
  recibido: "receipt",
  preparando: "chef",
  listo: "package",
  en_camino: "bike",
  entregado: "checkCircle",
  cancelado: "x",
};

export const PAYMENT_LABEL = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  nequi: "Nequi",
  daviplata: "Daviplata",
};

export function homeForRole(role) {
  if (role === "admin") return "admin";
  if (role === "courier") return "courier";
  return "home";
}

export function isReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
