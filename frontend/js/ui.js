/* Utilidades de interfaz: toasts, sheets, confeti, contadores y micro-feedback. */
import { icon } from "./icons.js";
import { isReducedMotion, STATUS_LABEL, money } from "./state.js";

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function haptic(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch (_) {}
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function debounce(fn, wait = 220) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/* ---------- Toasts ---------- */
export function toast(message, type = "ok", duration = 3200) {
  const root = document.getElementById("toasts");
  if (!root) return;
  const icons = { ok: "checkCircle", error: "alert", info: "info", warn: "alert" };
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.innerHTML = `
    <span class="toast-ico">${icon(icons[type] || "info", 18)}</span>
    <span class="grow">${escapeHtml(message)}</span>`;
  root.appendChild(node);
  const remove = () => {
    node.classList.add("out");
    setTimeout(() => node.remove(), 300);
  };
  const timer = setTimeout(remove, duration);
  node.addEventListener("click", () => {
    clearTimeout(timer);
    remove();
  });
}

/* ---------- Ripple global ---------- */
export function initRipples() {
  if (isReducedMotion()) return;
  const selector =
    ".btn, .chip, .cat-chip, .icon-btn, .nav-item, .role-card, .pay-opt, .p-add, .mini-icon, .back-btn, .section-link, .star-btn, .kc-advance, .top-item, .demo-btns button";
  document.addEventListener(
    "pointerdown",
    (event) => {
      const host = event.target.closest(selector);
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 1.7;
      const span = document.createElement("span");
      span.className = "ripple";
      span.style.width = span.style.height = `${size}px`;
      span.style.left = `${event.clientX - rect.left - size / 2}px`;
      span.style.top = `${event.clientY - rect.top - size / 2}px`;
      host.appendChild(span);
      setTimeout(() => span.remove(), 680);
    },
    { passive: true }
  );
}

/* ---------- Bottom sheets con arrastre ---------- */
let activeSheet = null;

export function openSheet(contentHtml, options = {}) {
  const { className = "", onMount = null, dismissable = true, showGrabber = true } = options;
  closeSheet(true);
  const root = document.getElementById("sheet-root");
  if (!root) return null;

  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";
  backdrop.setAttribute("aria-hidden", "true");

  const sheet = document.createElement("div");
  sheet.className = `sheet ${className}`;
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.innerHTML = `
    ${showGrabber ? '<div class="sheet-grabber" aria-hidden="true"></div>' : ""}
    <div class="sheet-scroll">${contentHtml}</div>`;

  root.innerHTML = "";
  root.append(backdrop, sheet);
  root.classList.add("active");
  document.body.classList.add("sheet-open");
  requestAnimationFrame(() => root.classList.add("open"));

  const close = (instant = false) => {
    if (!root.classList.contains("open")) return;
    root.classList.remove("open");
    document.body.classList.remove("sheet-open");
    const done = () => {
      if (!root.classList.contains("open")) {
        root.innerHTML = "";
        root.classList.remove("active");
      }
      if (activeSheet === api) activeSheet = null;
    };
    if (instant) done();
    else setTimeout(done, 440);
  };

  const api = { sheet, close, root };

  if (dismissable) {
    backdrop.addEventListener("click", () => close());
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") close();
      },
      { once: true }
    );
  }

  // Arrastre para cerrar
  const grabber = sheet.querySelector(".sheet-grabber");
  if (grabber && dismissable) {
    let startY = 0;
    let currentY = 0;
    let dragging = false;
    grabber.addEventListener("pointerdown", (event) => {
      dragging = true;
      startY = event.clientY;
      currentY = 0;
      sheet.classList.add("dragging");
      grabber.setPointerCapture?.(event.pointerId);
    });
    grabber.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      currentY = Math.max(0, event.clientY - startY);
      sheet.style.transform = `translate(-50%, ${currentY}px)`;
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      sheet.classList.remove("dragging");
      sheet.style.transform = "";
      if (currentY > 105) close();
    };
    grabber.addEventListener("pointerup", end);
    grabber.addEventListener("pointercancel", end);
  }

  activeSheet = api;
  if (onMount) onMount(sheet, close);
  return api;
}

export function closeSheet(instant = false) {
  if (activeSheet) {
    activeSheet.close(instant);
    activeSheet = null;
  }
}

/* ---------- Confeti ---------- */
export function confetti(count = 46) {
  if (isReducedMotion()) return;
  const root = document.getElementById("fx-root");
  if (!root) return;
  const colors = ["#FF5A36", "#FFB627", "#2EC4A6", "#FF7A9C", "#FFE3D6", "#FFD98A"];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("i");
    piece.className = "confetti";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.setProperty("--drift", `${(Math.random() - 0.5) * 220}px`);
    piece.style.setProperty("--spin", `${360 + Math.random() * 720}deg`);
    piece.style.setProperty("--rot", `${Math.random() * 360}deg`);
    piece.style.setProperty("--dur", `${1.9 + Math.random() * 1.4}s`);
    piece.style.setProperty("--delay", `${Math.random() * 0.35}s`);
    if (i % 3 === 0) piece.style.borderRadius = "50%";
    root.appendChild(piece);
    setTimeout(() => piece.remove(), 3800);
  }
}

