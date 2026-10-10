const { test, expect } = require("@playwright/test");
const { SUFIJO, apiComo, paquete, campo, entrar, tallerActual } = require("./helpers");

test.describe("Primera vez: el dueño activa su taller", () => {
  test("con el código de activación crea su usuario y entra; el código ya no sirve otra vez", async ({ page }) => {
    const sa = await apiComo();
    const s = SUFIJO();
    const p = await paquete(sa);
    const taller = await sa.post("/superadmin/talleres", { nombre_comercial: `E2E Activar ${s}`, id_paquete: p.id_paquete, en_prueba: true });
    expect(taller.pendiente_activacion).toBeTruthy();

    await page.addInitScript(() => { try { localStorage.setItem("sm_sin_tutoriales", "1"); } catch (e) { /* nada */ } });
    await page.goto("/login");
    await page.getByRole("button", { name: "¿Primera vez? Activa tu taller" }).click();
    await campo(page, "Código del taller").fill(taller.codigo);
    await campo(page, "Código de activación").fill("MALO2345");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.locator(".error-text")).toContainText(/no son correctos/i);

    await campo(page, "Código de activación").fill(taller.codigo_activacion.toLowerCase());
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.locator(".recovery-msg")).toContainText(taller.nombre_comercial);

    const usuario = `duenio_${s.toLowerCase()}`;
    await campo(page, "Nombre completo").fill("Dueño E2E");
    await campo(page, "Usuario").fill(usuario);
    await campo(page, "Contraseña").fill("dueno123");
    await campo(page, "Confirmar contraseña").fill("otra123");
    await page.getByRole("button", { name: "Crear mi usuario y entrar" }).click();
    await expect(page.locator(".error-text")).toContainText(/no coinciden/i);

    await campo(page, "Confirmar contraseña").fill("dueno123");
    await page.getByRole("button", { name: "Crear mi usuario y entrar" }).click();
    await expect(page.getByRole("heading", { name: /Panel general/ })).toBeVisible();
    await expect(tallerActual(page)).toHaveText(taller.nombre_comercial);

    const actualizado = await sa.get(`/superadmin/talleres/${taller.id_taller}`);
    expect(actualizado.pendiente_activacion).toBeFalsy();

    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.getByRole("button", { name: "Sí, salir" }).click();
    await page.getByRole("button", { name: "¿Primera vez? Activa tu taller" }).click();
    await campo(page, "Código del taller").fill(taller.codigo);
    await campo(page, "Código de activación").fill(taller.codigo_activacion);
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.locator(".error-text")).toBeVisible();

    await page.getByRole("button", { name: "← Volver a iniciar sesión" }).click();
    await entrar(page, usuario, "dueno123");
    await expect(tallerActual(page)).toHaveText(taller.nombre_comercial);
    await sa.cerrar();
  });
});
