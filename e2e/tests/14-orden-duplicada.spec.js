// Nueva orden: primero se elige cliente y vehículo. Solo lleva a una orden existente
// cuando ambos coinciden; si no, crea la orden nueva (sin borradores en blanco).
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

test("nueva orden: elige primero y solo redirige si cliente y vehículo coinciden", async ({ page }) => {
  const sa = await apiComo();
  const T = await crearTallerConAdmin(sa);
  const api = await apiComo(T.usuario, T.password);
  const s = SUFIJO();
  const c1 = await api.post("/clientes/", { nombre_cliente: `Repetido ${s}`, telefono1: "4771234567" });
  const v1 = await api.post("/vehiculos/", { id_cliente: c1.id_cliente, placas_vehiculo: `R${s.slice(-5)}` });
  const existente = await api.post("/servicios/", { id_cliente: c1.id_cliente, id_vehiculo: v1.id_vehiculo, nombre_servicio: "Ya abierta" });
  const c2 = await api.post("/clientes/", { nombre_cliente: `Nuevo ${s}`, telefono1: "4777654321" });
  await api.post("/vehiculos/", { id_cliente: c2.id_cliente, placas_vehiculo: `N${s.slice(-5)}` });

  await entrarAlPanel(page, T.usuario, T.password);
  await page.goto("/servicios");
  const antes = (await api.get("/servicios/?status=abierto")).length;

  // «Nueva orden» primero pide cliente y vehículo; si se cancela no se crea nada
  await page.locator(".btn-nuevo").click();
  await expect(page.locator(".ecv-modal")).toBeVisible();
  await expect(page).toHaveURL(/\/servicios$/);
  await page.locator(".ecv-modal").getByRole("button", { name: "Cancelar" }).click();
  expect((await api.get("/servicios/?status=abierto")).length).toBe(antes);

  // Mismo cliente + vehículo -> va a la orden que ya está abierta
  await page.locator(".btn-nuevo").click();
  await elegirCliente(page, `Repetido ${s}`);
  await expect(page).toHaveURL(new RegExp(`/servicios/${existente.id_servicio}$`));
  await expect(page.locator(".toast", { hasText: `#${existente.id_servicio}` })).toBeVisible();
  expect((await api.get("/servicios/?status=abierto")).length).toBe(antes);

  // Otro cliente -> se crea una orden nueva ya con sus datos
  await page.goto("/servicios");
  await page.locator(".btn-nuevo").click();
  await elegirCliente(page, `Nuevo ${s}`);
  await expect(page.locator(".toast", { hasText: "Orden creada" })).toBeVisible();
  await expect(page).toHaveURL(/\/servicios\/\d+$/);
  const idNueva = Number(page.url().split("/").pop());
  expect(idNueva).not.toBe(existente.id_servicio);
  const nueva = await api.get(`/servicios/${idNueva}`);
  expect(nueva.id_cliente).toBe(c2.id_cliente);
  await api.cerrar(); await sa.cerrar();
});
