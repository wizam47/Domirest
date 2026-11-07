/* Flujo completo del cliente: home, menú, producto, carrito, checkout,
   pago simulado, seguimiento, historial y calificación. */
import { api } from "../api.js";
import { icon } from "../icons.js";
import {
  PAYMENT_LABEL,
  STATUS_LABEL,
  addToCart,
  cartCount,
  cartSubtotal,
  cartToOrderItems,
  cartTotal,
  clearCart,
  deliveryFee,
  formatDateTime,
  formatTime,
  homeForRole,
  loadMenu,
  money,
  productById,
  setQuantity,
  state,
  timeAgo,
  toggleFavorite,
  isFavorite,
} from "../state.js";
import {
  createPickerMap,
  createTrackingMap,
  mapAvailable,
  RESTAURANT,
} from "../maps.js";
import { navigate, refreshCartUI, reload } from "../router.js";
import {
  closeSheet,
  confetti,
  debounce,
  emptyState,
  escapeHtml,
  flyToCart,
  haptic,
  imgHTML,
  moneyLine,
  openSheet,
  setLoading,
  skeletonCards,
  skeletonRows,
  starsHTML,
  statusBadge,
  toast,
} from "../ui.js";

/* ---------- Helpers de catálogo ---------- */
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function productCardHTML(product, index = 0) {
  const promo = product.old_price
    ? `<span class="p-badge">−${Math.round((1 - product.price / product.old_price) * 100)}%</span>`
    : product.badge
      ? `<span class="p-badge">${escapeHtml(product.badge)}</span>`
      : "";
  return `
    <article class="p-card" data-product="${product.id}" tabindex="0" role="button" aria-label="${escapeHtml(product.name)}" style="--i:${index}">
      <div class="p-img-wrap">
        ${imgHTML(product.image_url, product.emoji, product.name)}
        ${promo}
        <button class="p-fav ${isFavorite(product.id) ? "on" : ""}" data-fav="${product.id}" aria-label="Favorito">
          ${icon("heart", 15)}
        </button>
      </div>
      <div class="p-card-body">
        <div class="p-card-name">${escapeHtml(product.name)}</div>
        <div class="p-card-meta">
          <span class="p-price">${money(product.price)}</span>
          <span class="p-rating">${icon("star", 10)} ${product.rating}</span>
        </div>
        <div class="p-card-meta">
          <span class="tiny muted">${icon("clock", 10)} ${product.prep_minutes} min</span>
          <button class="p-add" data-add="${product.id}" aria-label="Agregar ${escapeHtml(product.name)} al carrito">
            ${icon("plus", 16)}
          </button>
        </div>
      </div>
    </article>`;
}

function productRowHTML(product, index = 0) {
  return `
    <article class="product-row" data-product="${product.id}" tabindex="0" role="button" style="--i:${index}" aria-label="${escapeHtml(product.name)}">
      <div class="pr-img">${imgHTML(product.image_url, product.emoji, product.name)}</div>
      <div class="pr-body">
        <div class="pr-name">${escapeHtml(product.name)}</div>
        <div class="pr-desc">${escapeHtml(product.description)}</div>
        <div class="pr-bottom">
          <span class="p-price">${money(product.price)}</span>
          ${product.old_price ? `<span class="tiny muted" style="text-decoration:line-through">${money(product.old_price)}</span>` : ""}
          <span class="p-rating">${icon("star", 10)} ${product.rating}</span>
        </div>
      </div>
      <button class="p-add" data-add="${product.id}" aria-label="Agregar ${escapeHtml(product.name)} al carrito">${icon("plus", 17)}</button>
    </article>`;
}

function bindCatalogActions(root) {
  root.addEventListener("click", (event) => {
    const fav = event.target.closest("[data-fav]");
    if (fav) {
      event.preventDefault();
      event.stopPropagation();
      const on = toggleFavorite(fav.dataset.fav);
      fav.classList.toggle("on", on);
      haptic(6);
      return;
    }

    const add = event.target.closest("[data-add]");
    if (add) {
      event.preventDefault();
      event.stopPropagation();
      const product = productById(add.dataset.add);
      if (!product) return;
      addToCart(product, 1);
      refreshCartUI();
      flyToCart(add.closest(".p-card, .product-row") || add, product.emoji);
      toast(`${product.name} agregado`, "ok", 1700);
      haptic(8);
      return;
    }

    const card = event.target.closest("[data-product]");
    if (card) navigate(`product/${card.dataset.product}`);
  });

  root.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-product]");
    if (!card || event.target.closest("button")) return;
    event.preventDefault();
    navigate(`product/${card.dataset.product}`);
  });
}

/* ---------- Home ---------- */
function homeSkeleton() {
  return `
    <div class="sk" style="height:198px;border-radius:30px;margin-bottom:24px"></div>
    <div class="section-head"><div class="sk sk-line lg" style="width:42%"></div></div>
    <div class="chip-row" style="margin-bottom:24px">
      ${Array.from({ length: 5 }, () => `<div class="sk" style="width:76px;height:78px;border-radius:20px;flex:0 0 auto"></div>`).join("")}
    </div>
    <div class="section-head"><div class="sk sk-line lg" style="width:34%"></div></div>
    <div style="display:flex;gap:13px;overflow:hidden">${skeletonCards(2)}</div>`;
}

function homeDynamicHTML() {
  const products = state.products;
  const categories = state.categories;
  const featured = products.filter((p) => p.featured).slice(0, 6);
  const promos = products.filter((p) => p.is_promo).slice(0, 3);
  const promo = promos[0] || featured[0] || products[0];

  const categoriesHTML = categories
    .map(
      (cat, index) => `
      <button class="cat-chip" data-cat="${cat.slug}" style="--i:${index}">
        <span class="cat-ico" style="--tint:${cat.tint}">${cat.icon}</span>
        <span class="cat-label">${escapeHtml(cat.name)}</span>
      </button>`
    )
    .join("");

  const promoRows = promos
    .map((product, index) => {
      const discount = product.old_price
        ? Math.round((1 - product.price / product.old_price) * 100)
        : 15;
      return `
      <article class="promo-row" data-product="${product.id}" tabindex="0" role="button" style="--i:${index}">
        <div class="promo-thumb">${imgHTML(product.image_url, product.emoji, product.name)}</div>
        <div class="promo-info">
          <b>${escapeHtml(product.name)}</b>
          <span>${escapeHtml(product.description).slice(0, 54)}…</span>
          <span class="p-price">${money(product.price)}${product.old_price ? `<span class="old">${money(product.old_price)}</span>` : ""}</span>
        </div>
        <div class="promo-discount">−${discount}%</div>
      </article>`;
    })
    .join("");

  const hero = promo
    ? `
    <button class="hero-promo" data-product="${promo.id}" aria-label="Ver ${escapeHtml(promo.name)}">
      ${imgHTML(promo.image_url, promo.emoji, promo.name)}
      <span class="promo-shade"></span>
      <span class="promo-badge">🔥 Top de hoy</span>
      <span class="promo-body">
        <span>
          <span class="eyebrow on-grad">${icon("sparkles", 12)} Recomendado</span>
          <h2>${escapeHtml(promo.name)}</h2>
          <p>${escapeHtml(promo.description).slice(0, 76)}…</p>
        </span>
        <span class="promo-bottom">
          <span class="promo-price">${money(promo.price)}</span>
          ${promo.old_price ? `<span class="promo-old">${money(promo.old_price)}</span>` : ""}
          <span class="promo-cta">Pedir ${icon("arrowRight", 13)}</span>
        </span>
      </span>
    </button>`
    : "";

  return `
    ${hero}
    <section class="home-section">
      <div class="section-head">
        <h2 class="section-title">¿Qué se te antoja?</h2>
        <button class="section-link" data-go-menu>Ver todo ${icon("chevronRight", 13)}</button>
      </div>
      <div class="cat-scroller no-scrollbar">${categoriesHTML}</div>
    </section>

    <section class="home-section">
      <div class="section-head">
        <h2 class="section-title">Los más pedidos ${icon("flame", 18)}</h2>
        <button class="section-link" data-go-menu>Ver menú ${icon("chevronRight", 13)}</button>
      </div>
      <div class="product-scroller no-scrollbar stagger">
        ${featured.map((p, i) => productCardHTML(p, i)).join("")}
      </div>
    </section>

    <section class="home-section">
      <div class="section-head">
        <h2 class="section-title">Promos que saben</h2>
        <span class="badge badge-mint">${icon("zap", 11)} Solo hoy</span>
      </div>
      <div class="promo-list">${promoRows}</div>
    </section>

    <div class="card card-grad" style="display:flex;align-items:center;gap:13px;margin-bottom:6px">
      <div style="width:44px;height:44px;border-radius:14px;background:rgba(255,255,255,.2);display:grid;place-items:center;font-size:22px">🛵</div>
      <div class="grow">
        <b style="font-family:var(--font-display);font-size:15px;display:block">Domicilio gratis desde $60.000</b>
        <span style="font-size:11px;opacity:.78">Sigue tu pedido en vivo por el mapa.</span>
      </div>
      ${icon("arrowRight", 18)}
    </div>`;
}

