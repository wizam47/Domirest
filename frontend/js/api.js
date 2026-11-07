/* Cliente HTTP de la API de DomiRest. */
export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function request(path, { method = "GET", body, signal } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      signal,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError("No hay conexión con el servidor", 0, null);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {
    /* respuesta sin JSON */
  }

  if (!response.ok || payload?.ok === false) {
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent("domirest:unauthorized"));
    }
    throw new ApiError(
      payload?.error || "Ocurrió un error inesperado",
      response.status,
      payload
    );
  }
  return payload;
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: "GET" }),
  post: (path, body, opts) => request(path, { ...opts, method: "POST", body }),
  put: (path, body, opts) => request(path, { ...opts, method: "PUT", body }),
  patch: (path, body, opts) => request(path, { ...opts, method: "PATCH", body }),
  del: (path, opts) => request(path, { ...opts, method: "DELETE" }),
};
