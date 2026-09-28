const { test, expect } = require("@playwright/test");
const { SUFIJO, apiComo, crearTallerConAdmin, entrarAlPanel, enlaceMenu } = require("./helpers");

test.describe("QR del taller y permisos por rol", () => {
  test("Datos del taller muestra el QR con el código del taller", async ({ page }) => {
    const sa = await apiComo();
    const { taller, usuario, password } = await crearTallerConAdmin(sa);
    await entrarAlPanel(page, usuario, password);
    await page.goto("/configuracion-taller");
    const qr = page.locator(".qr-taller");
    await expect(qr.locator("canvas")).toBeVisible();
    await expect(qr.locator(".qr-taller-codigo")).toHaveText(taller.codigo);
    const alto = await qr.locator("canvas").evaluate((c) => c.height);
    expect(alto).toBeGreaterThan(100);
    await sa.cerrar();
  });

  test("un Asesor no ve Catálogos, Proveedores ni Configuración de roles", async ({ page }) => {
    const sa = await apiComo();
    const s = SUFIJO();
    const { taller } = await crearTallerConAdmin(sa);
    const roles = await sa.get(`/superadmin/talleres/${taller.id_taller}/roles`);
    const asesor = roles.find((r) => r.nombre.startsWith("Asesor"));
    const usuario = `asesor_${s.toLowerCase()}`;
    await sa.post("/superadmin/usuarios", {
      username: usuario, password: "asesor123", nombre_completo: "Asesor E2E",
      membresias: [{ id_taller: taller.id_taller, id_rol: asesor.id_rol }],
    });
    await entrarAlPanel(page, usuario, "asesor123");
    await expect(enlaceMenu(page, "Órdenes de servicio")).toBeVisible();
    await expect(enlaceMenu(page, "Proveedores")).toHaveCount(0);
    await page.goto("/catalogos");
    await expect(page).not.toHaveURL(/\/catalogos/);
    await page.goto("/roles");
    await expect(page).not.toHaveURL(/\/roles$/);
    await sa.cerrar();
  });
});
