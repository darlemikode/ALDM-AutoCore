// v1.3: vehículos paginados + resumen, servicio a domicilio por paquete, errores solo soporte,
// conteos de catálogos, ayudas y atajos según el paquete.
const { test, expect, request } = require("@playwright/test");
const { SUFIJO, apiComo, crearTallerConAdmin, entrarAlPanel } = require("./helpers");
const API = () => process.env.API_URL.replace(/\/$/, "") + "/";

async function tallerCon(sa, paqueteNombre) {
  const T = await crearTallerConAdmin(sa, { paqueteNombre });
  return { T, api: await apiComo(T.usuario, T.password) };
}

test.describe("v1.3 — vehículos", () => {
  test("resumen y paginación del servidor coinciden con los datos", async () => {
    const sa = await apiComo();
    const { api } = await tallerCon(sa, "Taller Pro");
    const s = SUFIJO();
    const c = await api.post("/clientes/", { nombre_cliente: `Cliente ${s}`, telefono1: "4771234567" });
    const v = [];
    for (let i = 0; i < 3; i++) v.push(await api.post("/vehiculos/", { id_cliente: c.id_cliente, placas_vehiculo: `V13${i}${s.slice(-3)}`, km_vehiculo: 1000 * (i + 1) }));
    await api.post("/servicios/", { id_cliente: c.id_cliente, id_vehiculo: v[0].id_vehiculo, nombre_servicio: "Afinación v1.3" });

    const r = await api.get("/vehiculos/resumen");
    expect(r.errores).toEqual([]);
    expect(r.total).toBe(3);
    expect(r.activos).toBe(3);
    expect(r.abiertos).toBe(1);
    expect(r.sin).toBe(2);

    const p1 = await api.get("/vehiculos/pagina?limite=2&offset=0");
    expect(p1.total).toBe(3);
    expect(p1.items).toHaveLength(2);
    const p2 = await api.get("/vehiculos/pagina?limite=2&offset=2");
    expect(p2.items).toHaveLength(1);
    const ids = [...p1.items, ...p2.items].map((x) => x.id_vehiculo);
    expect(new Set(ids).size).toBe(3);

    const busca = await api.get(`/vehiculos/pagina?q=${encodeURIComponent(v[1].placas_vehiculo)}`);
    expect(busca.total).toBe(1);
    const abiertos = await api.get("/vehiculos/pagina?servicio=abierto");
    expect(abiertos.total).toBe(1);
    await api.cerrar(); await sa.cerrar();
  });

  test("parámetros hostiles no rompen ni inyectan SQL; los límites se validan", async () => {
    const sa = await apiComo();
    const { api } = await tallerCon(sa, "Taller Pro");
    for (const q of ["orden=marca;DROP TABLE vehiculos", "orden=' OR 1=1 --", "q=%27%20OR%201%3D1%20--", "marcas=1,2;--", "estado=xx", "servicio=xx", "anio_desde=abc"]) {
      let r;
      try { r = await api.get(`/vehiculos/pagina?${q}`); } catch (e) { expect(String(e.message)).toMatch(/-> 422/); continue; }
      expect(r.total).toBe(0);
    }
    await expect(api.get("/vehiculos/pagina?limite=0")).rejects.toThrow(/422/);
    await expect(api.get("/vehiculos/pagina?limite=100000")).rejects.toThrow(/422/);
    await expect(api.get("/vehiculos/pagina?offset=-1")).rejects.toThrow(/422/);
    expect((await api.get("/vehiculos/resumen")).total).toBe(0);
    await api.cerrar(); await sa.cerrar();
  });

  test("un taller no ve los vehículos de otro (pagina y resumen)", async () => {
    const sa = await apiComo();
    const A = await tallerCon(sa, "Taller Pro");
    const B = await tallerCon(sa, "Taller Pro");
    const c = await A.api.post("/clientes/", { nombre_cliente: `Privado ${SUFIJO()}` });
    const v = await A.api.post("/vehiculos/", { id_cliente: c.id_cliente, placas_vehiculo: `PRIV${SUFIJO().slice(-4)}` });
    expect((await B.api.get("/vehiculos/pagina")).total).toBe(0);
    expect((await B.api.get("/vehiculos/resumen")).total).toBe(0);
    expect((await B.api.get(`/vehiculos/pagina?id_cliente=${c.id_cliente}`)).total).toBe(0);
    expect((await B.api.get(`/vehiculos/pagina?q=${v.placas_vehiculo}`)).total).toBe(0);
    await A.api.cerrar(); await B.api.cerrar(); await sa.cerrar();
  });

  test("sin sesión no hay vehículos", async () => {
    const ctx = await request.newContext({ baseURL: API() });
    for (const ruta of ["vehiculos/pagina", "vehiculos/resumen", "vehiculos/catalogos"]) expect((await ctx.get(ruta)).status()).toBe(401);
    await ctx.dispose();
  });
});

