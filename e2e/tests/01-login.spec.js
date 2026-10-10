const { test, expect } = require("@playwright/test");
const { apiComo, crearTallerConAdmin, campo, entrar, tallerActual } = require("./helpers");

test.describe("Inicio de sesión", () => {
  test("usuario o contraseña incorrectos muestra el error", async ({ page }) => {
    await entrar(page, "no_existe_e2e", "malamala");
    await expect(page.locator(".error-text")).toContainText(/incorrectos/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test("el admin entra al panel de su taller y puede salir", async ({ page }) => {
    const sa = await apiComo();
    const { taller, usuario, password } = await crearTallerConAdmin(sa);
    await entrar(page, usuario, password);
    await expect(page.getByRole("heading", { name: /Panel general/ })).toBeVisible();
    await expect(tallerActual(page)).toHaveText(taller.nombre_comercial);
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.getByRole("button", { name: "Sí, salir" }).click();
    await expect(page).toHaveURL(/\/login/);
    await sa.cerrar();
  });

  test("un usuario desactivado ya no entra", async ({ page }) => {
    const sa = await apiComo();
    const { usuario, password } = await crearTallerConAdmin(sa);
    const u = (await sa.get(`/superadmin/usuarios?q=${usuario}`))[0];
    await sa.put(`/superadmin/usuarios/${u.id_usuario}`, { activo: false });
    await entrar(page, usuario, password);
    await expect(page.locator(".error-text")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await sa.cerrar();
  });

  test("recuperar contraseña avisa al administrador @celular", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "¿Olvidaste tu contraseña?" }).click();
    await campo(page, "Usuario, correo o teléfono").fill("alguien_e2e");
    await page.getByRole("button", { name: "Avisar al administrador" }).click();
    await expect(page.locator(".recovery-msg")).toContainText(/administra/i);
  });
});
