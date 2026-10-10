// Usuarios: el interruptor de Estado desactiva y vuelve a activar una cuenta.
const { test, expect } = require("@playwright/test");
const { SUFIJO, apiComo, crearTallerConAdmin, entrarAlPanel } = require("./helpers");

test("usuarios: interruptor Activo / Inactivo", async ({ page }) => {
  const sa = await apiComo();
  const T = await crearTallerConAdmin(sa);
  const admin = await apiComo(T.usuario, T.password);
  const roles = await admin.get("/auth/roles");
  const nombre = `Mecánico ${SUFIJO()}`;
  const nuevo = await admin.post("/auth/usuarios", { username: `m_${SUFIJO().toLowerCase()}`, password: "secreto1", nombre_completo: nombre, id_rol: roles[0].id_rol });

  await entrarAlPanel(page, T.usuario, T.password);
  await page.goto("/usuarios");
  const fila = page.locator(".fila-tabla", { hasText: nombre });
  const sw = fila.locator(".estado-switch");
  await expect(sw).toHaveText("Activo");

  await sw.click();
  await page.getByRole("button", { name: /Desactivar|Aceptar|Confirmar|Sí/ }).last().click();
  await expect(sw).toHaveText("Inactivo");
  expect((await admin.get("/auth/usuarios")).find((u) => u.id_usuario === nuevo.id_usuario).activo).toBe(false);

  await sw.click();
  await expect(sw).toHaveText("Activo");
  expect((await admin.get("/auth/usuarios")).find((u) => u.id_usuario === nuevo.id_usuario).activo).toBe(true);

  // Tu propia cuenta no se puede apagar
  await expect(page.locator(".fila-tabla", { hasText: T.usuario }).locator(".estado-switch")).toBeDisabled();
  await page.screenshot({ path: "test-results/usuarios-estado.png", fullPage: false });
});
