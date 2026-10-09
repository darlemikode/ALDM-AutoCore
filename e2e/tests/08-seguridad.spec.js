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
});
