import { icon } from "./icons.js";
import { escapeHtml, openSheet, toast } from "./ui.js";

let deferredPrompt = null;
let installed = false;
let bound = false;

export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    window.navigator.standalone === true
  );
}

export function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function appUrl() {
  const url = new URL(".", window.location.href);
  url.hash = "";
  url.search = "";
  return url.href;
}

export function installBannerHTML() {
  return `
    <div class="install-banner" data-install-banner hidden>
      <span class="install-badge">${icon("download", 20)}</span>
      <span class="install-copy">
        <b>Instala DomiRest</b>
        <span>Acceso directo, pantalla completa y lista sin conexión.</span>
      </span>
      <button class="btn btn-primary btn-xs" type="button" data-install-app>Instalar</button>
    </div>`;
}

function canPromptInstall() {
  return Boolean(deferredPrompt);
}

export function refreshInstallBanners() {
  const show = !installed && !isStandalone();
  document.querySelectorAll("[data-install-banner]").forEach((banner) => {
    banner.hidden = !show;
    const button = banner.querySelector("[data-install-app]");
    if (!button) return;
    button.textContent = canPromptInstall() ? "Instalar" : isIOS() ? "Cómo instalar" : "Ver guía";
  });
}

export function openInstallGuide() {
  const ios = isIOS();
  const steps = ios
    ? [
        "Abre DomiRest en Safari (en iPhone o iPad).",
        "Toca el botón Compartir de la barra inferior.",
        "Elige “Agregar a pantalla de inicio”.",
        "Toca “Agregar” y abre DomiRest como una app.",
      ]
    : [
        "Abre el menú del navegador (⋮ o ≡).",
        "Elige “Instalar app” o “Agregar a pantalla de inicio”.",
        "Confirma la instalación y abre DomiRest desde tu inicio.",
        "Si no aparece, actualiza la página y vuelve a intentarlo.",
      ];

  const content = `
    <div class="sheet-head">
      <div>
        <div class="eyebrow">${icon("download", 12)} Instalación</div>
        <h2>Instala DomiRest</h2>
      </div>
      <button class="icon-btn" data-close-install aria-label="Cerrar">${icon("x", 19)}</button>
    </div>
    <p class="tiny muted" style="margin:-4px 0 14px">
      ${ios ? "En iPhone y iPad la instalación se hace desde Safari." : "DomiRest se abre como una app, sin tienda de aplicaciones."}
    </p>
    <div class="install-guide">
      ${steps
        .map(
          (step, index) => `
        <div class="install-step">
          <span>${index + 1}</span>
          <p>${step}</p>
        </div>`
        )
        .join("")}
    </div>
    <button class="btn btn-primary btn-block" data-try-install style="margin-top:16px">
      ${icon("download", 18)} ${canPromptInstall() ? "Instalar ahora" : "Entendido"}
    </button>`;

  openSheet(content, {
    onMount(sheet, close) {
      sheet.querySelector("[data-close-install]").addEventListener("click", close);
      sheet.querySelector("[data-try-install]").addEventListener("click", async () => {
        if (canPromptInstall()) {
          close();
          await promptInstall();
        } else {
          close();
        }
      });
    },
  });
}

async function promptInstall() {
  if (!deferredPrompt) {
    openInstallGuide();
    return;
  }
  const prompt = deferredPrompt;
  deferredPrompt = null;
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice?.outcome === "accepted") {
      installed = true;
      toast("DomiRest se está instalando", "ok");
    }
  } catch (_) {
    toast("No se pudo abrir la instalación. Usa el menú del navegador.", "warn");
  }
  refreshInstallBanners();
}

/** Abre el instalador nativo o, si no está disponible, la guía paso a paso. */
export async function installApp() {
  if (canPromptInstall()) await promptInstall();
  else openInstallGuide();
}

export async function copyAppLink(url = appUrl()) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch (_) {}
  try {
    const field = document.createElement("textarea");
    field.value = url;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    return copied;
  } catch (_) {
    return false;
  }
}

async function nativeShare(url) {
  if (!navigator.share) return false;
  try {
    await navigator.share({
      title: "DomiRest · Sabor & Punto",
      text: "Pide comida costeña y sigue tu domicilio en vivo.",
      url,
    });
    return true;
  } catch (error) {
    return error?.name === "AbortError";
  }
}

function qrHTML(url) {
  try {
    if (typeof window.qrcode !== "function") return "";
    const qr = window.qrcode(0, "M");
    qr.addData(url);
    qr.make();
    return qr.createSvgTag({
      cellSize: 6,
      margin: 4,
      scalable: true,
      alt: "Código QR de DomiRest",
      title: "DomiRest",
    });
  } catch (_) {
    return "";
  }
}

export function openShareSheet(url = appUrl()) {
  const qr = qrHTML(url);
  const content = `
    <div class="sheet-head">
      <div>
        <div class="eyebrow">${icon("share", 12)} Compartir</div>
        <h2>Comparte DomiRest</h2>
      </div>
      <button class="icon-btn" data-close-share aria-label="Cerrar">${icon("x", 19)}</button>
    </div>
    <p class="tiny muted" style="margin:-4px 0 14px">
      Escanea el QR o envía el enlace para abrir la demo en otro celular.
    </p>
    <div class="share-card">
      ${qr ? `<div class="qr-wrap" aria-label="Código QR de DomiRest">${qr}</div>` : ""}
      <code class="share-url">${escapeHtml(url)}</code>
    </div>
    <div class="share-actions">
      <button class="btn btn-primary" data-share-native>${icon("share", 18)} Compartir</button>
      <button class="btn btn-ghost" data-copy-link>${icon("check", 18)} Copiar enlace</button>
    </div>`;

  openSheet(content, {
    onMount(sheet, close) {
      sheet.querySelector("[data-close-share]").addEventListener("click", close);
      sheet.querySelector("[data-share-native]").addEventListener("click", async () => {
        const shared = await nativeShare(url);
        if (!shared) {
          const copied = await copyAppLink(url);
          toast(copied ? "Enlace copiado" : "Copia el enlace manualmente", copied ? "ok" : "info");
        }
      });
      sheet.querySelector("[data-copy-link]").addEventListener("click", async () => {
        const copied = await copyAppLink(url);
        toast(copied ? "Enlace copiado" : "Copia el enlace manualmente", copied ? "ok" : "info");
      });
    },
  });
}

export async function shareApp() {
  const url = appUrl();
  if (await nativeShare(url)) return;
  const copied = await copyAppLink(url);
  toast(
    copied ? "Enlace copiado. También puedes escanear el QR." : "Comparte este enlace o escanea el QR.",
    copied ? "ok" : "info",
    4500
  );
  openShareSheet(url);
}

export function initPwa() {
  if (bound) return;
  bound = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    refreshInstallBanners();
  });

  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredPrompt = null;
    refreshInstallBanners();
    toast("DomiRest quedó instalada", "ok");
  });

  window.addEventListener("domirest:route", refreshInstallBanners);

  window.matchMedia("(display-mode: standalone)").addEventListener?.("change", () => {
    refreshInstallBanners();
  });

  document.addEventListener("click", (event) => {
    const install = event.target.closest("[data-install-app]");
    if (install) {
      event.preventDefault();
      if (canPromptInstall()) promptInstall();
      else openInstallGuide();
    }
  });

  refreshInstallBanners();
}
