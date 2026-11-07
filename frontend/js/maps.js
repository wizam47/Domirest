/* Mapas con Leaflet + OpenStreetMap (sin API key). */
export const RESTAURANT = { lat: 8.7480, lng: -75.8814, label: "Sabor & Punto" };
const MONTERIA = { lat: 8.7480, lng: -75.8814 };

export function mapAvailable() {
  return Boolean(window.L);
}

function baseMap(el, { center = MONTERIA, zoom = 14, interactive = true } = {}) {
  if (!mapAvailable() || !el) return null;
  const map = window.L.map(el, {
    center: [center.lat, center.lng],
    zoom,
    zoomControl: false,
    attributionControl: true,
    dragging: interactive,
    scrollWheelZoom: false,
    touchZoom: interactive,
    doubleClickZoom: interactive,
  });
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  }).addTo(map);
  requestAnimationFrame(() => map.invalidateSize());
  return map;
}

function pinIcon(emoji, cls = "") {
  return window.L.divIcon({
    html: `<div class="map-pin ${cls}">${emoji}</div>`,
    className: "map-pin-wrap",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

export function addRoute(map, from, to, { color = "#FF5A36" } = {}) {
  if (!map) return { points: [], total: 0 };
  const dx = to.lng - from.lng;
  const dy = to.lat - from.lat;
  const bend = Math.max(0.0008, Math.hypot(dx, dy) * 0.16);
  const points = [
    [from.lat, from.lng],
    [from.lat + dy * 0.24 + bend, from.lng + dx * 0.2 - bend],
    [from.lat + dy * 0.55 - bend * 0.4, from.lng + dx * 0.52 + bend * 0.6],
    [from.lat + dy * 0.82 + bend * 0.5, from.lng + dx * 0.8 - bend * 0.3],
    [to.lat, to.lng],
  ];
  const shadow = window.L.polyline(points, {
    color: "#1F1B2D",
    weight: 10,
    opacity: 0.1,
    lineCap: "round",
  }).addTo(map);
  const line = window.L.polyline(points, {
    color,
    weight: 4,
    opacity: 0.9,
    dashArray: "1 9",
    lineCap: "round",
  }).addTo(map);
  const group = window.L.featureGroup([shadow, line]);
  map.fitBounds(group.getBounds(), { padding: [38, 38] });
  return { points, line, shadow };
}

export function addMarkers(map, order) {
  if (!map) return {};
  const restaurant = window.L.marker([RESTAURANT.lat, RESTAURANT.lng], {
    icon: pinIcon("🏪", "rest"),
    title: "Sabor & Punto",
  }).addTo(map);
  const home = window.L.marker([order.lat, order.lng], {
    icon: pinIcon("🏠", "home"),
    title: "Tu dirección",
  }).addTo(map);
  let courier = null;
  if (["en_camino", "listo", "preparando", "recibido"].includes(order.status)) {
    courier = window.L.marker([RESTAURANT.lat, RESTAURANT.lng], {
      icon: pinIcon("🛵", "courier"),
      zIndexOffset: 500,
      title: "Domiciliario",
    }).addTo(map);
  }
  return { restaurant, home, courier };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function pointAlong(points, progress) {
  if (!points.length) return [RESTAURANT.lat, RESTAURANT.lng];
  const t = Math.min(0.9999, Math.max(0, progress));
  const scaled = t * (points.length - 1);
  const index = Math.floor(scaled);
  const local = scaled - index;
  const a = points[index];
  const b = points[Math.min(points.length - 1, index + 1)];
  return [lerp(a[0], b[0], local), lerp(a[1], b[1], local)];
}

/* Mueve la moto por la ruta simulada. Devuelve función para detener. */
export function animateCourier(map, marker, points, options = {}) {
  if (!map || !marker || !points.length) return () => {};
  const { start = 0.28, duration = 84000, end = 0.96, onTick } = options;
  let rafId = null;
  let startTime = null;
  let stopped = false;

  const step = (now) => {
    if (stopped) return;
    if (startTime === null) startTime = now;
    const t = Math.min(1, (now - startTime) / duration);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const progress = start + (end - start) * eased;
    const [lat, lng] = pointAlong(points, progress);
    marker.setLatLng([lat, lng]);
    onTick?.(progress);
    if (t < 1) rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);

  return () => {
    stopped = true;
    if (rafId) cancelAnimationFrame(rafId);
  };
}

export function createTrackingMap(el, order) {
  if (!mapAvailable() || !el) {
    if (el) {
      el.innerHTML = `<div class="map-fallback">${order ? "Mapa no disponible sin conexión. La ruta se actualiza igual." : "Mapa no disponible"}</div>`;
    }
    return { destroy() {} };
  }
  const map = baseMap(el, {
    center: {
      lat: (RESTAURANT.lat + order.lat) / 2,
      lng: (RESTAURANT.lng + order.lng) / 2,
    },
    zoom: 14,
    interactive: true,
  });
  if (!map) return { destroy() {} };
  const route = addRoute(map, RESTAURANT, { lat: order.lat, lng: order.lng });
  const markers = addMarkers(map, order);
  let lastProgress = 0;

  const onStatus = () => {};

  let stopAnimation = () => {};
  if (markers.courier) {
    if (order.status === "en_camino") {
      stopAnimation = animateCourier(map, markers.courier, route.points, {
        start: 0.24,
        duration: 105000,
        end: 0.96,
        onTick: (p) => (lastProgress = p),
      });
    } else {
      const [lat, lng] = pointAlong(route.points, 0.06);
      markers.courier.setLatLng([lat, lng]);
    }
  }

  setTimeout(() => map.invalidateSize(), 250);

  return {
    map,
    route,
    markers,
    getProgress: () => lastProgress,
    destroy() {
      stopAnimation();
      map.remove();
    },
  };
}

/* Mapa del checkout con pin arrastrable. */
export function createPickerMap(el, { lat, lng, onChange } = {}) {
  if (!mapAvailable() || !el) {
    if (el) el.innerHTML = `<div class="map-fallback">Mapa no disponible sin conexión. Puedes escribir la dirección.</div>`;
    return { setPosition() {}, destroy() {} };
  }
  const map = baseMap(el, { center: { lat, lng }, zoom: 15, interactive: true });
  if (!map) return { setPosition() {}, destroy() {} };
  const marker = window.L.marker([lat, lng], {
    icon: pinIcon("📍", "home"),
    draggable: true,
  }).addTo(map);

  const radius = window.L.circle([lat, lng], {
    radius: 420,
    color: "#FF5A36",
    weight: 1,
    opacity: 0.28,
    fillColor: "#FFB627",
    fillOpacity: 0.08,
  }).addTo(map);

  const emit = (position) => {
    radius.setLatLng(position);
    onChange?.({ lat: position.lat, lng: position.lng });
  };

  marker.on("dragend", () => emit(marker.getLatLng()));
  map.on("click", (event) => {
    marker.setLatLng(event.latlng);
    emit(event.latlng);
  });

  setTimeout(() => map.invalidateSize(), 250);

  return {
    map,
    marker,
    setPosition(nextLat, nextLng) {
      marker.setLatLng([nextLat, nextLng]);
      radius.setLatLng([nextLat, nextLng]);
      map.setView([nextLat, nextLng], map.getZoom());
      onChange?.({ lat: nextLat, lng: nextLng });
    },
    destroy() {
      map.remove();
    },
  };
}
