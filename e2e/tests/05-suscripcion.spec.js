const { test, expect } = require("@playwright/test");
const { apiComo, crearTallerConAdmin, entrarAlPanel, enlaceMenu, paquete } = require("./helpers");

const dias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

test.describe("Suscripción del taller", () => {
  test("por vencer muestra aviso; en gracia solo consulta; vencida bloquea; al renovar vuelve", async ({ page }) => {
    const sa = await apiComo();
    const { taller, usuario, password } = await crearTallerConAdmin(sa);
    const ruta = `/superadmin/talleres/${taller.id_taller}/suscripcion`;

    await sa.put(ruta, { estado: "activa", fecha_vencimiento: dias(2) });
    await entrarAlPanel(page, usuario, password);
    await expect(page.locator(".aviso-suscripcion")).toContainText(/vence/i);

    await sa.put(ruta, { fecha_vencimiento: dias(-1) });
    await page.reload();
    await expect(page.locator(".aviso-suscripcion-grave")).toContainText(/Solo puedes consultar/i);

    await sa.put(ruta, { fecha_vencimiento: dias(-60) });
    await page.reload();
    await expect(page.locator(".bloqueo-suscripcion")).toContainText(/suspendido|venció/i);

    const tipos = await sa.get("/superadmin/tipos-cobro");
    await sa.post(`/superadmin/talleres/${taller.id_taller}/renovar`, { id_tipo_cobro: tipos[0].id_tipo_cobro, metodo_pago: "transferencia" });
    await page.reload();
    await expect(page.getByRole("heading", { name: /Panel general/ })).toBeVisible();
    await expect(page.locator(".bloqueo-suscripcion")).toHaveCount(0);
    await sa.cerrar();
  });

  test("el menú solo muestra los módulos del paquete contratado", async ({ page }) => {
    test.setTimeout(90_000);
    const sa = await apiComo();
    const basico = await paquete(sa, "Básico");
    test.skip(!basico || basico.modulos.some((m) => m.clave === "proveedores"), "El paquete Básico ya incluye Proveedores en esta base");
    const { taller, usuario, password } = await crearTallerConAdmin(sa, { paqueteNombre: "Básico" });

    await entrarAlPanel(page, usuario, password);
    await expect(enlaceMenu(page, "Clientes")).toBeVisible();
    await expect(enlaceMenu(page, "Proveedores")).toHaveCount(0);
    await page.goto("/proveedores");
    await expect(page).not.toHaveURL(/\/proveedores/);

    const premium = await paquete(sa);
    await sa.put(`/superadmin/talleres/${taller.id_taller}/suscripcion`, { id_paquete: premium.id_paquete });
    await page.goto("/");
    await page.reload();
    await expect(enlaceMenu(page, "Proveedores")).toBeVisible();
    await sa.cerrar();
  });
});