test.describe("v1.3 — módulos por paquete", () => {
  test("servicio a domicilio: el paquete que no lo incluye recibe 403", async () => {
    const sa = await apiComo();
    const paquetes = await sa.get("/superadmin/paquetes");
    const sin = paquetes.find((p) => !(p.modulos || []).some((m) => (m.clave || m) === "servicio_domicilio") && p.activo !== false);
    const con = paquetes.find((p) => (p.modulos || []).some((m) => (m.clave || m) === "servicio_domicilio") && p.activo !== false);
    if (con) {
      const { api } = await tallerCon(sa, con.nombre);
      expect(await api.get("/servicio-domicilio/lista/abiertas")).toBeTruthy();
      await api.cerrar();
    }
    if (sin) {
      const { api } = await tallerCon(sa, sin.nombre);
      await expect(api.get("/servicio-domicilio/lista/abiertas")).rejects.toThrow(/403/);
      await api.cerrar();
    }
    expect(con, "ningún paquete incluye servicio_domicilio: asígnalo al menos a Taller Pro").toBeTruthy();
    await sa.cerrar();
  });

  test("ayudas y atajos solo muestran lo que incluye el paquete (Arranque)", async ({ page }) => {
    const sa = await apiComo();
    const { T } = await tallerCon(sa, "Arranque");
    await entrarAlPanel(page, T.usuario, T.password);
    await page.goto("/configuracion#ayuda");
    await expect(page.getByText("Recorrido de bienvenida").first()).toBeVisible();
    const ayuda = await page.locator("#ayuda").innerText();
    expect(ayuda).not.toContain("Citas solicitadas");
    expect(ayuda).not.toContain("Errores del sistema");
    const atajos = await page.locator(".atajos-grid").innerText();
    expect(atajos).not.toContain("Citas solicitadas");
    expect(atajos).toContain("Panel");
    await sa.cerrar();
  });
});

test.describe("v1.3 — errores y catálogos solo para soporte", () => {
  test("la bitácora y los conteos de catálogos son solo del súper admin", async () => {
    const sa = await apiComo();
    const { api } = await tallerCon(sa, "Taller Pro");
    await expect(api.get("/errores/")).rejects.toThrow(/403/);
    await expect(api.get("/superadmin/catalogos/conteos")).rejects.toThrow(/40[13]/);
    const lista = await sa.get("/errores/");
    expect(Array.isArray(lista)).toBe(true);
    const conteos = await sa.get("/superadmin/catalogos/conteos");
    expect(Object.keys(conteos).length).toBeGreaterThan(5);
    await api.cerrar(); await sa.cerrar();
  });

  test("el reporte público de errores devuelve un código y no revela detalles; sin sesión no lee la bitácora", async () => {
    const ctx = await request.newContext({ baseURL: API() });
    const r = await ctx.post("errores/cliente", { data: { mensaje: "prueba v1.3", pantalla: "QA", origen: "web", detalle: "x".repeat(10000) } });
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(j.codigo).toMatch(/^ERR-[0-9A-F]{8}$/);
    expect(JSON.stringify(j)).not.toMatch(/Traceback|File "/);
    expect((await ctx.get("errores/")).status()).toBe(401);
    await ctx.dispose();
  });

  test("el aviso a soporte no se puede usar para inundar el buzón (tope por hora)", async () => {
    // El tope vive en el servidor: se verifica que la ráfaga no tumbe el endpoint y que cada respuesta traiga código
    const ctx = await request.newContext({ baseURL: API() });
    const codigos = new Set();
    for (let i = 0; i < 8; i++) {
      const r = await ctx.post("errores/cliente", { data: { mensaje: `ráfaga ${SUFIJO()} ${i}`, origen: "app_movil" } });
      expect([200, 429]).toContain(r.status());
      if (r.status() === 200) codigos.add((await r.json()).codigo);
    }
    expect(codigos.size).toBeGreaterThan(0);
    await ctx.dispose();
  });
});

test.describe("v1.3 — portal de clientes (rutas que usa la app)", () => {
  test("GET /portal-cliente/taller: datos mínimos del taller por código; código inválido → 404", async () => {
    const sa = await apiComo();
    const { T } = await tallerCon(sa, "Taller Pro");
    const ctx = await request.newContext({ baseURL: API() });
    const r = await ctx.get("portal-cliente/taller", { headers: { "X-Taller": T.taller.codigo } });
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(j.codigo).toBe(T.taller.codigo);
    expect(j.nombre).toBeTruthy();
    expect(typeof j.disponible).toBe("boolean");
    // no expone datos internos
    expect(Object.keys(j).sort()).toEqual(["codigo", "direccion", "disponible", "nombre", "ruta_logo", "telefono"]);
    expect((await ctx.get("portal-cliente/taller", { headers: { "X-Taller": "NOEXISTE-123" } })).status()).toBe(404);
    await ctx.dispose(); await sa.cerrar();
  });

  test("página del QR: abre la app y no acepta códigos con HTML", async () => {
    const ctx = await request.newContext({ baseURL: API() });
    const ok = await ctx.get("portal-cliente/qr/ALDM-DEMO");
    expect(ok.status()).toBe(200);
    expect(await ok.text()).toContain("aldmcliente://taller/ALDM-DEMO");
    const mal = await ctx.get("portal-cliente/qr/%3Cscript%3Ealert(1)%3C%2Fscript%3E");
    expect([404, 422]).toContain(mal.status());
    expect(await mal.text()).not.toContain("<script>alert");
    await ctx.dispose();
  });

  test("foto en el chat del cliente exige sesión de cliente", async () => {
    const ctx = await request.newContext({ baseURL: API() });
    const r = await ctx.post("portal-cliente/mis-servicios/1/chat/foto", { multipart: { archivo: { name: "x.jpg", mimeType: "image/jpeg", buffer: Buffer.from("no-es-imagen") } } });
    expect([401, 403]).toContain(r.status());
    await ctx.dispose();
  });
});
