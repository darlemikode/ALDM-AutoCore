// Seguridad profunda (oct-2026): cobertura de autenticación de TODA la API, tokens
// manipulados, bloqueo por cuenta, cabeceras, archivos falsos, inyección y sesiones
// revocadas en el WebSocket. Si falla "toda la API exige sesión", la lista que
// imprime son endpoints sin protección: revisa si son públicos a propósito y, si
// lo son, agrégalos a PUBLICOS.
const { test, expect, request } = require("@playwright/test");
const { SUFIJO, apiComo, crearTallerConAdmin } = require("./helpers");

const RAIZ = () => process.env.API_URL.replace(/\/api\/?$/, "") + "/";
const API = () => process.env.API_URL.replace(/\/$/, "") + "/";

// Públicos a propósito (login, activación, recuperación, portal de cliente, QR, contacto, webhook, salud…)
const PUBLICOS = [
  /^\/api\/auth\/(login|verificar-activacion|activar-taller|recuperar-password|username-disponible)$/,
  /^\/api\/auth\/password\/(solicitar|validar|establecer)$/,
  /^\/api\/portal-cliente\/(login|activar|taller|recuperar|registro).*/,
  /^\/api\/chatbot\/(verificar|taller).*/,
  /^\/api\/contacto/, /^\/api\/pagos-en-linea\/webhook$/, /^\/api\/health$/,
  /^\/api\/errores\/cliente$/, /^\/api\/seguimiento\//, /^\/api\/codigos-postales/,
];
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