export async function homeScreen() {
  const name = state.user?.name?.split(" ")[0] || "vecino";
  const loaded = state.menuLoaded;
  const html = `
  <section class="screen home-screen">
    <div class="home-top">
      <div>
        <div class="loc-chip">${icon("mapPin", 13)} Montería, Córdoba ${icon("chevronDown", 12)}</div>
        <div class="hello-line">${greeting()}, <b>${escapeHtml(name)}</b></div>
        <h1>¿Qué comemos hoy?</h1>
      </div>
      <div class="home-actions">
        <button class="icon-btn" data-theme-toggle aria-label="Cambiar tema" style="width:42px;height:42px">${icon(state.theme === "dark" ? "sun" : "moon", 19)}</button>
        <button class="home-avatar" data-profile aria-label="Mi perfil">${state.user?.avatar_emoji || "😋"}</button>
      </div>
    </div>

    <form class="search-bar home-search" id="home-search" role="search">
      ${icon("search", 20)}
      <input id="home-search-input" type="search" placeholder="Busca bandeja, mote, jugos…" autocomplete="off" />
      <button class="search-go" type="submit" aria-label="Buscar">${icon("arrowRight", 18)}</button>
    </form>

    <div id="home-dynamic">${loaded ? homeDynamicHTML() : homeSkeleton()}</div>
  </section>`;

  return {
    html,
    nav: true,
    cart: true,
    name: "home",
    title: "Inicio",
    mount(root) {
      const dynamic = root.querySelector("#home-dynamic");
      root.querySelector("[data-profile]")?.addEventListener("click", () => navigate("profile"));

      const searchForm = root.querySelector("#home-search");
      searchForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const value = root.querySelector("#home-search-input").value.trim();
        if (value) {
          sessionStorage.setItem("domirest_search", value);
          navigate("menu");
        }
      });

      if (!state.menuLoaded) {
        loadMenu()
          .then(() => {
            dynamic.innerHTML = homeDynamicHTML();
            bindHomeDynamic();
          })
          .catch((error) => {
            dynamic.innerHTML = emptyState({
              emoji: "📡",
              title: "No pudimos cargar el menú",
              text: error.message,
              action: `<button class="btn btn-soft" data-retry>Reintentar</button>`,
            });
            dynamic.querySelector("[data-retry]")?.addEventListener("click", () => reload());
          });
      } else {
        bindHomeDynamic();
      }

      function bindHomeDynamic() {
        bindCatalogActions(dynamic);
        dynamic.addEventListener("click", (event) => {
          const cat = event.target.closest("[data-cat]");
          if (cat) {
            sessionStorage.setItem("domirest_filter", cat.dataset.cat);
            navigate("menu");
            return;
          }
          if (event.target.closest("[data-go-menu]")) navigate("menu");
        });
      }
    },
  };
}

/* ---------- Menú ---------- */
export async function menuScreen() {
  try {
    await loadMenu();
  } catch (_) {}

  let initialCategory = sessionStorage.getItem("domirest_filter") || "todos";
  const initialSearch = sessionStorage.getItem("domirest_search") || "";
  sessionStorage.removeItem("domirest_filter");
  sessionStorage.removeItem("domirest_search");

  const categories = state.categories;
  const chips = [
    { slug: "todos", name: "Todo", icon: "✨" },
    ...categories.map((c) => ({ slug: c.slug, name: c.name, icon: c.icon })),
  ];

  const html = `
  <section class="screen menu-screen">
    <div class="top-bar" style="margin-bottom:10px">
      <div>
        <div class="eyebrow">${icon("utensils", 12)} Carta de la casa</div>
        <h1 class="page-title" style="margin-top:6px">Nuestro menú</h1>
        <p class="page-sub">${state.products.length} platos recién hechos en Montería</p>
      </div>
      <button class="icon-btn" data-theme-toggle aria-label="Cambiar tema">${icon(state.theme === "dark" ? "sun" : "moon", 19)}</button>
    </div>

    <form class="search-bar" id="menu-search" role="search" style="margin-bottom:12px">
      ${icon("search", 19)}
      <input id="menu-search-input" type="search" placeholder="Buscar en el menú…" value="${escapeHtml(initialSearch)}" autocomplete="off" />
      <button class="search-go" type="submit" aria-label="Buscar">${icon("search", 17)}</button>
    </form>

    <div class="menu-filters">
      <div class="chip-row no-scrollbar" id="menu-chips">
        ${chips
          .map(
            (chip) =>
              `<button class="chip ${chip.slug === initialCategory ? "active" : ""}" data-filter="${chip.slug}">
                <span class="chip-emoji">${chip.icon}</span>${escapeHtml(chip.name)}
              </button>`
          )
          .join("")}
      </div>
    </div>

    <div class="between" style="margin-bottom:11px">
      <span class="small muted" id="menu-count"></span>
      <span class="badge badge-info">${icon("clock", 11)} 25–40 min</span>
    </div>

    <div class="menu-grid" id="menu-list"></div>
  </section>`;

  return {
    html,
    nav: true,
    cart: true,
    name: "menu",
    title: "Menú",
    mount(root) {
      const list = root.querySelector("#menu-list");
      const count = root.querySelector("#menu-count");
      const searchInput = root.querySelector("#menu-search-input");
      const chipsWrap = root.querySelector("#menu-chips");
      let category = initialCategory;
      let search = initialSearch;

      const render = () => {
        const term = search.trim().toLowerCase();
        const products = state.products.filter((product) => {
          const matchCategory =
            category === "todos" || product.category_slug === category;
          const matchSearch =
            !term ||
            product.name.toLowerCase().includes(term) ||
            (product.description || "").toLowerCase().includes(term) ||
            (product.category || "").toLowerCase().includes(term);
          return matchCategory && matchSearch && product.available;
        });

        count.textContent = `${products.length} ${products.length === 1 ? "plato" : "platos"}${term ? ` para “${search}”` : ""}`;
        list.innerHTML = products.length
          ? products.map((p, i) => productRowHTML(p, i)).join("")
          : emptyState({
              emoji: "🔎",
              title: "No encontramos ese antojo",
              text: "Prueba con otra palabra o explora todas las categorías.",
              action: `<button class="btn btn-soft" data-reset>Ver todo el menú</button>`,
            });
        list.querySelector("[data-reset]")?.addEventListener("click", () => {
          search = "";
          category = "todos";
          searchInput.value = "";
          chipsWrap.querySelectorAll(".chip").forEach((chip) => {
            chip.classList.toggle("active", chip.dataset.filter === "todos");
          });
          render();
        });
      };

      chipsWrap.addEventListener("click", (event) => {
        const chip = event.target.closest("[data-filter]");
        if (!chip) return;
        category = chip.dataset.filter;
        chipsWrap.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
        render();
        haptic(5);
      });

      searchInput.addEventListener(
        "input",
        debounce(() => {
          search = searchInput.value;
          render();
        }, 180)
      );
      root.querySelector("#menu-search").addEventListener("submit", (event) => {
        event.preventDefault();
        search = searchInput.value;
        render();
      });

      bindCatalogActions(root);
      render();
    },
  };
}

