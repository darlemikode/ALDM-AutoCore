// Nueva orden: ya no manda a la orden en blanco con aviso; solo lleva a una
// orden existente cuando el cliente Y el vehículo elegidos coinciden.
const { test, expect } = require("@playwright/test");
const { SUFIJO, apiComo, crearTallerConAdmin, entrarAlPanel } = require("./helpers");

async function elegirCliente(page, nombre) {
  const modal = page.locator(".ecv-modal");
  await expect(modal).toBeVisible();
  await modal.locator(".buscador-select input").first().fill(nombre);
  await modal.locator(".buscador-item", { hasText: nombre }).first().click();
  await expect(modal.locator(".ecv-paso").nth(1)).toContainText("✓"); // un solo vehículo: se elige solo
  await modal.getByRole("button", { name: "Aceptar y continuar" }).click();
}

test("nueva orden: solo lleva a la abierta si cliente y vehículo coinciden", async ({ page }) => {
  const sa = await apiComo();
  const T = await crearTallerConAdmin(sa);
  const api = await apiComo(T.usuario, T.password);
  const s = SUFIJO();
  const c1 = await api.post("/clientes/", { nombre_cliente: `Repetido ${s}`, telefono1: "4771234567" });
  const v1 = await api.post("/vehiculos/", { id_cliente: c1.id_cliente, placas_vehiculo: `R${s.slice(-5)}` });
  const existente = await api.post("/servicios/", { id_cliente: c1.id_cliente, id_vehiculo: v1.id_vehiculo, nombre_servicio: "Ya abierta" });
  const c2 = await api.post("/clientes/", { nombre_cliente: `Nuevo ${s}`, telefono1: "4777654321" });
  await api.post("/vehiculos/", { id_cliente: c2.id_cliente, placas_vehiculo: `N${s.slice(-5)}` });
  // Una orden en blanco olvidada: se reutiliza sin aviso
  const blanco = await api.post("/servicios/", { nombre_servicio: "Servicio general" });

  await entrarAlPanel(page, T.usuario, T.password);
  await page.goto("/servicios");
  await page.locator(".btn-nuevo").click();
  await expect(page).toHaveURL(new RegExp(`/servicios/${blanco.id_servicio}$`));
  await expect(page.locator(".toast", { hasText: "abierta sin cliente" })).toHaveCount(0);

  // Mismo cliente + vehículo -> va a la existente y descarta la de en blanco
  await elegirCliente(page, `Repetido ${s}`);
  await expect(page).toHaveURL(new RegExp(`/servicios/${existente.id_servicio}$`));
  await expect(page.locator(".toast", { hasText: `#${existente.id_servicio}` })).toBeVisible();
  const abiertas = await api.get("/servicios/?status=abierto");
  expect(abiertas.some((o) => o.id_servicio === blanco.id_servicio)).toBe(false);

  // Otro cliente -> se queda en la orden nueva
  await page.goto("/servicios");
  await page.locator(".btn-nuevo").click();
  await expect(page).toHaveURL(/\/servicios\/\d+$/);
  const idNueva = Number(page.url().split("/").pop());
  expect(idNueva).not.toBe(existente.id_servicio);
  await elegirCliente(page, `Nuevo ${s}`);
  await expect(page.locator(".toast", { hasText: "guardados en la orden" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/servicios/${idNueva}$`));
  await api.cerrar(); await sa.cerrar();
});
