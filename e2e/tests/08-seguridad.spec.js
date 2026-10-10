// Seguridad: correcciones de la auditoría de oct-2026.
const { test, expect, request } = require("@playwright/test");
const { SUFIJO, apiComo, crearTallerConAdmin } = require("./helpers");
const API = () => process.env.API_URL.replace(/\/$/, "") + "/";

test.describe("Seguridad", () => {
  test("la bitácora de errores no guarda contraseñas enviadas", async () => {
    const sa = await apiComo();
    const T = await crearTallerConAdmin(sa);
    const api = await apiComo(T.usuario, T.password);
    const ctx = await request.newContext({ baseURL: API() });
    const secreto = `Filtrada-${SUFIJO()}`;
    // Petición mal formada (falta "identificador") con una contraseña
    const r = await ctx.post("portal-cliente/login", { data: { password: secreto }, headers: { "X-Taller": T.taller.codigo || "" } });
    expect(r.status()).toBe(422);
    const errores = await api.get("/errores/");
    expect(JSON.stringify(errores)).not.toContain(secreto);
    await ctx.dispose(); await api.cerrar(); await sa.cerrar();
  });

  test("las facturas no se pueden bajar de /uploads sin sesión", async () => {
    const ctx = await request.newContext({ baseURL: API().replace(/api\/$/, "") });
    expect((await ctx.get("uploads/facturas/A1_cualquier-uuid.xml")).status()).toBe(404);
    await ctx.dispose();
  });

  test("no se pueden crear usuarios con nombres especiales como cliente:5", async () => {
    const sa = await apiComo();
    const T = await crearTallerConAdmin(sa);
    const api = await apiComo(T.usuario, T.password);
    const roles = await api.get("/roles/");
    await expect(api.post("/usuarios/", { username: "cliente:5", password: "secreto1", nombre_completo: "X", id_rol: roles[0].id_rol }))
      .rejects.toThrow(/400/);
    await api.cerrar(); await sa.cerrar();
  });

  test("un taller no ve las órdenes de otro", async () => {
    const sa = await apiComo();
    const A = await crearTallerConAdmin(sa);
    const B = await crearTallerConAdmin(sa);
    const a = await apiComo(A.usuario, A.password);
    const b = await apiComo(B.usuario, B.password);
    const c = await a.post("/clientes/", { nombre_cliente: `Privado ${SUFIJO()}` });
    const v = await a.post("/vehiculos/", { id_cliente: c.id_cliente });
    const o = await a.post("/servicios/", { id_cliente: c.id_cliente, id_vehiculo: v.id_vehiculo });
    await expect(b.get(`/servicios/${o.id_servicio}`)).rejects.toThrow(/404/);
    await expect(b.post(`/servicios/${o.id_servicio}/abonos`, { monto_abono: 10 })).rejects.toThrow(/404/);
    await expect(b.get(`/clientes/${c.id_cliente}`)).rejects.toThrow(/404/);
    await a.cerrar(); await b.cerrar(); await sa.cerrar();
  });
  test("cambiar la contraseña cierra las demás sesiones", async () => {
    const sa = await apiComo();
    const T = await crearTallerConAdmin(sa);
    const celular = await apiComo(T.usuario, T.password);
    const pc = await apiComo(T.usuario, T.password);
    const r = await pc.put("/auth/password", { password_actual: T.password, password_nueva: "otraClave99" });
    expect(r.access_token).toBeTruthy();
    // La otra sesión (celular) ya no sirve
    await expect(celular.get("/auth/me")).rejects.toThrow(/401/);
    // La sesión que cambió la contraseña sigue con su token nuevo
    const ctx = await request.newContext({ baseURL: API() });
    const me = await ctx.get("auth/me", { headers: { Authorization: `Bearer ${r.access_token}` } });
    expect(me.status()).toBe(200);
    // La contraseña vieja ya no entra; la nueva sí
    await expect(apiComo(T.usuario, T.password)).rejects.toThrow(/401/);
    const nueva = await apiComo(T.usuario, "otraClave99");
    await nueva.cerrar(); await ctx.dispose(); await celular.cerrar(); await pc.cerrar(); await sa.cerrar();
  });

  test("un técnico no recibe precios ni el recibo desde la API", async () => {
    const sa = await apiComo();
    const T = await crearTallerConAdmin(sa);
    const admin = await apiComo(T.usuario, T.password);
    const roles = await admin.get("/roles/");
    const tecnico = roles.find((r) => r.nombre.startsWith("Técnico"));
    const usuario = `tec${SUFIJO().slice(-6)}`;
    await admin.post("/usuarios/", { username: usuario, password: "secreto1", nombre_completo: "Técnico Prueba", id_rol: tecnico.id_rol });
    const c = await admin.post("/clientes/", { nombre_cliente: `Cliente ${SUFIJO()}` });
    const v = await admin.post("/vehiculos/", { id_cliente: c.id_cliente });
    const o = await admin.post("/servicios/", { id_cliente: c.id_cliente, id_vehiculo: v.id_vehiculo });
    await admin.post(`/servicios/${o.id_servicio}/detalles`, { descripcion: "Mano de obra", cantidad: 1, costo_mano_obra: 850 });
    expect((await admin.get(`/servicios/${o.id_servicio}`)).costos.total).toBeGreaterThan(0);
    const tec = await apiComo(usuario, "secreto1");
    const vista = await tec.get(`/servicios/${o.id_servicio}`);
    expect(vista.costos.total).toBe(0);
    expect(vista.detalles.every((d) => !d.costo_mano_obra && !d.costo_refaccion && !d.costo_extra)).toBeTruthy();
    expect((await tec.get("/servicios/")).every((s) => s.costos.total === 0)).toBeTruthy();
    await expect(tec.get(`/servicios/${o.id_servicio}/recibo`)).rejects.toThrow(/403/);
    expect((await tec.get("/dashboard/resumen")).saldo_pendiente_clientes).toBe(0);
    await tec.cerrar(); await admin.cerrar(); await sa.cerrar();
  });

  test("las respuestas traen cabeceras de seguridad", async () => {
    const ctx = await request.newContext({ baseURL: API() });
    const r = await ctx.get("auth/me");
    expect(r.headers()["x-frame-options"]).toBe("DENY");
    expect(r.headers()["x-content-type-options"]).toBe("nosniff");
    await ctx.dispose();
  });
});
