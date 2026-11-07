/* Pantallas de bienvenida, acceso y onboarding. */
import { api } from "../api.js";
import { icon } from "../icons.js";
import {
  completeOnboarding,
  homeForRole,
  loadMenu,
  needsOnboarding,
  state,
} from "../state.js";
import { escapeHtml, haptic, setLoading, toast } from "../ui.js";
import { installBannerHTML } from "../pwa.js";
import { navigate } from "../router.js";

const HERO_IMG =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1000&q=75";

let demoLoginPromise = null;

export function loginDemo(role) {
  if (demoLoginPromise) return demoLoginPromise;
  demoLoginPromise = (async () => {
    const response = await api.post(`/auth/demo/${role}`);
    state.user = response.data;
    try {
      await loadMenu();
    } catch (_) {}
    toast(response.message || "Modo demo activado", "ok");
    if (role === "client" && needsOnboarding()) {
      navigate("onboarding");
    } else {
      navigate(homeForRole(role));
    }
  })().finally(() => {
    demoLoginPromise = null;
  });
  return demoLoginPromise;
}

function themeButton() {
  const dark = state.theme === "dark";
  return `<button class="icon-btn" data-theme-toggle aria-label="Cambiar tema">
    ${icon(dark ? "sun" : "moon", 20)}
  </button>`;
}

/* ---------- Bienvenida ---------- */
export async function welcomeScreen() {
  const html = `
  <section class="welcome">
    <div class="welcome-top">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">D</div>
        <div>
          <div class="brand-name">DomiRest</div>
          <div class="brand-sub">Sabor &amp; Punto</div>
        </div>
      </div>
      ${themeButton()}
    </div>

    <div class="welcome-hero">
      <h1>El sabor de <span class="accent">Montería</span>, a tu puerta.</h1>
      <p class="welcome-sub">Comida costeña recién hecha, seguimiento en vivo y domicilios que sí llegan rápido.</p>
    </div>

    <div class="welcome-bite">
      <img src="${HERO_IMG}" alt="Bandeja paisa de Sabor & Punto" />
      <div class="bite-shade"></div>
      <div class="bite-float">${icon("star", 13)} 4.9 · 1.2k reseñas</div>
      <div class="bite-info">
        <h3>Bandeja paisa de la casa</h3>
        <p>Frijoles, chicharrón, morcilla y maduro. Como debe ser.</p>
        <span class="bite-meta">${icon("clock", 12)} 30–40 min · Envío $3.500</span>
      </div>
    </div>

    <div class="welcome-demo-tag"><span class="dot"></span> Demo interactiva · elige un rol</div>
    <div class="role-grid">
      <button class="role-card" data-demo-role="client">
        <span class="role-emoji client" aria-hidden="true">😋</span>
        <span class="role-copy"><b>Quiero pedir</b><span>Explora el menú y pide a domicilio</span></span>
        <span class="role-arrow">${icon("arrowRight", 17)}</span>
      </button>
      <button class="role-card" data-demo-role="admin">
        <span class="role-emoji admin" aria-hidden="true">👨‍🍳</span>
        <span class="role-copy"><b>Soy el restaurante</b><span>Comandas, métricas y menú</span></span>
        <span class="role-arrow">${icon("arrowRight", 17)}</span>
      </button>
      <button class="role-card" data-demo-role="courier">
        <span class="role-emoji courier" aria-hidden="true">🛵</span>
        <span class="role-copy"><b>Soy domiciliario</b><span>Rutas, entregas y disponibilidad</span></span>
        <span class="role-arrow">${icon("arrowRight", 17)}</span>
      </button>
    </div>

    ${installBannerHTML()}

    <div class="welcome-foot">
      ¿Ya tienes cuenta?
      <button data-nav-login>Inicia sesión</button>
    </div>
  </section>`;

  return {
    html,
    nav: false,
    cart: false,
    name: "welcome",
    title: "Bienvenido",
    mount(root) {
      root.querySelector("[data-nav-login]")?.addEventListener("click", () => navigate("login"));
      root.querySelectorAll("[data-demo-role]").forEach((button) => {
        button.addEventListener("click", async () => {
          if (button.disabled || demoLoginPromise) return;
          button.disabled = true;
          button.setAttribute("aria-busy", "true");
          haptic(10);
          try {
            await loginDemo(button.dataset.demoRole);
          } catch (error) {
            toast(error.message, "error");
            button.disabled = false;
            button.removeAttribute("aria-busy");
          }
        });
      });
    },
  };
}