/* ---------- Contadores animados ---------- */
export function countUp(node, target, options = {}) {
  if (!node) return;
  const { duration = 1100, format = (v) => Math.round(v), suffix = "", prefix = "" } = options;
  const final = Number(target) || 0;
  if (isReducedMotion()) {
    node.textContent = `${prefix}${format(final)}${suffix}`;
    return;
  }
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = `${prefix}${format(final * eased)}${suffix}`;
    if (t < 1) requestAnimationFrame(tick);
    else node.textContent = `${prefix}${format(final)}${suffix}`;
  };
  requestAnimationFrame(tick);
}

/* ---------- Componentes HTML ---------- */
export function statusBadge(status) {
  return `<span class="status status-${status}">${STATUS_LABEL[status] || status}</span>`;
}

export function starsHTML(rating = 0, size = 13) {
  const rounded = Math.round(Number(rating) || 0);
  return `<span class="stars" aria-label="${rating} de 5 estrellas">${[1, 2, 3, 4, 5]
    .map((n) => `<span class="star ${n <= rounded ? "" : "off"}">${icon("star", size)}</span>`)
    .join("")}</span>`;
}

export function imgHTML(url, emoji, alt = "", fallbackClass = "") {
  const safeAlt = escapeHtml(alt);
  return `
    <span class="img-fallback ${fallbackClass}" aria-hidden="true">${emoji || "🍽️"}</span>
    ${
      url
        ? `<img src="${escapeHtml(url)}" alt="${safeAlt}" loading="lazy" decoding="async"
             onerror="this.style.display='none'" />`
        : ""
    }`;
}

export function emptyState({ emoji = "🍽️", title, text = "", action = "" }) {
  return `
    <div class="empty">
      <div class="empty-art" aria-hidden="true">${emoji}</div>
      <h3>${escapeHtml(title)}</h3>
      ${text ? `<p>${escapeHtml(text)}</p>` : ""}
      ${action}
    </div>`;
}

export function moneyLine(label, value, extra = "") {
  return `<div class="money-row"><span>${escapeHtml(label)}</span><strong>${extra || money(value)}</strong></div>`;
}

export function setLoading(button, loading) {
  if (!button) return;
  button.classList.toggle("loading", loading);
  button.disabled = loading;
}

/* ---------- Feedback táctil visual ---------- */
export function initPressFeedback() {
  document.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target.closest(
        ".btn, .icon-btn, .back-btn, .p-add, .role-card, .chip, .cat-chip, .nav-item, .pay-opt, .promo-row, .product-row, .p-card, .mini-icon"
      );
      if (!target || isReducedMotion()) return;
      target.style.willChange = "transform";
    },
    { passive: true }
  );
  document.addEventListener(
    "pointerup",
    (event) => {
      const target = event.target.closest(
        ".btn, .icon-btn, .back-btn, .p-add, .role-card, .chip, .cat-chip, .nav-item, .pay-opt, .promo-row, .product-row, .p-card, .mini-icon"
      );
      if (target) target.style.willChange = "auto";
    },
    { passive: true }
  );
}

/* ---------- Vuelo al carrito ---------- */
export function flyToCart(sourceEl, emoji = "🍕") {
  if (!sourceEl || isReducedMotion()) return;
  const fab = document.getElementById("cart-fab");
  const source = sourceEl.getBoundingClientRect();
  const target = fab?.getBoundingClientRect();
  if (!target) return;

  const flyer = document.createElement("div");
  flyer.className = "cart-flyer";
  flyer.textContent = emoji;
  flyer.style.cssText = `
    position:fixed;left:${source.left + source.width / 2 - 20}px;top:${source.top + source.height / 2 - 20}px;
    width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-size:22px;
    background:var(--surface);box-shadow:0 10px 24px rgba(0,0,0,.22);z-index:400;pointer-events:none;
    border:1px solid var(--line);`;
  document.body.appendChild(flyer);

  const dx = target.left + target.width / 2 - (source.left + source.width / 2);
  const dy = target.top + target.height / 2 - (source.top + source.height / 2);

  flyer.animate(
    [
      { transform: "translate3d(0,0,0) scale(1)", opacity: 1 },
      { transform: `translate3d(${dx * 0.45}px, ${dy * 0.25 - 70}px, 0) scale(0.9) rotate(15deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate3d(${dx}px, ${dy}px, 0) scale(0.16) rotate(30deg)`, opacity: 0.35 },
    ],
    { duration: 680, easing: "cubic-bezier(.22,1,.36,1)" }
  ).onfinish = () => {
    flyer.remove();
    const badge = document.getElementById("cart-count");
    if (badge) {
      badge.classList.remove("jump");
      void badge.offsetWidth;
      badge.classList.add("jump");
    }
    const fabEl = document.getElementById("cart-fab");
    if (fabEl) {
      fabEl.classList.remove("bump");
      void fabEl.offsetWidth;
      fabEl.classList.add("bump");
    }
    haptic(10);
  };
}

/* ---------- Skeleton helpers ---------- */
export function skeletonCards(count = 3) {
  return Array.from(
    { length: count },
    () => `
      <div class="sk-card">
        <div class="sk sk-img" style="height:120px;margin-bottom:10px"></div>
        <div class="sk sk-line lg" style="width:78%;margin-bottom:8px"></div>
        <div class="sk sk-line" style="width:52%"></div>
      </div>`
  ).join("");
}

export function skeletonRows(count = 4) {
  return Array.from(
    { length: count },
    () => `
      <div class="sk-row" style="margin-bottom:12px">
        <div class="sk sk-avatar"></div>
        <div class="sk-stack">
          <div class="sk sk-line lg" style="width:66%"></div>
          <div class="sk sk-line" style="width:42%"></div>
        </div>
      </div>`
  ).join("");
}
