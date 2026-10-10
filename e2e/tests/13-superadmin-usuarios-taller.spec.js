// Súper admin · Usuarios: filtro por taller (y búsqueda por nombre del taller).
const { test, expect } = require("@playwright/test");
const { apiComo, crearTallerConAdmin, entrarAlPanel } = require("./helpers");

test("súper admin: filtrar usuarios por taller", async ({ page }) => {
  const sa = await apiComo();
  const A = await crearTallerConAdmin(sa);
  const B = await crearTallerConAdmin(sa);
  const nombreA = A.taller.nombre_comercial;

  await entrarAlPanel(page, "admin", process.env.E2E_PASSWORD);
  await page.goto("/superadmin/usuarios");
  const filas = page.locator(".sa-tabla tbody tr");
  await expect(filas.filter({ hasText: `@${A.usuario}` })).toHaveCount(1);
  await expect(filas.filter({ hasText: `@${B.usuario}` })).toHaveCount(1);

  await page.locator(".sa-filtro-taller").selectOption({ label: nombreA });
  await expect(filas.filter({ hasText: `@${A.usuario}` })).toHaveCount(1);
  await expect(filas.filter({ hasText: `@${B.usuario}` })).toHaveCount(0);
  for (const t of await filas.locator("td:nth-child(2)").allTextContents()) expect(t).toContain(nombreA);
  await expect(page.locator(".sa-conteo")).toContainText("de");
  await page.screenshot({ path: "test-results/superadmin-filtro-taller.png" });

  // Todos de nuevo + búsqueda por nombre del taller
  await page.locator(".sa-filtro-taller").selectOption("");
  await page.locator(".search-input").fill(B.taller.nombre_comercial);
  await expect(filas.filter({ hasText: `@${B.usuario}` })).toHaveCount(1);
  await expect(filas.filter({ hasText: `@${A.usuario}` })).toHaveCount(0);
});