/* ---------- Login / Registro ---------- */
export async function loginScreen() {
  const html = `
  <section class="screen screen--no-nav auth-screen">
    <div class="wrap">
      <div class="top-bar">
        <button class="back-btn" data-back-welcome aria-label="Volver">${icon("chevronLeft", 21)}</button>
        ${themeButton()}
      </div>

      <div class="auth-head">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true">D</div>
          <div>
            <div class="brand-name">DomiRest</div>
            <div class="brand-sub">Sabor &amp; Punto</div>
          </div>
        </div>
        <h1 id="auth-title">Qué bueno verte.</h1>
        <p id="auth-sub">Entra para pedir tu antojo costeño o gestionar el restaurante.</p>
      </div>

      <form class="auth-card" id="auth-form" autocomplete="on">
        <div class="field hide" id="register-fields">
          <label for="name">Nombre completo</label>
          <div class="input">
            ${icon("user", 19)}
            <input id="name" name="name" type="text" placeholder="Ej. Valentina Ríos" autocomplete="name" />
          </div>
        </div>
        <div class="field">
          <label for="email">Correo</label>
          <div class="input">
            ${icon("mail", 19)}
            <input id="email" name="email" type="email" placeholder="tucorreo@ejemplo.com" autocomplete="email" required />
          </div>
        </div>
        <div class="field">
          <label for="password">Contraseña</label>
          <div class="input">
            ${icon("lock", 19)}
            <input id="password" name="password" type="password" placeholder="Mínimo 6 caracteres" autocomplete="current-password" required />
            <button type="button" class="mini-icon" id="toggle-pass" aria-label="Mostrar contraseña" style="width:34px;height:34px">${icon("eye", 17)}</button>
          </div>
        </div>
        <div class="field hide" id="register-extra">
          <label for="phone">Teléfono</label>
          <div class="input">
            ${icon("phoneDevice", 19)}
            <input id="phone" name="phone" type="tel" placeholder="300 000 0000" autocomplete="tel" />
          </div>
          <label for="address" style="margin-top:6px">Dirección de entrega</label>
          <div class="input">
            ${icon("mapPin", 19)}
            <input id="address" name="address" type="text" placeholder="Barrio, calle y número" autocomplete="street-address" />
          </div>
        </div>
        <button class="btn btn-primary btn-block btn-lg" type="submit" id="auth-submit">
          ${icon("arrowRight", 19)} Entrar
        </button>
      </form>

      <div class="auth-switch">
        <span id="auth-switch-text">¿Aún no tienes cuenta?</span>
        <button type="button" id="auth-switch">Crear cuenta</button>
      </div>

      <div class="demo-strip">
        <div class="demo-label">Acceso rápido para la demo</div>
        <div class="demo-btns">
          <button data-demo-role="client"><span>😋</span>Cliente</button>
          <button data-demo-role="admin"><span>👨‍🍳</span>Admin</button>
          <button data-demo-role="courier"><span>🛵</span>Domiciliario</button>
        </div>
        <div class="demo-hint">cliente@saborpunto.co · Demo1234</div>
      </div>
    </div>
  </section>`;

  return {
    html,
    nav: false,
    cart: false,
    name: "login",
    title: "Iniciar sesión",
    mount(root) {
      let mode = "login";
      const form = root.querySelector("#auth-form");
      const title = root.querySelector("#auth-title");
      const sub = root.querySelector("#auth-sub");
      const registerFields = root.querySelector("#register-fields");
      const registerExtra = root.querySelector("#register-extra");
      const switchText = root.querySelector("#auth-switch-text");
      const switchButton = root.querySelector("#auth-switch");
      const submit = root.querySelector("#auth-submit");
      const password = root.querySelector("#password");

      root.querySelector("[data-back-welcome]")?.addEventListener("click", () => navigate("welcome"));

      root.querySelector("#toggle-pass")?.addEventListener("click", () => {
        password.type = password.type === "password" ? "text" : "password";
      });

      switchButton.addEventListener("click", () => {
        mode = mode === "login" ? "register" : "login";
        const isRegister = mode === "register";
        registerFields.classList.toggle("hide", !isRegister);
        registerExtra.classList.toggle("hide", !isRegister);
        title.textContent = isRegister ? "Únete a la mesa." : "Qué bueno verte.";
        sub.textContent = isRegister
          ? "Crea tu cuenta y recibe tu primer domicilio con sabor."
          : "Entra para pedir tu antojo costeño o gestionar el restaurante.";
        submit.innerHTML = isRegister
          ? `${icon("sparkles", 19)} Crear cuenta`
          : `${icon("arrowRight", 19)} Entrar`;
        switchText.textContent = isRegister ? "¿Ya tienes cuenta?" : "¿Aún no tienes cuenta?";
        switchButton.textContent = isRegister ? "Inicia sesión" : "Crear cuenta";
        root.querySelector("#name")?.focus();
      });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = {
          email: root.querySelector("#email").value.trim(),
          password: password.value,
        };
        if (mode === "register") {
          data.name = root.querySelector("#name").value.trim();
          data.phone = root.querySelector("#phone").value.trim();
          data.address = root.querySelector("#address").value.trim();
        }
        setLoading(submit, true);
        try {
          const response = await api.post(
            mode === "register" ? "/auth/register" : "/auth/login",
            data
          );
          state.user = response.data;
          try {
            await loadMenu();
          } catch (_) {}
          toast(response.message || "Bienvenido", "ok");
          haptic(12);
          const isClient = response.data.role === "client";
          if (isClient && needsOnboarding()) navigate("onboarding");
          else navigate(homeForRole(response.data.role));
        } catch (error) {
          toast(error.message, "error");
          setLoading(submit, false);
        }
      });

      root.querySelectorAll("[data-demo-role]").forEach((button) => {
        button.addEventListener("click", async () => {
          if (button.disabled || demoLoginPromise) return;
          button.disabled = true;
          button.setAttribute("aria-busy", "true");
          try {
            await loginDemo(button.dataset.demoRole);
          } catch (error) {
            toast(error.message, "error");
            button.disabled = false;
            button.removeAttribute("aria-busy");
          }
        });
      });
    },
  };
}