/* ---------- Detalle de producto ---------- */
export async function productScreen({ params }) {
  await loadMenu().catch(() => {});
  let product = productById(params.id);
  if (!product) {
    try {
      const response = await api.get(`/products/${params.id}`);
      product = response.data;
    } catch (_) {
      return {
        html: `<section class="screen screen--no-nav">${emptyState({
          emoji: "🍽️",
          title: "Producto no encontrado",
          text: "Puede que ya no esté disponible.",
          action: `<button class="btn btn-primary" data-go-menu>Volver al menú</button>`,
        })}</section>`,
        nav: false,
        cart: false,
        name: "product",
        title: "Producto",
        mount(root) {
          root.querySelector("[data-go-menu]")?.addEventListener("click", () => navigate("menu"));
        },
      };
    }
  }

  const html = `
  <section class="screen pd-screen">
    <div class="pd-hero" id="pd-hero">
      ${imgHTML(product.image_url, product.emoji, product.name)}
      <div class="pd-hero-shade"></div>
      <div class="pd-nav">
        <button class="icon-btn" data-back aria-label="Volver">${icon("chevronLeft", 21)}</button>
        <button class="icon-btn ${isFavorite(product.id) ? "on" : ""}" data-fav="${product.id}" aria-label="Favorito">
          ${icon("heart", 20)}
        </button>
      </div>
      <div class="pd-hero-badge">
        ${product.badge ? `<span class="badge badge-glass">${escapeHtml(product.badge)}</span>` : ""}
        <span class="badge badge-glass">${icon("flame", 11)} ${product.sold} pedidos</span>
      </div>
    </div>

    <div class="pd-content">
      <div class="pd-title-row">
        <div>
          <div class="eyebrow" style="margin-bottom:5px">${escapeHtml(product.category || "Carta")}</div>
          <h1 class="pd-title">${escapeHtml(product.name)}</h1>
        </div>
        <span class="pd-rating-big">${icon("star", 15)} ${product.rating}</span>
      </div>

      <div class="pd-price-row">
        <span class="pd-price">${money(product.price)}</span>
        ${product.old_price ? `<span class="pd-old-price">${money(product.old_price)}</span>` : ""}
      </div>

      <p class="pd-desc">${escapeHtml(product.description)}</p>

      <div class="pd-tags">
        <span class="pd-tag">${icon("clock", 12)} ${product.prep_minutes} min</span>
        <span class="pd-tag">${icon("chef", 12)} Recién hecho</span>
        <span class="pd-tag">${icon("package", 12)} Para llevar</span>
        <span class="pd-tag">${icon("star", 12)} ${product.rating} · ${product.sold} pedidos</span>
      </div>

      <div class="pd-section">
        <h3>Notas especiales <span>Opcional</span></h3>
        <div class="input" style="background:var(--surface);min-height:82px;align-items:flex-start">
          <textarea id="pd-notes" maxlength="180" placeholder="Ej. sin cebolla, salsa aparte, término medio…" style="min-height:70px"></textarea>
        </div>
      </div>

      <div class="pd-section">
        <div class="pd-qty-row">
          <div>
            <h3 style="margin-bottom:2px">Cantidad</h3>
            <span class="tiny muted">¿Cuántos se te antojan?</span>
          </div>
          <div class="stepper" id="pd-stepper">
            <button data-qty="-1" aria-label="Quitar uno">${icon("minus", 18)}</button>
            <span class="qty" id="pd-qty">1</span>
            <button class="plus" data-qty="1" aria-label="Agregar uno">${icon("plus", 18)}</button>
          </div>
        </div>
      </div>
    </div>

    <div class="pd-footer">
      <div class="pd-total">
        <small>Total</small>
        <b id="pd-total">${money(product.price)}</b>
      </div>
      <button class="btn btn-primary btn-lg" id="pd-add">
        ${icon("plus", 18)} <span>Agregar al carrito</span>
      </button>
    </div>
  </section>`;

  return {
    html,
    nav: false,
    cart: true,
    name: "product",
    title: product.name,
    mount(root) {
      let quantity = 1;
      const qtyNode = root.querySelector("#pd-qty");
      const totalNode = root.querySelector("#pd-total");
      const addButton = root.querySelector("#pd-add");
      const notes = root.querySelector("#pd-notes");
      const hero = root.querySelector("#pd-hero");

      const paint = () => {
        qtyNode.textContent = quantity;
        totalNode.textContent = money(product.price * quantity);
      };

      root.querySelector("[data-back]")?.addEventListener("click", () => {
        if (history.length > 1) history.back();
        else navigate("menu");
      });

      root.querySelector("[data-fav]")?.addEventListener("click", (event) => {
        const on = toggleFavorite(product.id);
        event.currentTarget.classList.toggle("on", on);
        haptic(6);
      });

      root.querySelector("#pd-stepper").addEventListener("click", (event) => {
        const button = event.target.closest("[data-qty]");
        if (!button) return;
        quantity = Math.max(1, Math.min(20, quantity + Number(button.dataset.qty)));
        paint();
        haptic(4);
      });

      addButton.addEventListener("click", () => {
        addToCart(product, quantity, notes.value);
        refreshCartUI();
        requestAnimationFrame(() => flyToCart(hero, product.emoji));
        haptic(10);
        toast(`${quantity} × ${product.name} al carrito`, "ok", 1900);
        const label = addButton.querySelector("span");
        if (label) label.textContent = "¡Agregado!";
        addButton.classList.add("btn-mint");
        setTimeout(() => {
          if (!addButton.isConnected) return;
          if (label) label.textContent = "Agregar al carrito";
          addButton.classList.remove("btn-mint");
        }, 1400);
      });

      paint();
    },
  };
}

/* ---------- Carrito (bottom sheet) ---------- */
function cartMarkup() {
  const items = state.cart;
  const subtotal = cartSubtotal();
  const fee = items.length ? deliveryFee(subtotal) : 0;
  const total = items.length ? subtotal + fee : 0;
  const free = subtotal >= 60000;
  const missing = Math.max(0, 60000 - subtotal);

  if (!items.length) {
    return `
      <div class="between" style="margin-bottom:12px">
        <h2 class="section-title">Tu pedido</h2>
        <button class="icon-btn" data-close-sheet aria-label="Cerrar">${icon("x", 19)}</button>
      </div>
      ${emptyState({
        emoji: "🛍️",
        title: "Tu carrito está vacío",
        text: "Agrega algo rico del menú y vuelve por aquí.",
        action: `<button class="btn btn-primary" data-browse>${icon("menu", 18)} Explorar menú</button>`,
      })}`;
  }

  return `
    <div class="between" style="margin-bottom:14px">
      <h2 class="section-title">Tu pedido <span class="badge badge-coral">${cartCount()}</span></h2>
      <button class="icon-btn" data-close-sheet aria-label="Cerrar">${icon("x", 19)}</button>
    </div>
    <div class="cart-sheet-content">
      <div class="cart-items">
        ${items
          .map(
            (item) => `
          <div class="cart-item">
            <div class="cart-item-img">${imgHTML(item.image_url, item.emoji, item.name, "sm")}</div>
            <div class="cart-item-body">
              <div class="cart-item-name">${escapeHtml(item.name)}</div>
              ${item.notes ? `<div class="cart-item-note">📝 ${escapeHtml(item.notes)}</div>` : ""}
              <div class="cart-item-price">${money(item.price * item.quantity)}</div>
            </div>
            <div class="stepper mini">
              <button data-cart-action="dec" data-key="${escapeHtml(item.key)}" aria-label="Quitar uno">${icon("minus", 14)}</button>
              <span class="qty">${item.quantity}</span>
              <button class="plus" data-cart-action="inc" data-key="${escapeHtml(item.key)}" aria-label="Agregar uno">${icon("plus", 14)}</button>
            </div>
          </div>`
          )
          .join("")}
      </div>

      <div class="free-delivery ${free ? "" : "miss"}">
        ${icon(free ? "checkCircle" : "bike", 17)}
        <span class="grow">${free ? "¡Domicilio gratis desbloqueado!" : `Te faltan ${money(missing)} para domicilio gratis`}</span>
        <b>${free ? "Gratis" : money(fee)}</b>
      </div>
      <div class="progress ${free ? "mint" : ""}" style="height:7px;margin-top:-4px">
        <i style="width:${Math.min(100, (subtotal / 60000) * 100)}%"></i>
      </div>

      <div class="cart-summary">
        ${moneyLine("Subtotal", subtotal)}
        ${moneyLine("Domicilio", fee, fee === 0 ? "Gratis" : money(fee))}
        <hr class="divider" />
        ${moneyLine("Total", total)}
      </div>

      <div class="sheet-cta">
        <button class="btn btn-primary btn-lg" data-checkout>
          Ir a pagar · ${money(total)} ${icon("arrowRight", 18)}
        </button>
        <div class="cart-note-row">${icon("lock", 12)} Pago seguro simulado · Cancela si algo no está bien</div>
      </div>
    </div>`;
}

