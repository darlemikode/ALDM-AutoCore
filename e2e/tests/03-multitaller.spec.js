const { test, expect } = require("@playwright/test");
const { SUFIJO, apiComo, crearTallerConAdmin, entrar, tallerActual } = require("./helpers");

test.describe("Usuario con acceso a varios talleres", () => {
  test("elige el taller al entrar y puede cambiarse después", async ({ page }) => {
    const sa = await apiComo();
    const s = SUFIJO();
    const { taller: A } = await crearTallerConAdmin(sa, { nombre: `E2E Norte ${s}` });
    const { taller: B } = await crearTallerConAdmin(sa, { nombre: `E2E Sur ${s}` });
    const usuario = `multi_${s.toLowerCase()}`;
    await sa.post("/superadmin/usuarios", {
      username: usuario, password: "multi123", nombre_completo: "Multi E2E",
      membresias: [{ id_taller: A.id_taller }, { id_taller: B.id_taller }],
    });

    await entrar(page, usuario, "multi123");
    const selector = page.locator(".selector-taller");
    await expect(selector).toBeVisible();
    await expect(selector.locator(".selector-taller-item")).toHaveCount(2);
    await selector.getByRole("button", { name: new RegExp(`E2E Sur ${s}`) }).click();
    await expect(tallerActual(page)).toHaveText(B.nombre_comercial);
    await expect(selector).toBeHidden();

    await page.locator(".taller-actual-cambiar").click();
    await page.locator(".selector-taller").getByRole("button", { name: new RegExp(`E2E Norte ${s}`) }).click();
    await expect(tallerActual(page)).toHaveText(A.nombre_comercial);
    await sa.cerrar();
  });

  test("un usuario de un solo taller entra directo, sin selector", async ({ page }) => {
    const sa = await apiComo();
    const { taller, usuario, password } = await crearTallerConAdmin(sa);
    await entrar(page, usuario, password);
    await expect(tallerActual(page)).toHaveText(taller.nombre_comercial);
    await expect(page.locator(".selector-taller")).toHaveCount(0);
    await expect(page.locator(".taller-actual-cambiar")).toHaveCount(0);
    await sa.cerrar();
  });
});

test.describe("En celular", () => {
  test("entra, abre el menú ☰ y ve su taller y la campana @solo-celular", async ({ page }) => {
    const sa = await apiComo();
    const { taller, usuario, password } = await crearTallerConAdmin(sa);
    await entrar(page, usuario, password);
    await expect(page.locator(".topbar-movil")).toBeVisible();
    await expect(page.locator(".campana-flotante")).toBeVisible();
    await page.getByTitle("Abrir menú").click();
    await expect(tallerActual(page)).toHaveText(taller.nombre_comercial);
    await sa.cerrar();
  });
});