/* ---------- Onboarding ---------- */
export async function onboardingScreen() {
  const slides = [
    {
      emoji: "🛵",
      title: "Tu antojo costeño, a toda velocidad.",
      text: "Pide en segundos y sigue a tu domiciliario en el mapa, en tiempo real.",
      minis: [
        { cls: "a", html: `<span class="mi-dot"></span> En camino` },
        { cls: "b", html: `⏱️ 30–40 min` },
      ],
    },
    {
      emoji: "👨‍🍳",
      title: "De la cocina a tu puerta.",
      text: "Cocina costeña recién hecha por el Chef Andrés y su equipo en Montería.",
      minis: [
        { cls: "a", html: `🔥 Recién hecho` },
        { cls: "c", html: `⭐ 4.9 de 1.2k` },
      ],
    },
    {
      emoji: "🍛",
      title: "Pide, sigue y disfruta.",
      text: "Paga como prefieras, califica tu experiencia y repite tu pedido favorito.",
      minis: [
        { cls: "a", html: `📍 Montería` },
        { cls: "b", html: `🎉 Pedido confirmado` },
      ],
    },
  ];

  const slidesHtml = slides
    .map(
      (slide, index) => `
      <div class="ob-slide" data-slide="${index}">
        <div class="ob-art">
          <div class="ob-halo"></div>
          <div class="ob-halo two"></div>
          <div class="ob-emoji" aria-hidden="true">${slide.emoji}</div>
          ${slide.minis
            .map((mini) => `<div class="ob-mini ${mini.cls}">${mini.html}</div>`)
            .join("")}
        </div>
        <div class="ob-copy">
          <h2>${slide.title}</h2>
          <p>${slide.text}</p>
        </div>
      </div>`
    )
    .join("");

  const html = `
  <section class="onboarding">
    <div class="ob-top">
      <div class="brand" style="gap:8px">
        <div class="brand-mark" style="width:38px;height:38px;border-radius:12px;font-size:22px">D</div>
        <div class="brand-name" style="font-size:18px">DomiRest</div>
      </div>
      <button class="ob-skip" id="ob-skip">Saltar</button>
    </div>

    <div class="ob-viewport" id="ob-viewport">
      <div class="ob-track" id="ob-track" style="--slide:0">${slidesHtml}</div>
    </div>

    <div class="ob-bottom">
      <div class="ob-dots" id="ob-dots">
        ${slides.map((_, i) => `<button class="ob-dot ${i === 0 ? "active" : ""}" data-dot="${i}" aria-label="Paso ${i + 1}"></button>`).join("")}
      </div>
      <div class="ob-next">
        <button class="btn btn-ghost btn-icon" id="ob-prev" aria-label="Anterior" disabled>${icon("chevronLeft", 20)}</button>
        <button class="btn btn-primary" id="ob-next" style="flex:1">
          <span id="ob-next-label">Continuar</span> ${icon("arrowRight", 18)}
        </button>
      </div>
    </div>
  </section>`;

  return {
    html,
    nav: false,
    cart: false,
    name: "onboarding",
    title: "Bienvenido",
    mount(root) {
      let index = 0;
      const track = root.querySelector("#ob-track");
      const dots = [...root.querySelectorAll("[data-dot]")];
      const prev = root.querySelector("#ob-prev");
      const next = root.querySelector("#ob-next");
      const nextLabel = root.querySelector("#ob-next-label");

      const paint = () => {
        track.style.setProperty("--slide", index);
        dots.forEach((dot, i) => dot.classList.toggle("active", i === index));
        prev.disabled = index === 0;
        nextLabel.textContent = index === slides.length - 1 ? "Empezar a pedir" : "Continuar";
        next.innerHTML =
          index === slides.length - 1
            ? `<span id="ob-next-label">Empezar a pedir</span> ${icon("check", 18)}`
            : `<span id="ob-next-label">Continuar</span> ${icon("arrowRight", 18)}`;
      };

      const finish = () => {
        completeOnboarding();
        haptic(12);
        if (state.user) navigate(homeForRole(state.user.role));
        else navigate("welcome");
      };

      const go = (nextIndex) => {
        index = Math.max(0, Math.min(slides.length - 1, nextIndex));
        paint();
        haptic(6);
      };

      root.querySelector("#ob-skip").addEventListener("click", finish);
      prev.addEventListener("click", () => go(index - 1));
      next.addEventListener("click", () => {
        if (index === slides.length - 1) finish();
        else go(index + 1);
      });
      dots.forEach((dot) =>
        dot.addEventListener("click", () => go(Number(dot.dataset.dot)))
      );

      // Gesto de arrastre horizontal
      let startX = null;
      let deltaX = 0;
      const viewport = root.querySelector("#ob-viewport");
      viewport.addEventListener("pointerdown", (event) => {
        startX = event.clientX;
        deltaX = 0;
      });
      viewport.addEventListener("pointermove", (event) => {
        if (startX === null) return;
        deltaX = event.clientX - startX;
      });
      const endSwipe = () => {
        if (startX === null) return;
        if (Math.abs(deltaX) > 42) go(index + (deltaX < 0 ? 1 : -1));
        startX = null;
      };
      viewport.addEventListener("pointerup", endSwipe);
      viewport.addEventListener("pointercancel", endSwipe);

      paint();
    },
  };
}
