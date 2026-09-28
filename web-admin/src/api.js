const TOKEN_KEY = "sm_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = "GET", body, isForm = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body && !isForm) headers["Content-Type"] = "application/json";

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  let data = null;
  try {
    data = await res.json();
  } catch {
    // sin cuerpo de respuesta
  }

  if (!res.ok) {
    if (res.status === 401) {
      setToken(null);
      window.location.href = "/login";
    }
    const message = data?.detail || "Ocurrió un error inesperado";
    const error = new Error(typeof message === "string" ? message : JSON.stringify(message));
    error.status = res.status;
    throw error;
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
  postForm: (path, formData) => request(path, { method: "POST", body: formData, isForm: true }),
  put: (path, body) => request(path, { method: "PUT", body }),
  del: (path) => request(path, { method: "DELETE" }),
};

export async function login(username, password) {
  const form = new URLSearchParams();
  form.set("username", username);
  form.set("password", password);
  const res = await fetch("/api/auth/login", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || "No se pudo iniciar sesión");
  setToken(data.access_token);
  return data;
}
