// Orden de servicio: lo agregado en la v0.2 (fechas, abonos, refacciones,
// búsqueda sin acentos, datos del taller, nota en PDF y WhatsApp).
const { test, expect } = require("@playwright/test");
const { SUFIJO, apiComo, crearTallerConAdmin, entrarAlPanel } = require("./helpers");

async function prepararOrden() {
  const sa = await apiComo();
  const T = await crearTallerConAdmin(sa);
  const api = await apiComo(T.usuario, T.password);
  const s = SUFIJO();
  const cliente = await api.post("/clientes/", { nombre_cliente: `Cliente ${s}`, telefono1: "4771234567" });
  const vehiculo = await api.post("/vehiculos/", { id_cliente: cliente.id_cliente, placas_vehiculo: `E2E${s.slice(-4)}` });
  const orden = await api.post("/servicios/", { id_cliente: cliente.id_cliente, id_vehiculo: vehiculo.id_vehiculo, nombre_servicio: "Afinación E2E" });
  return { sa, T, api, s, cliente, vehiculo, orden };
}

test.describe("Orden de servicio (v0.2)", () => {
  test("refacciones: búsqueda sin acentos y sin duplicados", async () => {
    const { sa, api, s } = await prepararOrden();
    const nombre = `Rótula ${s}`;
    await api.post("/refacciones/", { nombre_refaccion: nombre, categoria: "Suspensión" });
    const hallados = await api.get(`/refacciones/?q=${encodeURIComponent(`rotula ${s}`.toLowerCase())}`);
    expect(hallados.map((r) => r.nombre_refaccion)).toContain(nombre);
    // Mismo nombre en minúsculas y sin acento, misma categoría -> rechazado
    await expect(api.post("/refacciones/", { nombre_refaccion: `rotula ${s}`.toLowerCase(), categoria: "Suspension" })).rejects.toThrow(/400.*ya existe/);
    // En otra categoría sí se permite
    await api.post("/refacciones/", { nombre_refaccion: nombre, categoria: "Dirección" });
    await api.cerrar(); await sa.cerrar();
  });

  test("abonos: registrar y borrar recalcula el saldo", async () => {
    const { sa, api, orden } = await prepararOrden();
    await api.post(`/servicios/${orden.id_servicio}/detalles`, { descripcion: "Mano de obra", cantidad: 1, costo_mano_obra: 1000 });
    let o = await api.post(`/servicios/${orden.id_servicio}/abonos`, { monto_abono: 400, tipo_pago: "efectivo" });
    expect(o.costos.saldo_pendiente).toBeCloseTo(o.costos.total - 400, 2);
    const abono = o.abonos[o.abonos.length - 1];
    o = await api.del(`/servicios/${orden.id_servicio}/abonos/${abono.id_abono}`);
    expect(o.abonos.length).toBe(0);
    expect(o.costos.saldo_pendiente).toBeCloseTo(o.costos.total, 2);
    await api.cerrar(); await sa.cerrar();
  });

  test("fechas: la salida no puede ser antes de la entrada", async () => {
    const { sa, api, orden } = await prepararOrden();
    await api.put(`/servicios/${orden.id_servicio}`, { fecha_entrada_servicio: "2026-10-05T12:00:00" });
    await expect(api.put(`/servicios/${orden.id_servicio}`, { fecha_salida_servicio: "2026-10-04T12:00:00" })).rejects.toThrow(/400.*salida/);
    const o = await api.put(`/servicios/${orden.id_servicio}`, { fecha_salida_servicio: "2026-10-06T12:00:00" });
    expect(o.fecha_salida_servicio.slice(0, 10)).toBe("2026-10-06");
    await api.cerrar(); await sa.cerrar();
  });

  test("datos del taller: teléfono 2/3 y correo 2 no se borran si otro cliente no los manda", async () => {
    const { sa, api } = await prepararOrden();
    await api.put("/configuracion-taller/", { nombre_taller: "Taller E2E", telefono: "4771111111", telefono2: "4772222222", telefono3: "4773333333", correo2: "b@e2e.mx" });
    // Una app vieja que solo manda los campos de antes
    await api.put("/configuracion-taller/", { nombre_taller: "Taller E2E", telefono: "4771111111" });
    const c = await api.get("/configuracion-taller/");
    expect([c.telefono2, c.telefono3, c.correo2]).toEqual(["4772222222", "4773333333", "b@e2e.mx"]);
    await api.cerrar(); await sa.cerrar();
  });

  test("nota en PDF: el recibo se genera y el enlace público viejo ya no existe", async () => {
    const { sa, api, orden } = await prepararOrden();
    await api.post(`/servicios/${orden.id_servicio}/detalles`, { descripcion: "Mano de obra", cantidad: 1, costo_mano_obra: 500 });
    const ctx = await (require("@playwright/test").request).newContext({ baseURL: process.env.API_URL.replace(/\/$/, "") + "/" });
    const r = await ctx.get(`servicios/${orden.id_servicio}/recibo`, { headers: { Authorization: `Bearer ${api.sesion.access_token}` } });
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("application/pdf");
    expect((await r.body()).slice(0, 4).toString()).toBe("%PDF");
    // Sin sesión no se descarga, y el enlace público de 30 días ya no existe
    expect((await ctx.get(`servicios/${orden.id_servicio}/recibo`)).status()).toBe(401);
    expect((await ctx.get("servicios/publico/cualquier-token")).status()).toBe(404);
    expect((await ctx.post(`servicios/${orden.id_servicio}/enlace-pdf`, { headers: { Authorization: `Bearer ${api.sesion.access_token}` } })).status()).toBe(405);
    await ctx.dispose(); await api.cerrar(); await sa.cerrar();
  });

  test("pantalla de la orden: fechas con calendario, abono con borrar y WhatsApp descarga la nota", async ({ page }) => {
    const { sa, T, api, orden } = await prepararOrden();
    await api.post(`/servicios/${orden.id_servicio}/detalles`, { descripcion: "Mano de obra", cantidad: 1, costo_mano_obra: 800 });
    await api.post(`/servicios/${orden.id_servicio}/abonos`, { monto_abono: 100, tipo_pago: "efectivo" });
    await entrarAlPanel(page, T.usuario, T.password);
    await page.goto(`/servicios/${orden.id_servicio}`);
    await expect(page.getByText("Fecha de entrada")).toBeVisible();
    await page.locator(".orden-fecha .selfecha-boton").nth(1).click();
    await expect(page.locator(".selfecha-panel select")).toHaveCount(2); // mes y año
    await page.keyboard.press("Escape");
    await expect(page.locator(".selfecha-panel")).toHaveCount(0);
    await expect(page.locator(".tabla-abonos button[title='Borrar abono']")).toHaveCount(1);
    // WhatsApp: descarga el PDF y abre WhatsApp Web (no se navega de verdad)
    await page.context().route("https://web.whatsapp.com/**", (ruta) => ruta.fulfill({ status: 200, body: "ok" }));
    const [descarga, popup] = await Promise.all([
      page.waitForEvent("download"),
      page.context().waitForEvent("page"),
      page.getByRole("button", { name: /WhatsApp/ }).first().click(),
    ]);
    expect(descarga.suggestedFilename()).toMatch(/\.pdf$/);
    expect(popup.url()).toContain("web.whatsapp.com/send?phone=524771234567");
    await api.cerrar(); await sa.cerrar();
  });
});

test("refacciones: no se borra si tiene inventario", async () => {
  const sa = await apiComo();
  const T = await crearTallerConAdmin(sa);
  const api = await apiComo(T.usuario, T.password);
  const r = await api.post("/refacciones/", { nombre_refaccion: `Filtro ${SUFIJO()}`, categoria: "Afinacion" });
  await api.post("/inventario-refacciones/", { id_refaccion: r.id_refaccion, cantidad: 3 });
  await expect(api.del(`/refacciones/${r.id_refaccion}`)).rejects.toThrow(/400.*inventario/);
  const libre = await api.post("/refacciones/", { nombre_refaccion: `Libre ${SUFIJO()}`, categoria: "Afinacion" });
  await api.del(`/refacciones/${libre.id_refaccion}`);
  await api.cerrar(); await sa.cerrar();
});
