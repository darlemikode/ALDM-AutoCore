const { test, expect } = require("@playwright/test");
const { apiComo, crearTallerConAdmin, entrarAlPanel } = require("./helpers");

test("Integraciones: generar una llave la muestra una sola vez y se puede revocar", async ({ page }) => {
  const sa = await apiComo();
  const T = await crearTallerConAdmin(sa);
  await entrarAlPanel(page, T.usuario, T.password);
  await page.goto("/integraciones");
  await page.getByRole("button", { name: /Generar llave/ }).click();
  const llave = page.locator(".integ-llave");
  await expect(llave).toContainText(/^aldm_/);
  const completa = (await llave.textContent()).trim();
  await page.getByRole("button", { name: "Ya la guardé" }).click();
  await expect(page.locator(".integ-tabla")).toContainText(completa.slice(0, 12));
  await expect(page.locator(".main")).not.toContainText(completa);
  await page.getByRole("button", { name: "Revocar" }).click();
  await page.getByRole("button", { name: /Sí, continuar/ }).click();
  await expect(page.locator(".integ-tabla")).toContainText("Revocada");
  await sa.cerrar();
});
