// Antes de todas las pruebas: base de pruebas limpia (si Playwright levanta
// el backend) y contraseña del admin cambiada (el sistema no deja dar de
// alta clientes mientras el admin tenga la contraseña de fábrica).
const { request } = require("@playwright/test");

module.exports = async () => {
  if (/:8000\b/.test(process.env.API_URL) && !process.env.E2E_PERMITIR_8000) {
    throw new Error("Alto: API_URL apunta al puerto 8000 (servidor normal). Usa una base de pruebas o E2E_PERMITIR_8000=1 si de verdad es de pruebas.");
  }
  const password = process.env.E2E_PASSWORD || "E2E-Pass2026";
  process.env.E2E_PASSWORD = password;
  const api = await request.newContext({ baseURL: process.env.API_URL.replace(/\/$/, "") + "/" });
  const intento = await api.post("auth/login", { form: { username: "admin", password } });
  if (intento.ok()) return;
  const fabrica = await api.post("auth/login", { form: { username: "admin", password: "admin1234" } });
  if (!fabrica.ok()) throw new Error("No se pudo entrar como admin (ni con E2E_PASSWORD ni con la de fábrica).");
  const { access_token } = await fabrica.json();
  const r = await api.put("auth/password", {
    headers: { Authorization: `Bearer ${access_token}` },
    data: { password_actual: "admin1234", password_nueva: password },
  });
  if (!r.ok()) throw new Error("No se pudo cambiar la contraseña del admin: " + (await r.text()));
};