test.describe("Seguridad profunda", () => {
  test("toda la API exige sesión salvo la lista pública", async () => {
    const ctx = await request.newContext({ baseURL: RAIZ() });
    const r = await ctx.get("openapi.json");
    test.skip(!r.ok(), "openapi.json no está disponible (producción lo oculta)");
    const spec = await r.json();
    const sinProteger = [];
    for (const [ruta, metodos] of Object.entries(spec.paths)) {
      if (!ruta.startsWith("/api/") || PUBLICOS.some((re) => re.test(ruta))) continue;
      for (const metodo of Object.keys(metodos)) {
        if (!["get", "post", "put", "patch", "delete"].includes(metodo)) continue;
        const url = ruta.replace(/\{[^}]*(id|num)[^}]*\}/gi, "1").replace(/\{[^}]+\}/g, "x").replace(/^\//, "");
        const res = await ctx.fetch(url, { method: metodo.toUpperCase(), data: metodo === "get" ? undefined : {}, failOnStatusCode: false });
        if (res.status() < 300 || res.status() >= 500) sinProteger.push(`${metodo.toUpperCase()} ${ruta} -> ${res.status()}`);
      }
    }
    console.log("Sin protección / con error 5xx:\n" + (sinProteger.join("\n") || "(ninguno)"));
    expect(sinProteger).toEqual([]);
    await ctx.dispose();
  });

  test("tokens manipulados o sin firma son rechazados", async () => {
    const sa = await apiComo();
    const T = await crearTallerConAdmin(sa);
    const api = await apiComo(T.usuario, T.password);
    const ctx = await request.newContext({ baseURL: API() });
    const [h, p] = api.sesion.access_token.split(".");
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    const intentos = {
      "alg none": `${b64({ alg: "none", typ: "JWT" })}.${b64({ ...payload, sub: "admin" })}.`,
      "firma cambiada": `${h}.${b64({ ...payload, sub: "admin" })}.${api.sesion.access_token.split(".")[2]}`,
      "basura": "esto.no.es.un.token",
      "vacío": "",
    };
    for (const [nombre, token] of Object.entries(intentos)) {
      const res = await ctx.get("auth/me", { headers: { Authorization: `Bearer ${token}` }, failOnStatusCode: false });
      expect(res.status(), nombre).toBe(401);
    }
    await ctx.dispose(); await api.cerrar(); await sa.cerrar();
  });

  test("tras muchos intentos fallidos la cuenta se bloquea (aunque la contraseña sea correcta)", async () => {
    const sa = await apiComo();
    const T = await crearTallerConAdmin(sa);
    const ctx = await request.newContext({ baseURL: API() });
    let bloqueada = false;
    for (let i = 0; i < 14; i++) {
      const r = await ctx.post("auth/login", { form: { username: T.usuario, password: `mala-${i}` }, failOnStatusCode: false });
      if (r.status() === 429) {
        const d = JSON.stringify(await r.json().catch(() => ({})));
        test.skip(!/bloqueada/i.test(d) && i < 9, "el límite por IP (5/min) se activó antes; corre con RATE_LIMIT_DESACTIVADO=1");
        bloqueada = true; break;
      }
    }
    expect(bloqueada).toBeTruthy();
    const buena = await ctx.post("auth/login", { form: { username: T.usuario, password: T.password }, failOnStatusCode: false });
    expect(buena.status()).toBe(429);
    await ctx.dispose(); await sa.cerrar();
  });

  test("cabeceras de seguridad", async () => {
    const ctx = await request.newContext({ baseURL: RAIZ() });
    const r = await ctx.get("api/health");
    const h = r.headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["content-security-policy"]).toContain("default-src 'none'");
    expect(h["referrer-policy"]).toBeTruthy();
    const sitio = await ctx.get("sitio/", { failOnStatusCode: false });
    if (sitio.ok()) expect(sitio.headers()["content-security-policy-report-only"]).toContain("default-src 'self'");
    await ctx.dispose();
  });

  test("peticiones gigantes y archivos disfrazados se rechazan", async () => {
    const ctx = await request.newContext({ baseURL: API() });
    const grande = await ctx.post("contacto", { data: "x".repeat(26 * 1024 * 1024), headers: { "Content-Type": "text/plain" }, failOnStatusCode: false });
    expect(grande.status()).toBe(413);
    const sa = await apiComo();
    const T = await crearTallerConAdmin(sa);
    const api = await apiComo(T.usuario, T.password);
    const falso = await ctx.post("configuracion-taller/logo", {
      headers: { Authorization: `Bearer ${api.sesion.access_token}` },
      multipart: { archivo: { name: "logo.png", mimeType: "image/png", buffer: Buffer.from("<script>alert(1)</script>") } },
      failOnStatusCode: false,
    });
    expect(falso.status()).toBe(400);
    const svg = await ctx.post("configuracion-taller/logo", {
      headers: { Authorization: `Bearer ${api.sesion.access_token}` },
      multipart: { archivo: { name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg onload=alert(1)/>") } },
      failOnStatusCode: false,
    });
    expect(svg.status()).toBe(400);
    await ctx.dispose(); await api.cerrar(); await sa.cerrar();
  });

  test("cargas de inyección SQL / XSS en búsquedas y campos no rompen nada", async () => {
    const sa = await apiComo();
    const T = await crearTallerConAdmin(sa);
    const api = await apiComo(T.usuario, T.password);
    const ctx = await request.newContext({ baseURL: API() });
    const h = { Authorization: `Bearer ${api.sesion.access_token}` };
    for (const q of ["' OR 1=1--", "\"; DROP TABLE clientes;--", "%' UNION SELECT NULL--", "<script>alert(1)</script>", "../../etc/passwd"]) {
      const r = await ctx.get(`clientes/?q=${encodeURIComponent(q)}`, { headers: h, failOnStatusCode: false });
      expect(r.status(), q).toBeLessThan(500);
      if (r.ok()) expect((await r.json()).length).toBe(0);
    }
    const xss = `<img src=x onerror=alert(1)> ${SUFIJO()}`;
    const c = await api.post("/clientes/", { nombre_cliente: xss });
    const leido = await api.get(`/clientes/${c.id_cliente}`);
    expect(leido.nombre_cliente).toBe(xss); // se guarda tal cual; React lo escapa al mostrarlo
    await ctx.dispose(); await api.cerrar(); await sa.cerrar();
  });

  test("aislamiento entre talleres: B no puede leer, editar ni borrar datos de A", async () => {
    const sa = await apiComo();
    const A = await crearTallerConAdmin(sa);
    const B = await crearTallerConAdmin(sa);
    const a = await apiComo(A.usuario, A.password);
    const b = await apiComo(B.usuario, B.password);
    const c = await a.post("/clientes/", { nombre_cliente: `Privado ${SUFIJO()}` });
    const v = await a.post("/vehiculos/", { id_cliente: c.id_cliente });
    const o = await a.post("/servicios/", { id_cliente: c.id_cliente, id_vehiculo: v.id_vehiculo });
    const casos = [
      () => b.get(`/clientes/${c.id_cliente}`), () => b.put(`/clientes/${c.id_cliente}`, { nombre_cliente: "hackeado" }), () => b.del(`/clientes/${c.id_cliente}`),
      () => b.get(`/vehiculos/${v.id_vehiculo}`), () => b.put(`/vehiculos/${v.id_vehiculo}`, { marca: "x" }), () => b.del(`/vehiculos/${v.id_vehiculo}`),
      () => b.get(`/servicios/${o.id_servicio}`), () => b.del(`/servicios/${o.id_servicio}`),
    ];
    for (const caso of casos) await expect(caso()).rejects.toThrow(/40[34]|404/);
    const aun = await a.get(`/clientes/${c.id_cliente}`);
    expect(aun.nombre_cliente).not.toBe("hackeado");
    await a.cerrar(); await b.cerrar(); await sa.cerrar();
  });

  test("un usuario sin permiso no puede entrar al súper admin ni a los catálogos generales", async () => {
    const sa = await apiComo();
    const T = await crearTallerConAdmin(sa);
    const api = await apiComo(T.usuario, T.password);
    await expect(api.get("/superadmin/talleres")).rejects.toThrow(/40[13]/);
    await expect(api.post("/superadmin/catalogos/vehiculos-marcas/", { nombre_marca: "HACK" })).rejects.toThrow(/40[13]/);
    await expect(api.post("/vehiculos-marcas/", { nombre_marca: "HACK" })).rejects.toThrow(/403/);
    await api.cerrar(); await sa.cerrar();
  });

  test("una sesión revocada (cambio de contraseña) tampoco abre el WebSocket", async ({ page }) => {
    const sa = await apiComo();
    const T = await crearTallerConAdmin(sa);
    const vieja = await apiComo(T.usuario, T.password);
    const pc = await apiComo(T.usuario, T.password);
    const ws = (token) => `${process.env.API_URL.replace(/^http/, "ws").replace(/\/$/, "")}/ws/global?token=${encodeURIComponent(token)}`;
    await page.goto("/login");
    const abre = (url) => page.evaluate((u) => new Promise((res) => { const w = new WebSocket(u); w.onopen = () => { w.close(); res("abierto"); }; w.onclose = () => res("cerrado"); w.onerror = () => res("cerrado"); setTimeout(() => res("cerrado"), 6000); }), url);
    expect(await abre(ws(vieja.sesion.access_token))).toBe("abierto");
    await pc.put("/auth/password", { password_actual: T.password, password_nueva: "otraClave99" });
    expect(await abre(ws(vieja.sesion.access_token))).toBe("cerrado");
    await vieja.cerrar(); await pc.cerrar(); await sa.cerrar();
  });
  test("activar cuenta de cliente: el código se anula tras varios intentos y no se puede adivinar", async () => {
    const sa = await apiComo();
    const T = await crearTallerConAdmin(sa);
    const api = await apiComo(T.usuario, T.password);
    const tel = `55${Math.floor(10000000 + Math.random() * 89999999)}`;
    const c = await api.post("/clientes/", { nombre_cliente: `Cli ${SUFIJO()}`, telefono1: tel });
    const inv = await api.post(`/clientes/${c.id_cliente}/invitar`);
    const ctx = await request.newContext({ baseURL: API(), extraHTTPHeaders: { "X-Taller": T.taller.codigo || "" } });
    const intentar = (codigo) => ctx.post("portal-cliente/activar", { data: { identificador: tel, codigo_invitacion: codigo, password_nueva: "claveSegura9" }, failOnStatusCode: false });
    const mensajes = new Set();
    let ultimo = 0;
    for (let i = 0; i < 8; i++) {
      const r = await intentar(inv.codigo_invitacion === "000000" ? "111111" : "000000");
      ultimo = r.status();
      if (r.status() === 400) mensajes.add((await r.json()).detail);
      if (r.status() === 429) break;
    }
    expect(mensajes.size).toBeLessThanOrEqual(1); // mismo mensaje en todos los fallos
    expect([400, 429]).toContain(ultimo);
    const buena = await intentar(inv.codigo_invitacion); // el código real ya no sirve
    expect(buena.status()).not.toBe(200);
    await ctx.dispose(); await api.cerrar(); await sa.cerrar();
  });
});
