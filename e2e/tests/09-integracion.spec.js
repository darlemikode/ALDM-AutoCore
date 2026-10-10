// API de integración para n8n (agente de WhatsApp): llaves por taller y datos
// acotados al teléfono de quien escribe.
const { test, expect, request } = require("@playwright/test");
const { SUFIJO, apiComo, crearTallerConAdmin } = require("./helpers");
const API = () => process.env.API_URL.replace(/\/$/, "") + "/";

async function conLlave(llave) {
  const ctx = await request.newContext({ baseURL: API(), extraHTTPHeaders: { "X-API-Key": llave } });
  const llamar = async (m, ruta, data) => {
    const r = await ctx.fetch(ruta.replace(/^\//, ""), { method: m, data });
    return { status: r.status(), body: await r.json().catch(() => null), headers: r.headers() };
  };
  return { get: (r) => llamar("GET", r), post: (r, d) => llamar("POST", r, d), cerrar: () => ctx.dispose() };
}

async function prepararTaller(sa) {
  const T = await crearTallerConAdmin(sa);
  const api = await apiComo(T.usuario, T.password);
  const s = SUFIJO();
  const tel = `477${String(Date.now()).slice(-7)}`;
  const cliente = await api.post("/clientes/", { nombre_cliente: `Cliente ${s}`, telefono1: tel });
  const veh = await api.post("/vehiculos/", { id_cliente: cliente.id_cliente, placas_vehiculo: `N8N${s.slice(-3)}` });
  const orden = await api.post("/servicios/", { id_cliente: cliente.id_cliente, id_vehiculo: veh.id_vehiculo, nombre_servicio: "Afinación" });
  await api.post(`/servicios/${orden.id_servicio}/detalles`, { descripcion: "Mano de obra", cantidad: 1, costo_mano_obra: 900 });
  // Teléfono del admin para que el agente lo reconozca como personal
  const yo = (await api.get("/usuarios/")).find((u) => u.username === T.usuario);
  const telAdmin = `33${String(Date.now()).slice(-8)}`;
  await api.put(`/usuarios/${yo.id_usuario}`, { telefono: telAdmin });
  const { llave } = await api.post("/integracion/llaves", { nombre: "n8n pruebas" });
  return { T, api, cliente, orden, tel, telAdmin, llave };
}

test.describe("Integración n8n", () => {
  test("sin llave o con llave inválida no entra", async () => {
    const sin = await conLlave("");
    expect((await sin.get("integracion/taller")).status).toBe(401);
    const mala = await conLlave("aldm_inventada");
    expect((await mala.get("integracion/taller")).status).toBe(401);
    await sin.cerrar(); await mala.cerrar();
  });

  test("identifica cliente, personal y desconocido; el cliente solo ve lo suyo", async () => {
    const sa = await apiComo();
    const A = await prepararTaller(sa);
    const n = await conLlave(A.llave);
    // WhatsApp manda 521 + 10 dígitos
    expect((await n.get(`integracion/identificar?telefono=521${A.tel}`)).body.tipo).toBe("cliente");
    expect((await n.get(`integracion/identificar?telefono=52${A.telAdmin}`)).body.tipo).toBe("personal");
    expect((await n.get("integracion/identificar?telefono=5215550001111")).body.tipo).toBe("desconocido");

    const ords = (await n.get(`integracion/cliente/ordenes?telefono=521${A.tel}`)).body.ordenes;
    expect(ords.map((o) => o.id_orden)).toContain(A.orden.id_servicio);
    expect(ords[0].saldo).toBeGreaterThan(0);

    const pdf = await n.get(`integracion/cliente/ordenes/${A.orden.id_servicio}/nota?telefono=521${A.tel}`);
    expect(pdf.status).toBe(200);
    // Un desconocido no puede pedir la nota de esa orden
    expect((await n.get(`integracion/cliente/ordenes/${A.orden.id_servicio}/nota?telefono=5215550001111`)).status).toBe(404);
    // Un cliente no usa herramientas del personal
    expect((await n.get(`integracion/personal/resumen?telefono=521${A.tel}`)).status).toBe(403);

    const cita = await n.post("integracion/cliente/citas", { telefono: `521${A.tel}`, descripcion: "Afinación el sábado" });
    expect(cita.status).toBe(201);
    const res = await n.get(`integracion/personal/resumen?telefono=52${A.telAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.citas_por_confirmar).toBe(1);
    expect(res.body.ordenes_abiertas).toBe(1);
    await n.cerrar(); await A.api.cerrar(); await sa.cerrar();
  });

  test("la llave de un taller no ve clientes de otro y se puede revocar", async () => {
    const sa = await apiComo();
    const A = await prepararTaller(sa);
    const B = await prepararTaller(sa);
    const nB = await conLlave(B.llave);
    expect((await nB.get(`integracion/identificar?telefono=521${A.tel}`)).body.tipo).toBe("desconocido");
    expect((await nB.get(`integracion/cliente/ordenes/${A.orden.id_servicio}/nota?telefono=521${A.tel}`)).status).toBe(404);
    const llaves = await B.api.get("/integracion/llaves");
    expect(llaves[0].prefijo).toMatch(/^aldm_/);
    expect(JSON.stringify(llaves)).not.toContain(B.llave);
    await B.api.del(`/integracion/llaves/${llaves[0].id_llave}`);
    expect((await nB.get("integracion/taller")).status).toBe(401);
    await nB.cerrar(); await A.api.cerrar(); await B.api.cerrar(); await sa.cerrar();
  });
});