export function openCartSheet() {
  const sheet = openSheet(cartMarkup(), {
    className: "cart-sheet",
    onMount(sheetEl, close) {
      sheetEl.addEventListener("click", (event) => {
        if (event.target.closest("[data-close-sheet]")) {
          close();
          return;
        }
        if (event.target.closest("[data-browse]")) {
          close();
          navigate("menu");
          return;
        }
        if (event.target.closest("[data-checkout]")) {
          close();
          navigate("checkout");
          return;
        }
        const action = event.target.closest("[data-cart-action]");
        if (action) {
          const key = action.dataset.key;
          const item = state.cart.find((entry) => entry.key === key);
          if (!item) return;
          const next = item.quantity + (action.dataset.cartAction === "inc" ? 1 : -1);
          setQuantity(key, next);
          refreshCartUI();
          haptic(4);
          const scroll = sheetEl.querySelector(".sheet-scroll");
          if (scroll) scroll.innerHTML = cartMarkup();
        }
      });
    },
  });
  return sheet;
}

/* ---------- Checkout ---------- */
const DEFAULT_COORDS = { lat: 8.7572, lng: -75.8810 };

async function reverseGeocode(lat, lng) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=es`,
      { headers: { Accept: "application/json" } }
    );
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.display_name) return null;
    return data.display_name.split(",").slice(0, 4).join(",").trim();
  } catch (_) {
    return null;
  }
}

export async function checkoutScreen() {
  if (!state.cart.length) {
    toast("Tu carrito está vacío", "warn");
    navigate("menu");
    return null;
  }

  const subtotal = cartSubtotal();
  const fee = deliveryFee(subtotal);
  const total = subtotal + fee;
  const userAddress =
    state.user?.address || "Calle 35 #8-24, Barrio La Castellana, Montería";

  const html = `
  <section class="screen screen--no-nav checkout-screen">
    <div class="top-bar">
      <button class="back-btn" data-back aria-label="Volver">${icon("chevronLeft", 21)}</button>
      <div class="grow" style="margin-left:4px">
        <h1 style="font-size:20px">Confirmar pedido</h1>
        <div class="sub">Paso 1 de 2 · Entrega y pago</div>
      </div>
      <span class="badge badge-mint">${icon("lock", 11)} Seguro</span>
    </div>
    <div class="checkout-steps"><i class="done"></i><i></i></div>

    <div class="checkout-block">
      <div class="block-title"><span class="bt-ico">${icon("mapPin", 15)}</span> Dirección de entrega</div>
      <div class="field">
        <div class="input">
          ${icon("home", 18)}
          <input id="checkout-address" type="text" value="${escapeHtml(userAddress)}" placeholder="Barrio, calle y número" />
        </div>
      </div>
      <div class="map-shell checkout-map" id="checkout-map">
        <div class="map-fallback">Cargando mapa…</div>
        <div class="map-tools">
          <button class="map-tool" id="locate-me" type="button" aria-label="Usar mi ubicación">${icon("navigation", 17)}</button>
        </div>
      </div>
      <div class="hint" style="margin-top:8px">${icon("info", 12)} Arrastra el pin para ajustar el punto exacto de entrega.</div>
    </div>

    <div class="checkout-block">
      <div class="block-title"><span class="bt-ico">${icon("wallet", 15)}</span> Método de pago</div>
      <div class="pay-grid" id="pay-grid">
        <button class="pay-opt active" data-pay="efectivo" type="button">
          <span class="pay-check">${icon("check", 11)}</span>
          <span class="pay-ico">${icon("cash", 17)}</span>
          <b>Efectivo</b><span>Pagas al recibir</span>
        </button>
        <button class="pay-opt" data-pay="tarjeta" type="button">
          <span class="pay-check">${icon("check", 11)}</span>
          <span class="pay-ico">${icon("card", 17)}</span>
          <b>Tarjeta</b><span>Débito o crédito</span>
        </button>
        <button class="pay-opt" data-pay="nequi" type="button">
          <span class="pay-check">${icon("check", 11)}</span>
          <span class="pay-ico">${icon("phoneDevice", 17)}</span>
          <b>Nequi</b><span>Pago simulado</span>
        </button>
        <button class="pay-opt" data-pay="daviplata" type="button">
          <span class="pay-check">${icon("check", 11)}</span>
          <span class="pay-ico">${icon("phoneDevice", 17)}</span>
          <b>Daviplata</b><span>Pago simulado</span>
        </button>
      </div>
    </div>

    <div class="checkout-block">
      <div class="block-title"><span class="bt-ico">${icon("message", 15)}</span> Notas para el domiciliario</div>
      <div class="input">
        <textarea id="checkout-notes" maxlength="220" placeholder="Ej. torre 2, apto 301, llamar al llegar…"></textarea>
      </div>
    </div>

    <div class="card checkout-summary">
      <div class="between" style="margin-bottom:10px">
        <h3 style="font-size:15px">Resumen</h3>
        <span class="badge">${cartCount()} producto${cartCount() === 1 ? "" : "s"}</span>
      </div>
      <div class="stack-8">
        ${moneyLine("Subtotal", subtotal)}
        ${moneyLine("Domicilio", fee, fee === 0 ? "Gratis" : money(fee))}
        <hr class="divider" />
        ${moneyLine("Total a pagar", total)}
      </div>
    </div>

    <div class="checkout-bar">
      <div class="bar-total"><small>Total</small><b>${money(total)}</b></div>
      <button class="btn btn-primary btn-lg" id="checkout-submit">
        <span>Confirmar pedido</span> ${icon("arrowRight", 18)}
      </button>
    </div>
  </section>`;

  return {
    html,
    nav: false,
    cart: false,
    name: "checkout",
    title: "Confirmar pedido",
    mount(root) {
      let method = "efectivo";
      const draft = {
        address: userAddress,
        lat: DEFAULT_COORDS.lat,
        lng: DEFAULT_COORDS.lng,
        notes: "",
        payment_method: method,
        total,
      };
      const addressInput = root.querySelector("#checkout-address");
      const notesInput = root.querySelector("#checkout-notes");
      const submit = root.querySelector("#checkout-submit");
      const label = submit.querySelector("span");

      let picker = createPickerMap(root.querySelector("#checkout-map"), {
        lat: draft.lat,
        lng: draft.lng,
        onChange: ({ lat, lng }) => {
          draft.lat = lat;
          draft.lng = lng;
        },
      });

      root.querySelector("[data-back]")?.addEventListener("click", () => navigate("menu"));

      addressInput.addEventListener("input", () => {
        draft.address = addressInput.value;
      });
      notesInput.addEventListener("input", () => {
        draft.notes = notesInput.value;
      });

      root.querySelector("#pay-grid").addEventListener("click", (event) => {
        const option = event.target.closest("[data-pay]");
        if (!option) return;
        method = option.dataset.pay;
        draft.payment_method = method;
        root.querySelectorAll("[data-pay]").forEach((item) => {
          item.classList.toggle("active", item === option);
        });
        label.textContent = method === "efectivo" ? "Confirmar pedido" : "Continuar al pago";
        haptic(5);
      });

      root.querySelector("#locate-me").addEventListener("click", () => {
        if (!navigator.geolocation) {
          toast("Tu navegador no permite geolocalización", "warn");
          return;
        }
        toast("Buscando tu ubicación…", "info", 1600);
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            draft.lat = latitude;
            draft.lng = longitude;
            picker.setPosition?.(latitude, longitude);
            const found = await reverseGeocode(latitude, longitude);
            if (found) {
              addressInput.value = found;
              draft.address = found;
            }
            toast("Ubicación actualizada", "ok");
          },
          () => toast("No pudimos obtener tu ubicación", "error"),
          { enableHighAccuracy: true, timeout: 8000 }
        );
      });

      submit.addEventListener("click", () => {
        draft.address = addressInput.value.trim();
        draft.notes = notesInput.value.trim();
        if (draft.address.length < 6) {
          addressInput.closest(".input").classList.add("invalid");
          addressInput.focus();
          toast("Escribe una dirección de entrega válida", "error");
          return;
        }
        sessionStorage.setItem("domirest_checkout", JSON.stringify(draft));
        haptic(8);
        navigate("payment");
      });

      // Si el mapa no pudo iniciarse, al menos mostramos un aviso
      if (!mapAvailable()) {
        const shell = root.querySelector("#checkout-map");
        if (shell) shell.querySelector(".map-fallback")?.remove();
      }
    },
  };
}

/* ---------- Pago simulado ---------- */
export async function paymentScreen() {
  let draft = null;
  try {
    draft = JSON.parse(sessionStorage.getItem("domirest_checkout") || "null");
  } catch (_) {}
  if (!draft || !state.cart.length) {
    toast("Primero confirma tu dirección", "warn");
    navigate("checkout");
    return null;
  }

  const method = draft.payment_method || "efectivo";
  const total = cartTotal();
  const paymentLabel = PAYMENT_LABEL[method] || "Pago";

  const formMarkup = () => {
    if (method === "efectivo") {
      return `
        <div class="pay-total-card">
          <div><div class="pt-label">Pagarás al recibir</div><div class="tiny muted">Lleva el efectivo listo 🛵</div></div>
          <div class="pt-value">${money(total)}</div>
        </div>
        <div class="pay-methods-note" style="margin-top:14px">
          ${icon("info", 17)}
          <span>Este es un pago <b>simulado</b> para la demo. No se realizará ningún cobro real.</span>
        </div>
        <div class="pay-total-card" style="margin-top:14px;background:var(--surface-2)">
          <div><div class="pt-label">Dirección</div><div class="tiny muted">${escapeHtml(draft.address)}</div></div>
          ${icon("mapPin", 22)}
        </div>`;
    }
    if (method === "tarjeta") {
      return `
        <div class="pay-card-visual">
          <div class="pc-top"><div class="pc-chip"></div><div class="pc-logo">DOMIREST</div></div>
          <div class="pc-number" id="pc-number">•••• •••• •••• ••••</div>
          <div class="pc-bottom">
            <div><small>Titular</small><b id="pc-name">TU NOMBRE</b></div>
            <div><small>Vence</small><b id="pc-exp">MM/AA</b></div>
          </div>
        </div>
        <div class="stack-12">
          <div class="field">
            <label for="card-number">Número de tarjeta</label>
            <div class="input">${icon("card", 18)}<input id="card-number" inputmode="numeric" placeholder="4242 4242 4242 4242" maxlength="19" /></div>
          </div>
          <div class="field">
            <label for="card-name">Nombre del titular</label>
            <div class="input">${icon("user", 18)}<input id="card-name" placeholder="Como aparece en la tarjeta" /></div>
          </div>
          <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="field"><label for="card-exp">Vence</label><div class="input"><input id="card-exp" inputmode="numeric" placeholder="MM/AA" maxlength="5" /></div></div>
            <div class="field"><label for="card-cvv">CVV</label><div class="input"><input id="card-cvv" inputmode="numeric" placeholder="123" maxlength="4" /></div></div>
          </div>
        </div>
        <div class="pay-methods-note" style="margin-top:13px">
          ${icon("lock", 17)}
          <span>Pago <b>simulado</b>. Usa cualquier número de prueba; no se guardan datos reales.</span>
        </div>`;
    }
    return `
      <div class="pay-card-visual" style="background:linear-gradient(135deg,#1a3b8f,#5b2bbf 55%,#8e2aa8)">
        <div class="pc-top"><div class="pc-logo">${method === "nequi" ? "NEQUI" : "DAVIPLATA"}</div><div class="pc-chip" style="background:linear-gradient(135deg,#d8e0ff,#8fa5ff)"></div></div>
        <div class="pc-number" style="font-size:17px">Pago desde tu celular</div>
        <div class="pc-bottom"><div><small>Valor</small><b>${money(total)}</b></div><div><small>Estado</small><b>Simulado</b></div></div>
      </div>
      <div class="field">
        <label for="wallet-phone">Número celular</label>
        <div class="input">${icon("phoneDevice", 18)}<input id="wallet-phone" inputmode="numeric" placeholder="300 123 4567" maxlength="12" value="${escapeHtml(state.user?.phone || "")}" /></div>
      </div>
      <div class="pay-methods-note" style="margin-top:13px">
        ${icon("info", 17)}
        <span>Simularemos la notificación de <b>${paymentLabel}</b>. No se realizará ningún cobro.</span>
      </div>`;
  };

  const html = `
  <section class="screen screen--no-nav pay-screen">
    <div class="top-bar">
      <button class="back-btn" data-back aria-label="Volver">${icon("chevronLeft", 21)}</button>
      <div class="grow" style="margin-left:4px">
        <h1 style="font-size:20px">Pago ${escapeHtml(paymentLabel)}</h1>
        <div class="sub">Paso 2 de 2 · Pago 100% simulado</div>
      </div>
      <span class="badge badge-mint">${icon("lock", 11)} Seguro</span>
    </div>
    <div class="checkout-steps"><i class="done"></i><i class="done"></i></div>
    <div id="pay-stage">${formMarkup()}</div>
    <div class="checkout-bar" id="pay-bar">
      <div class="bar-total"><small>Total</small><b>${money(total)}</b></div>
      <button class="btn btn-primary btn-lg" id="pay-submit">
        <span>${method === "efectivo" ? "Confirmar pedido" : `Pagar ${money(total)}`}</span> ${icon("check", 18)}
      </button>
    </div>
  </section>`;

  return {
    html,
    nav: false,
    cart: false,
    name: "payment",
    title: "Pago simulado",
    mount(root) {
      let redirectTimer = null;
      let createdOrder = null;
      const stage = root.querySelector("#pay-stage");
      const bar = root.querySelector("#pay-bar");
      const submit = root.querySelector("#pay-submit");
      const label = submit.querySelector("span");

      root.querySelector("[data-back]")?.addEventListener("click", () => navigate("checkout"));

      const bindFormEvents = () => {
        if (method === "tarjeta") {
          const numberInput = root.querySelector("#card-number");
          const nameInput = root.querySelector("#card-name");
          const expInput = root.querySelector("#card-exp");
          const cvvInput = root.querySelector("#card-cvv");
          const visualNumber = root.querySelector("#pc-number");
          const visualName = root.querySelector("#pc-name");
          const visualExp = root.querySelector("#pc-exp");

          numberInput.addEventListener("input", () => {
            const digits = numberInput.value.replace(/\D/g, "").slice(0, 16);
            numberInput.value = digits.replace(/(.{4})/g, "$1 ").trim();
            visualNumber.textContent = (digits.padEnd(16, "•").replace(/(.{4})/g, "$1 ").trim()) || "•••• •••• •••• ••••";
          });
          nameInput.addEventListener("input", () => {
            visualName.textContent = nameInput.value.trim().toUpperCase() || "TU NOMBRE";
          });
          expInput.addEventListener("input", () => {
            const digits = expInput.value.replace(/\D/g, "").slice(0, 4);
            expInput.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
            visualExp.textContent = expInput.value || "MM/AA";
          });
          cvvInput.addEventListener("input", () => {
            cvvInput.value = cvvInput.value.replace(/\D/g, "").slice(0, 4);
          });
        }
      };

      bindFormEvents();

      const showProcessing = () => {
        stage.innerHTML = `
          <div class="pay-processing">
            <div class="pulse-logo">D</div>
            <div>
              <h2 style="font-size:22px">Procesando pago…</h2>
              <p>Estamos confirmando tu pedido con Sabor &amp; Punto.</p>
            </div>
            <span class="badge badge-mint">${icon("lock", 11)} Conexión segura simulada</span>
          </div>`;
        if (bar) bar.style.display = "none";
      };

      const showSuccess = (order) => {
        stage.innerHTML = `
          <div class="pay-success">
            <div class="check-circle">
              <svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7"/></svg>
            </div>
            <span class="badge badge-mint">${icon("checkCircle", 12)} Pago aprobado · simulado</span>
            <h1>¡Pedido confirmado!</h1>
            <p>Tu ${paymentLabel === "Efectivo" ? "pedido será pagado al recibir" : "pago simulado fue aprobado"}. La cocina ya recibió tu orden.</p>
            <div class="success-amount">${money(order.total)}</div>
            <span class="tiny muted">Pedido ${escapeHtml(order.code)} · Llega en ~${order.estimated_minutes} min</span>
            <button class="btn btn-primary btn-lg" id="go-tracking" style="margin-top:14px;min-width:240px">
              ${icon("bike", 19)} Ver seguimiento en vivo
            </button>
          </div>`;
        if (bar) bar.style.display = "none";
        confetti(58);
        haptic([14, 40, 14]);
        stage.querySelector("#go-tracking").addEventListener("click", () => {
          clearTimeout(redirectTimer);
          navigate(`tracking/${order.id}`);
        });
        redirectTimer = setTimeout(() => navigate(`tracking/${order.id}`), 3200);
      };

      const createOrder = async () => {
        showProcessing();
        try {
          const response = await api.post("/orders", {
            items: cartToOrderItems(),
            address: draft.address,
            lat: draft.lat,
            lng: draft.lng,
            payment_method: method,
            notes: draft.notes,
          });
          createdOrder = response.data;
          clearCart();
          refreshCartUI();
          sessionStorage.removeItem("domirest_checkout");
          showSuccess(createdOrder);
        } catch (error) {
          toast(error.message, "error");
          stage.innerHTML = formMarkup();
          if (bar) bar.style.display = "flex";
          bindFormEvents();
        }
      };

      const validate = () => {
        if (method === "tarjeta") {
          const digits = root.querySelector("#card-number")?.value.replace(/\D/g, "") || "";
          const name = root.querySelector("#card-name")?.value.trim() || "";
          const exp = root.querySelector("#card-exp")?.value || "";
          const cvv = root.querySelector("#card-cvv")?.value || "";
          if (digits.length < 16) return "Ingresa los 16 dígitos de la tarjeta";
          if (name.length < 3) return "Escribe el nombre del titular";
          if (exp.length < 5) return "Ingresa la fecha de vencimiento";
          if (cvv.length < 3) return "Ingresa el CVV";
        }
        if (method === "nequi" || method === "daviplata") {
          const phone = root.querySelector("#wallet-phone")?.value.replace(/\D/g, "") || "";
          if (phone.length < 10) return "Ingresa un número celular de 10 dígitos";
        }
        return null;
      };

      submit.addEventListener("click", () => {
        const problem = validate();
        if (problem) {
          toast(problem, "error");
          return;
        }
        haptic(12);
        createOrder();
      });

      if (label) {
        label.textContent =
          method === "efectivo" ? "Confirmar pedido" : `Pagar ${money(total)}`;
      }
    },
  };
}

/* ---------- Seguimiento en vivo ---------- */
const TRACK_STEPS = [
  { key: "recibido", label: "Recibido", icon: "receipt" },
  { key: "preparando", label: "Preparando", icon: "chef" },
  { key: "en_camino", label: "En camino", icon: "bike" },
  { key: "entregado", label: "Entregado", icon: "checkCircle" },
];

function trackIndex(status) {
  if (status === "entregado") return 3;
  if (status === "en_camino") return 2;
  if (status === "listo") return 1.5;
  if (status === "preparando") return 1;
  return 0;
}

function etaText(order) {
  if (order.status === "entregado") {
    return { num: "0", label: "min", sub: "Pedido entregado" };
  }
  if (order.status === "en_camino") {
    const elapsed = Math.max(0, (Date.now() - new Date(order.created_at).getTime()) / 60000);
    const remain = Math.max(3, Math.round((order.estimated_minutes || 35) - elapsed));
    return { num: String(remain), label: "min", sub: "El domiciliario va en camino" };
  }
  if (order.status === "listo") {
    return { num: "8", label: "min", sub: "¡Ya casi sale de la cocina!" };
  }
  return {
    num: String(order.estimated_minutes || 35),
    label: "min",
    sub: "Tiempo estimado de entrega",
  };
}

function timelineHTML(order) {
  const index = trackIndex(order.status);
  const fill = Math.min(100, (index / 3) * 100);
  return `
    <div class="timeline-wrap">
      <div class="timeline" style="--p:${fill}%">
        <span class="tl-fill" style="--p:${fill}%"></span>
        ${TRACK_STEPS.map((step, i) => {
          const done = i < Math.floor(index) || (order.status === "entregado");
          const active = !done && i === Math.ceil(index - (index % 1 === 0 ? 0 : 0));
          const isActive = order.status === "entregado" ? i === 3 : i === Math.ceil(index);
          return `<div class="tl-step ${done ? "done" : ""} ${isActive ? "active" : ""}" data-step="${i}">
            <span class="tl-dot">${icon(done ? "check" : step.icon, 16)}</span>
            <span class="tl-label">${step.label}</span>
          </div>`;
        }).join("")}
      </div>
    </div>`;
}

function ratingSlotHTML(order) {
  if (order.status !== "entregado") {
    return `<div class="track-note">${icon("info", 15)} Puedes calificar tu pedido cuando llegue a tu puerta.</div>`;
  }
  if (order.rating) {
    return `<div class="rate-inline" style="margin-top:12px;display:flex;width:100%;justify-content:space-between">
      <span>${starsHTML(order.rating, 13)} Tu calificación</span>
      <b>${order.rating}.0 / 5</b>
    </div>`;
  }
  return `
    <div class="card" style="margin-top:12px;display:flex;align-items:center;gap:11px">
      <div class="rate-art" style="width:48px;height:48px;border-radius:16px;font-size:23px;margin:0;animation:none">⭐</div>
      <div class="grow">
        <b style="font-family:var(--font-display);font-size:14px;display:block">¿Cómo estuvo todo?</b>
        <span class="tiny muted">Califica tu experiencia con Sabor & Punto</span>
      </div>
      <button class="btn btn-primary btn-sm" data-rate="${order.id}">Calificar</button>
    </div>`;
}

function trackCourierHTML(order) {
  if (order.courier) {
    return `
      <div class="courier-card">
        <div class="avatar">${order.courier.avatar_emoji || "🛵"}</div>
        <div class="cc-copy">
          <b>${escapeHtml(order.courier.name)}</b>
          <span>Domiciliario · ${order.courier.phone || "En camino"}</span>
        </div>
        <span class="stars" style="font-size:10px">${icon("star", 12)} 4.9</span>
        <a class="icon-btn" href="tel:${escapeHtml(order.courier.phone || "")}" aria-label="Llamar al domiciliario">${icon("phone", 18)}</a>
      </div>`;
  }
  return `
    <div class="courier-card">
      <div class="avatar">👨‍🍳</div>
      <div class="cc-copy">
        <b>Cocina Sabor & Punto</b>
        <span>Preparando tu pedido con cariño</span>
      </div>
      <span class="badge badge-warn">${icon("flame", 11)} En cocina</span>
    </div>`;
}

export async function trackingScreen({ params }) {
  let order;
  try {
    const response = await api.get(`/orders/${params.id}`);
    order = response.data;
  } catch (error) {
    toast(error.message, "error");
    navigate("orders");
    return null;
  }

  const eta = etaText(order);
  const thumbs = order.items.slice(0, 3);
  const itemsLabel =
    order.items.length > 3
      ? `${order.items.slice(0, 2).map((i) => i.name).join(", ")} +${order.items.length - 2} más`
      : order.items.map((i) => i.name).join(", ");

  const html = `
  <section class="screen screen--no-nav tracking-screen">
    <div class="top-bar">
      <button class="back-btn" data-back aria-label="Volver">${icon("chevronLeft", 21)}</button>
      <div class="grow" style="margin-left:4px">
        <h1 style="font-size:20px">Seguimiento</h1>
        <div class="sub">Pedido ${escapeHtml(order.code)}</div>
      </div>
      <span class="live-dot">En vivo</span>
    </div>

    <div class="track-hero">
      <div class="th-top">
        <span class="track-code">${escapeHtml(order.code)}</span>
        <span id="track-status">${statusBadge(order.status)}</span>
      </div>
      <div class="track-eta">
        <span class="eta-num" id="track-eta-num">${eta.num}</span>
        <div class="eta-unit">
          <b id="track-eta-label">${eta.label}</b>
          <span id="track-eta-sub">${eta.sub}</span>
        </div>
      </div>
      <div style="margin-top:12px;position:relative;z-index:1" class="tiny" id="track-live-note">
        Estimado: ${order.estimated_minutes} min · ${escapeHtml(order.address)}
      </div>
    </div>

    <div class="card" style="padding:6px 10px;margin-bottom:12px">
      <div id="track-timeline">${timelineHTML(order)}</div>
    </div>

    <div class="map-shell track-map" id="track-map">
      <div class="map-fallback">Cargando mapa en vivo…</div>
    </div>

    <div id="track-courier">${trackCourierHTML(order)}</div>

    <div class="order-mini" style="margin-top:12px">
      <div class="om-thumbs">
        ${thumbs
          .map(
            (item) =>
              `<span class="thumb">${imgHTML(item.image_url, item.emoji, item.name, "sm")}</span>`
          )
          .join("")}
      </div>
      <div class="om-copy">
        <b>${escapeHtml(itemsLabel)}</b>
        <span>${order.items_count} producto${order.items_count === 1 ? "" : "s"} · ${money(order.total)}</span>
      </div>
      <span class="badge badge-info">${PAYMENT_LABEL[order.payment_method] || "Pago"}</span>
    </div>

    <div class="track-note" style="margin-top:12px">
      ${icon("mapPin", 15)}
      <span>${escapeHtml(order.address)}${order.notes ? ` · “${escapeHtml(order.notes)}”` : ""}</span>
    </div>

    <div id="track-rating-slot">${ratingSlotHTML(order)}</div>
  </section>`;

  return {
    html,
    nav: false,
    cart: false,
    name: "tracking",
    title: "Seguimiento",
    mount(root) {
      let mapCtx = null;
      let pollId = null;
      let currentOrder = order;

      const bindRating = () => {
        root.querySelectorAll("[data-rate]").forEach((button) => {
          button.addEventListener("click", () => openRatingSheet(currentOrder));
        });
      };

      const updateUI = (nextOrder) => {
        currentOrder = nextOrder;
        const nextEta = etaText(nextOrder);
        const etaNum = root.querySelector("#track-eta-num");
        const etaLabel = root.querySelector("#track-eta-label");
        const etaSub = root.querySelector("#track-eta-sub");
        if (etaNum) etaNum.textContent = nextEta.num;
        if (etaLabel) etaLabel.textContent = nextEta.label;
        if (etaSub) etaSub.textContent = nextEta.sub;
        const statusSlot = root.querySelector("#track-status");
        if (statusSlot) statusSlot.innerHTML = statusBadge(nextOrder.status);
        const timeline = root.querySelector("#track-timeline");
        if (timeline) timeline.innerHTML = timelineHTML(nextOrder);
        const courier = root.querySelector("#track-courier");
        if (courier) courier.innerHTML = trackCourierHTML(nextOrder);
        const rating = root.querySelector("#track-rating-slot");
        if (rating) {
          rating.innerHTML = ratingSlotHTML(nextOrder);
          bindRating();
        }
        if (nextOrder.status === "entregado" && mapCtx?.markers?.courier) {
          mapCtx.markers.courier.setLatLng([nextOrder.lat, nextOrder.lng]);
        }
      };

      root.querySelector("[data-back]")?.addEventListener("click", () => navigate("orders"));

      setTimeout(() => {
        mapCtx = createTrackingMap(root.querySelector("#track-map"), order);
      }, 80);

      bindRating();

      pollId = setInterval(async () => {
        try {
          const response = await api.get(`/orders/${order.id}`);
          if (
            response.data.status !== currentOrder.status ||
            response.data.rating !== currentOrder.rating ||
            response.data.updated_at !== currentOrder.updated_at
          ) {
            const wasStatus = currentOrder.status;
            updateUI(response.data);
            if (wasStatus !== "entregado" && response.data.status === "entregado") {
              toast("¡Tu pedido llegó! Cuéntanos cómo estuvo.", "ok", 4200);
              confetti(26);
              haptic([10, 30, 10]);
            }
          }
        } catch (_) {}
      }, 6500);

      return () => {
        clearInterval(pollId);
        mapCtx?.destroy?.();
      };
    },
  };
}

/* ---------- Calificación ---------- */
const RATE_CAPTIONS = {
  1: "Uy, lo sentimos. Cuéntanos qué pasó.",
  2: "Podemos mejorar. ¿Qué falló?",
  3: "Gracias por tu honestidad.",
  4: "¡Buenísimo! Gracias por pedir.",
  5: "¡Espectacular! Vuelve pronto.",
};

export function openRatingSheet(order) {
  if (order.status !== "entregado") {
    toast("Podrás calificar cuando el pedido llegue", "warn");
    return;
  }
  if (order.rating) {
    toast("Ya calificaste este pedido", "info");
    return;
  }

  const content = `
    <div class="rate-sheet">
      <div class="rate-art">⭐</div>
      <h2>¿Cómo estuvo todo?</h2>
      <p>Tu calificación ayuda a que Sabor &amp; Punto siga mejorando.</p>
      <div class="stars-pick" id="rate-stars">
        ${[1, 2, 3, 4, 5]
          .map(
            (n) =>
              `<button class="star-btn" data-star="${n}" aria-label="${n} estrellas">${icon("star", 38)}</button>`
          )
          .join("")}
      </div>
      <div class="rate-caption" id="rate-caption">Toca las estrellas</div>
      <div class="input" style="min-height:84px;margin-top:10px;text-align:left;width:100%">
        <textarea id="rate-comment" maxlength="240" placeholder="¿Qué te gustó? ¿Qué podemos mejorar?"></textarea>
      </div>
      <button class="btn btn-primary btn-lg btn-block" id="rate-submit" disabled style="margin-top:6px">
        Enviar calificación ${icon("arrowRight", 18)}
      </button>
      <button class="btn btn-ghost btn-block" data-rate-later style="margin-top:0">Ahora no</button>
    </div>`;

  openSheet(content, {
    className: "rating-sheet",
    onMount(sheet, close) {
      let rating = 0;
      const caption = sheet.querySelector("#rate-caption");
      const submit = sheet.querySelector("#rate-submit");
      const starButtons = [...sheet.querySelectorAll("[data-star]")];

      const paint = () => {
        starButtons.forEach((button) => {
          const value = Number(button.dataset.star);
          button.classList.toggle("on", value <= rating);
        });
        caption.textContent = RATE_CAPTIONS[rating] || "Toca las estrellas";
        submit.disabled = rating === 0;
      };

      sheet.querySelector("#rate-stars").addEventListener("click", (event) => {
        const star = event.target.closest("[data-star]");
        if (!star) return;
        rating = Number(star.dataset.star);
        paint();
        haptic(8);
      });

      sheet.querySelector("[data-rate-later]").addEventListener("click", close);

      submit.addEventListener("click", async () => {
        if (!rating) return;
        setLoading(submit, true);
        try {
          await api.post(`/orders/${order.id}/rate`, {
            rating,
            comment: sheet.querySelector("#rate-comment").value.trim(),
          });
          toast("¡Gracias por tu calificación!", "ok");
          confetti(34);
          haptic(14);
          sheet.querySelector(".sheet-scroll").innerHTML = `
            <div class="rate-sheet">
              <div class="check-circle" style="width:82px;height:82px;margin-bottom:10px">
                <svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7"/></svg>
              </div>
              <h2>¡Gracias, ${escapeHtml(state.user?.name?.split(" ")[0] || "vecino")}!</h2>
              <p>Tu opinión nos ayuda a cocinar cada día mejor.</p>
              <div style="margin:6px 0 4px">${starsHTML(rating, 22)}</div>
              <button class="btn btn-primary btn-block" data-close-rated style="margin-top:10px">Listo</button>
            </div>`;
          sheet.querySelector("[data-close-rated]").addEventListener("click", () => {
            close();
            reload();
          });
        } catch (error) {
          toast(error.message, "error");
          setLoading(submit, false);
        }
      });
    },
  });
}

/* ---------- Historial de pedidos ---------- */
function orderCardHTML(order) {
  const names = order.items.map((item) => item.name);
  const summary =
    names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
  const active = !["entregado", "cancelado"].includes(order.status);
  const actions = active
    ? `<button class="btn btn-primary btn-sm" data-track="${order.id}">Seguir pedido</button>
       <button class="btn btn-ghost btn-sm" data-repeat="${order.id}">${icon("refresh", 14)} Repetir</button>`
    : `<button class="btn btn-ghost btn-sm" data-repeat="${order.id}">${icon("refresh", 14)} Repetir</button>
       ${
         order.status === "entregado"
           ? order.rating
             ? `<span class="rate-inline">${icon("star", 11)} ${order.rating}.0</span>`
             : `<button class="btn btn-soft btn-sm" data-rate="${order.id}">Calificar</button>`
           : ""
       }`;

  return `
    <article class="order-card" style="--i:0">
      <div class="order-top">
        <div>
          <div class="oc-code">${escapeHtml(order.code)}</div>
          <div class="oc-date">${timeAgo(order.created_at)} · ${formatTime(order.created_at)}</div>
        </div>
        ${statusBadge(order.status)}
      </div>
      <div class="between" style="align-items:flex-start">
        <div class="order-items-names grow">${escapeHtml(summary)}</div>
        <div class="order-thumbs">
          ${order.items
            .slice(0, 3)
            .map(
              (item) =>
                `<span class="thumb">${imgHTML(item.image_url, item.emoji, item.name, "sm")}</span>`
            )
            .join("")}
          ${order.items.length > 3 ? `<span class="more">+${order.items.length - 3}</span>` : ""}
        </div>
      </div>
      <div class="order-foot">
        <div class="order-total">${money(order.total)} <small>· ${order.items_count} prod.</small></div>
        <div class="order-actions">${actions}</div>
      </div>
    </article>`;
}

export async function ordersScreen() {
  let orders = [];
  try {
    const response = await api.get("/orders");
    orders = response.data;
  } catch (error) {
    toast(error.message, "error");
  }

  const html = `
  <section class="screen orders-screen">
    <div class="top-bar" style="margin-bottom:13px">
      <div>
        <div class="eyebrow">${icon("receipt", 12)} Tu actividad</div>
        <h1 class="page-title" style="margin-top:6px">Mis pedidos</h1>
        <p class="page-sub">Sigue tus entregas o repite tu antojo favorito.</p>
      </div>
      <button class="icon-btn" data-theme-toggle aria-label="Cambiar tema">${icon(state.theme === "dark" ? "sun" : "moon", 19)}</button>
    </div>
    <div class="segmented" id="orders-tabs" style="margin-bottom:14px">
      <button class="active" data-tab="active">En curso</button>
      <button data-tab="history">Historial</button>
    </div>
    <div id="orders-list"></div>
  </section>`;

  return {
    html,
    nav: true,
    cart: true,
    name: "orders",
    title: "Mis pedidos",
    mount(root) {
      const list = root.querySelector("#orders-list");
      const tabs = root.querySelector("#orders-tabs");
      const activeOrders = orders.filter((o) => !["entregado", "cancelado"].includes(o.status));
      const historyOrders = orders.filter((o) => ["entregado", "cancelado"].includes(o.status));

      const render = (tab) => {
        const data = tab === "active" ? activeOrders : historyOrders;
        if (!data.length) {
          list.innerHTML = emptyState({
            emoji: tab === "active" ? "🛵" : "🍽️",
            title: tab === "active" ? "No tienes pedidos en curso" : "Aún no tienes historial",
            text: tab === "active" ? "Haz tu primer pedido y síguelo en vivo." : "Cuando pidas, tus pedidos aparecerán aquí.",
            action: `<button class="btn btn-primary" data-browse-menu>${icon("menu", 18)} Explorar menú</button>`,
          });
          list.querySelector("[data-browse-menu]")?.addEventListener("click", () => navigate("menu"));
          return;
        }
        list.innerHTML = `<div class="stagger">${data.map((o, i) => orderCardHTML(o).replace('style="--i:0"', `style="--i:${i}"`)).join("")}</div>`;
        list.querySelectorAll("[data-track]").forEach((button) =>
          button.addEventListener("click", () => navigate(`tracking/${button.dataset.track}`))
        );
        list.querySelectorAll("[data-rate]").forEach((button) => {
          const order = orders.find((o) => o.id === Number(button.dataset.rate));
          if (order) button.addEventListener("click", () => openRatingSheet(order));
        });
        list.querySelectorAll("[data-repeat]").forEach((button) =>
          button.addEventListener("click", () => repeatOrder(Number(button.dataset.repeat), button))
        );
      };

      const repeatOrder = async (orderId, button) => {
        setLoading(button, true);
        try {
          const response = await api.get(`/orders/${orderId}/repeat`);
          const items = response.data;
          let added = 0;
          let missing = 0;
          for (const item of items) {
            if (!item.product_id || item.available === false) {
              missing += 1;
              continue;
            }
            addToCart(
              {
                id: item.product_id,
                name: item.name,
                price: item.price,
                emoji: item.emoji,
                image_url: item.image_url,
                available: true,
              },
              item.quantity,
              item.notes || ""
            );
            added += item.quantity;
          }
          refreshCartUI();
          if (!added) {
            toast("Los productos de ese pedido no están disponibles", "warn");
            return;
          }
          toast(
            missing
              ? `${added} productos agregados. ${missing} no estaban disponibles.`
              : "Pedido listo para repetir",
            missing ? "warn" : "ok"
          );
          openCartSheet();
        } catch (error) {
          toast(error.message, "error");
        } finally {
          setLoading(button, false);
        }
      };

      tabs.addEventListener("click", (event) => {
        const button = event.target.closest("[data-tab]");
        if (!button) return;
        tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === button));
        render(button.dataset.tab);
        haptic(5);
      });

      render("active");
    },
  };
}
