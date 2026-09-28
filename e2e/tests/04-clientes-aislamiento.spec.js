const { test, expect } = require("@playwright/test");
const { SUFIJO, apiComo, crearTallerConAdmin, campo, entrarAlPanel } = require("./helpers");

test.describe("Clientes y aislamiento entre talleres", () => {
  test("un cliente dado de alta en un taller no aparece en otro", async ({ page }) => {
    const sa = await apiComo();
    const s = SUFIJO();
    const A = await crearTallerConAdmin(sa);
    const B = await crearTallerConAdmin(sa);
    const nombre = `Cliente E2E ${s}`;

    await entrarAlPanel(page, A.usuario, A.password);
    await page.goto("/clientes");
    await page.getByRole("button", { name: /Nuevo cliente/ }).click();
    await campo(page, "Nombres").fill(nombre);
    await campo(page, "Teléfono principal").fill("4771234567");
    await page.getByRole("button", { name: /Guardar/ }).click();
    // Tras guardar ofrece registrar su vehículo
    await page.getByRole("button", { name: "Ahora no" }).click();
    await page.getByPlaceholder(/Buscar por nombre/).fill(s);
    await expect(page.locator(".main")).toContainText(nombre);

    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await entrarAlPanel(page, B.usuario, B.password);
    await page.goto("/clientes");
    await expect(page.getByRole("heading", { name: /Clientes/ })).toBeVisible();
    await expect(page.locator(".main")).not.toContainText(nombre);
    await sa.cerrar();
  });
});
