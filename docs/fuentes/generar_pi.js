const fs = require("fs");
const L = require("./lib");
const { d, C, ANCHO, P, H1, H2, H3, Viñeta, listaNumerada, celda, etiqueta, encabezadoTabla, tabla, tituloBloque, celdaEstado, espacio } = L;
const EPICAS = require("./datos_hu");
const T = require("./datos_pruebas");
const HUS = EPICAS.flatMap((e) => e.hus);
const hijos = [];
const k = { keep: true };

const totAuto = T.automatizadas.reduce((a, x) => a + x.total, 0);
const pasosApi = T.api.length, pasosDisp = T.dispositivo.length;

// ---------- Encabezado estilo formato ----------
hijos.push(tabla([[
  celda([new d.Paragraph({ spacing: { after: 0 }, children: [new d.TextRun({ text: "ALDM AutoCore", bold: true, size: 26, color: C.petrol }), new d.TextRun({ text: "  ·  Dirección de Sistemas", size: 20, color: C.gris })] })], 5040, { valign: d.VerticalAlign.CENTER }),
  celda([new d.Paragraph({ alignment: d.AlignmentType.RIGHT, spacing: { after: 0 }, children: [new d.TextRun({ text: "Reporte de Pruebas Unitarias / Integrales", bold: true, size: 24, color: C.ink })] })], 5040, { valign: d.VerticalAlign.CENTER }),
]], [5040, 5040]));
hijos.push(espacio(140));
hijos.push(P("**Reporte de Pruebas para Falla/Petición**", { size: 22, color: C.petrol }));
const A4 = [2300, 3980, 1900, 1900];
const fila4 = (a, b, c, e) => [etiqueta(a, A4[0]), celda(b, A4[1]), etiqueta(c, A4[2]), celda(e, A4[3])];
hijos.push(tabla([
  fila4("Petición:", "Migración del Sistema Mecánico a versión web + apps móviles: rediseño e integración de la app del taller con el panel web, homologación de la app de clientes, modo local y patrón de pruebas QA.", "Fecha:", "26 de septiembre de 2026"),
  fila4("", "", "N° Track / CRQ:", "CRQ40067"),
  fila4("Responsable de Sistemas:", "", "Tarea (en caso de aplicar):", "TAS30160"),
  fila4("Proveedor:", "N/A", "N° Pase:", ""),
  fila4("Aplicación:", "ALDM AutoCore — API FastAPI, panel web React, app del taller y app de clientes (Expo SDK 57)", "Duración (días/hrs.):", ""),
  fila4("Ambiente Requerido:", "QA: copia aislada de la base (_qa_tmp\\qa_copy.db), servidor en puerto 8001, Node 22+, Python 3, Expo Go", "Tamaño Proyecto:", "Grande"),
  fila4("Clasificación del Requerimiento:", "Proyecto", "Origen de la Falla:", "N/A"),
], A4));

hijos.push(espacio(160));
const A3 = [3400, 4080, 2600];
hijos.push(tabla([
  [encabezadoTabla("Autorización de Pruebas Unitarias", ANCHO, { span: 3 })],
  [etiqueta("Rol", A3[0]), etiqueta("Nombre", A3[1]), etiqueta("Fecha", A3[2])],
  ...["Usuario ¹", "Arq. Seguridad Informática ²", "Calidad TI ³", "Revisor código / Supervisor ⁴"].map((r) => [celda(r, A3[0], { bold: true }), celda("", A3[1]), celda("", A3[2])]),
], A3));
hijos.push(espacio(160));
const AA = [3400, 6680];
hijos.push(tabla([
  [encabezadoTabla("Autorización del Resultado de Pruebas Integrales", ANCHO, { span: 3 })],
  [etiqueta("Fecha de Realización de las Pruebas Integrales:", A3[0]), celda(`Automatizadas: ${T.FECHA_AUTO}  ·  API real y dispositivo: pendientes`, A3[1] + A3[2], { span: 2 })],
  [etiqueta("Rol", A3[0]), etiqueta("Nombre", A3[1]), etiqueta("Firma", A3[2])],
  ...["Usuario", "Calidad TI", "Responsable de Sistemas", "Arq. Seguridad Informática", "Control de Versiones", "Proveedor"].map((r) => [celda(r, A3[0], { bold: true }), celda(r === "Proveedor" ? "N/A" : "", A3[1]), celda("", A3[2])]),
  [etiqueta("Comentarios de la aprobación:", A3[0]), celda("", A3[1] + A3[2], { span: 2 })],
  [etiqueta("Estatus de las pruebas:", A3[0]), celdaEstado("PEND", A3[1] + A3[2], `PARCIAL — Suite automatizada de apps en verde (${totAuto}/${totAuto} ×3). Suite contra la API real (${pasosApi} casos) y suite en dispositivo (${pasosDisp} casos) pendientes de ejecución.`)],
  [etiqueta("Scripts a ejecutar en la liberación:", A3[0]), celda("mobile › npm run qa  ·  backend › python tests\\pruebas_integrales.py (contra la copia QA). No hay scripts de base de datos: el backend crea tablas y siembra catálogos al arrancar.", A3[1] + A3[2], { span: 2 })],
  [etiqueta("Descripción del resultado esperado:", A3[0]), celda("Todos los casos en OK; reportes qa/ultimo-reporte.txt y tests/reporte_pruebas_integrales.json sin fallas; checklist de dispositivo firmado.", A3[1] + A3[2], { span: 2 })],
].map((f) => f), A3));
hijos.push(P("¹ Vo.Bo. del solicitante del área usuaria.  ² Vo.Bo. del Arquitecto de Seguridad Informática al análisis de código.  ³ Vo.Bo. de Calidad TI.  ⁴ Vo.Bo. del revisor del código o supervisor del desarrollador.", { size: 15, color: C.gris, before: 80 }));

// ---------- 1. Resumen ----------
hijos.push(H1("1. Resumen de ejecución"));
const AR = [3600, 1500, 2980, 2000];
hijos.push(tabla([
  ["Suite", "Casos", "Resultado", "Estado"].map((t, i) => encabezadoTabla(t, AR[i])),
  [celda("S1 · Automatizada de apps móviles (npm run qa)", AR[0], { bold: true }), celda(`${T.automatizadas.length + T.estructurales.length}`, AR[1]), celda(`${totAuto}/${totAuto} validaciones E2E, repetidas 3 veces, + 4 validaciones estructurales sin fallas`, AR[2]), celdaEstado("OK", AR[3], "OK")],
  [celda("S2 · Integrales contra la API real + base QA", AR[0], { bold: true }), celda(`${pasosApi}`, AR[1]), celda("Script listo: backend/tests/pruebas_integrales.py", AR[2]), celdaEstado("PEND", AR[3], "Pendiente")],
  [celda("S3 · Manuales en dispositivo (Expo Go)", AR[0], { bold: true }), celda(`${pasosDisp}`, AR[1]), celda("Checklist en la sección 5", AR[2]), celdaEstado("PEND", AR[3], "Pendiente")],
], AR, { encabezado: true }));
hijos.push(espacio(80));
[
  `**Historias de usuario cubiertas:** ${HUS.length} (ver matriz de trazabilidad, sección 6).`,
  `**Defectos detectados y corregidos durante las pruebas:** ${T.defectos.length}, cada uno con su prueba de regresión (sección 7).`,
  "**Regla de datos:** ninguna prueba toca la base real. S1 usa SQLite en memoria; S2 usa la copia _qa_tmp\\qa_copy.db y marca todo lo que crea con el prefijo \"QA-PI\".",
].forEach((t) => hijos.push(Viñeta(t)));

// ---------- 2. Ambiente ----------
hijos.push(H1("2. Ambiente y datos de prueba"));
hijos.push(tabla([
  [encabezadoTabla("Elemento", 2800), encabezadoTabla("Detalle", 7280)],
  ...[
    ["Backend", "FastAPI 0.115, SQLAlchemy 2.0, 230 rutas; WebSocket /api/ws/servicio/{id}."],
    ["Base de datos QA", "Copia de sistema_mecanico.db en _qa_tmp\\qa_copy.db (DATABASE_URL). La base real nunca se usa en pruebas."],
    ["Apps móviles", "Expo SDK 57, React Native 0.86, React 19.2, React Navigation 7. App del taller con modo local (SQLite)."],
    ["Harness S1", "Node 22 (node:sqlite) ejecuta el código real de la app (api.js → apiLocal.js → db.js) con mocks de módulos nativos; Python 3 para contrato y paridad."],
    ["Harness S2", "Python + httpx del venv del backend contra http://127.0.0.1:8001/api."],
    ["Dispositivo", "Android con Expo Go en la misma red (Metro en 192.168.1.10:8081)."],
    ["Datos semilla", "8 tipos de servicio, 12 colores, 79 marcas, 1,008 modelos, 32 estados, 207 CP de León, 22 puntos de inspección, 4 roles base."],
  ].map(([a, b]) => [celda(a, 2800, { bold: true }), celda(b, 7280)]),
], [2800, 7280], { encabezado: true }));

// ---------- helper bloque de prueba (formato del reporte) ----------
const AB = [2700, 7380];
function bloque({ id, nombre, objetivo, descripcion, condiciones, esperado, actual, estado, hu }) {
  hijos.push(tabla([
    [encabezadoTabla("Datos de la Prueba Integral", ANCHO, { span: 2, keep: true })],
    [etiqueta("Número y Nombre de la Prueba:", AB[0], k), celda(`**${id} · ${nombre}**`, AB[1], k)],
    [etiqueta("Historias de usuario:", AB[0], k), celda(hu.join(", "), AB[1], k)],
    [etiqueta("Objetivo de la Prueba:", AB[0], k), celda(objetivo, AB[1], k)],
    [etiqueta("Descripción de la Prueba:", AB[0], k), celda(Array.isArray(descripcion) ? listaNumerada(descripcion, true) : descripcion, AB[1], k)],
    [etiqueta("Condiciones de la Prueba:", AB[0], k), celda(condiciones, AB[1], k)],
    [etiqueta("Resultados Esperados:", AB[0], k), celda(esperado, AB[1], k)],
    [etiqueta("Resultados Actuales:", AB[0], k), celdaEstado(estado, AB[1], actual, true)],
  ], AB));
  hijos.push(espacio(160));
}

// ---------- 3. S1 ----------
hijos.push(H1("3. Suite S1 — Automatizada de apps móviles"));
hijos.push(P(`Ejecutada el ${T.FECHA_AUTO} con \`npm run qa\` desde mobile/. Cada flujo se repite 3 veces para detectar fallas intermitentes. Las reglas de negocio del modo local se copian del código del backend, y la validación PI-M-CON asegura que cada llamada de las apps existe en la API real.`));
T.automatizadas.forEach((t) => bloque({
  id: t.id, nombre: t.nombre, hu: t.hu,
  objetivo: `Validar de extremo a extremo el flujo "${t.nombre}" con las mismas llamadas y cuerpos que envían las pantallas.`,
  descripcion: t.checks,
  condiciones: "Base SQLite limpia en memoria sembrada con los catálogos del backend; modo local activo.",
  esperado: `${t.total} validaciones en OK en las 3 corridas.`,
  actual: `OK — ${t.total}/${t.total} en las 3 corridas (${T.FECHA_AUTO}).`, estado: "OK",
}));
hijos.push(H2("Validaciones estructurales"));
const AE = [1300, 2800, 4380, 1600];
hijos.push(tabla([
  ["Clave", "Validación", "Resultado", "Estado"].map((t, i) => encabezadoTabla(t, AE[i])),
  ...T.estructurales.map((x) => [celda(x.id, AE[0], { bold: true }), celda(x.nombre, AE[1]), celda(x.detalle, AE[2]), celdaEstado("OK", AE[3], "OK")]),
], AE, { encabezado: true }));

// ---------- 4. S2 ----------
hijos.push(H1("4. Suite S2 — Integrales contra la API real"));
hijos.push(P("Script: **backend/tests/pruebas_integrales.py**. Recorre los flujos del taller y de la app de clientes contra el servidor FastAPI levantado sobre la copia QA; deja el detalle paso a paso en tests/reporte_pruebas_integrales.json para anexarlo a este reporte. Se niega a correr contra el puerto 8000."));
T.api.forEach((t) => bloque({
  id: t.id, nombre: t.nombre, hu: t.hu, objetivo: t.objetivo, descripcion: t.pasos,
  condiciones: "Servidor en http://127.0.0.1:8001 con DATABASE_URL apuntando a _qa_tmp\\qa_copy.db; usuario con rol Administrador General.",
  esperado: t.esperado, actual: "Pendiente de ejecución — correr el script y anexar el JSON de resultados.", estado: "PEND",
}));

// ---------- 5. S3 ----------
hijos.push(H1("5. Suite S3 — Manuales en dispositivo"));
hijos.push(P("Validan lo que no se puede simular fuera del teléfono: cámara y galería, biometría, WebSocket en vivo, compartir PDF y legibilidad en ambos temas. Anotar el resultado y adjuntar captura de pantalla por caso."));
const AD = [1150, 2350, 3480, 1900, 1200];
hijos.push(tabla([
  ["Clave", "Caso / HU", "Pasos", "Resultado esperado", "Resultado"].map((t, i) => encabezadoTabla(t, AD[i])),
  ...T.dispositivo.map((x) => [
    celda(x.id, AD[0], { bold: true }),
    celda([new d.Paragraph({ spacing: { after: 40 }, children: L.runs(`**${x.nombre}**`, { size: 18 }) }), new d.Paragraph({ spacing: { after: 0 }, children: [new d.TextRun({ text: x.hu.join(", "), size: 16, color: C.gris })] })], AD[1]),
    celda(listaNumerada(x.pasos), AD[2]),
    celda(x.esperado, AD[3], { size: 18 }),
    celda("☐ OK   ☐ Falla", AD[4], { size: 18 }),
  ]),
], AD, { encabezado: true }));

// ---------- 6. Trazabilidad ----------
hijos.push(H1("6. Matriz de trazabilidad HU ↔ pruebas"));
const AT = [1500, 3300, 3380, 1900];
const pruebasDe = (id) => {
  const s = [];
  T.automatizadas.forEach((t) => t.hu.includes(id) && s.push(t.id));
  T.estructurales.forEach((t) => t.hu.includes(id) && s.push(t.id));
  T.api.forEach((t) => t.hu.includes(id) && s.push(t.id));
  T.dispositivo.forEach((t) => t.hu.includes(id) && s.push(t.id));
  return s;
};
hijos.push(tabla([
  ["HU", "Título", "Pruebas", "Estado HU"].map((t, i) => encabezadoTabla(t, AT[i])),
  ...HUS.map((h) => {
    const p = pruebasDe(h.id);
    return [celda(h.id, AT[0], { bold: true, size: 17 }), celda(h.titulo, AT[1], { size: 17 }), celda(p.length ? p.join(", ") : h.pruebas.join(", "), AT[2], { size: 17 }), celdaEstado(h.estado, AT[3], { OK: "Probada", DISP: "Validar disp.", PROG: "En progreso", WEB: "Solo web" }[h.estado])];
  }),
], AT, { encabezado: true }));

// ---------- 7. Defectos ----------
hijos.push(H1("7. Defectos detectados y corregidos"));
const AF = [500, 3100, 2300, 2780, 1400];
hijos.push(tabla([
  ["#", "Defecto", "Causa", "Corrección", "Prueba"].map((t, i) => encabezadoTabla(t, AF[i])),
  ...T.defectos.map((x, i) => [celda(String(i + 1), AF[0], { size: 17 }), ...x.map((v, j) => celda(v, AF[j + 1], { size: 17 }))]),
], AF, { encabezado: true }));

// ---------- 8. Observaciones ----------
hijos.push(H1("8. Observaciones y riesgos"));
[
  "**Login del backend:** POST /api/auth/login recibe formulario OAuth2 (username/password como form-data), no JSON. El manual de pruebas del backend anterior enviaba JSON; se corrigió y S2 ya usa el formato correcto.",
  "**App de clientes:** rediseñada y validada por contrato y análisis estático; falta instalar dependencias (npm install --legacy-peer-deps) y correr S3 en el celular.",
  "**Usuarios y roles en la app del taller:** alta y consulta disponibles; la edición de permisos y la desactivación desde el celular están en progreso (el modo local ya las soporta y S1-O las valida).",
  "**Contraste:** 3 avisos de contraste bajo en textos secundarios; usan los mismos tonos que la web.",
  "**Códigos postales:** piloto solo con el municipio de León (207 CP); el catálogo nacional se carga con seed_codigos_postales.",
  "**S2 no se ejecutó desde el ambiente de desarrollo** por restricción de red (sin acceso a PyPI para instalar FastAPI); debe correrse en la PC del taller con el venv del backend.",
].forEach((t) => hijos.push(Viñeta(t)));

// ---------- Anexo ----------
hijos.push(H1("Anexo A. Cómo ejecutar las pruebas"));
hijos.push(H3("S1 — Apps móviles"));
const mono = (t) => new d.Paragraph({ spacing: { after: 0 }, shading: { fill: "EEF2F3", type: d.ShadingType.CLEAR, color: "auto" }, children: [new d.TextRun({ text: t, font: "Consolas", size: 17 })] });
["cd D:\\dev\\sistema-mecanico\\mobile", "npm run qa", "# resultado: mobile\\qa\\ultimo-reporte.txt"].forEach((t) => hijos.push(mono(t)));
hijos.push(H3("S2 — API real sobre la copia QA (PowerShell)"));
["# Ventana 1", "cd D:\\dev\\sistema-mecanico\\backend", ".\\venv\\Scripts\\Activate.ps1", "Copy-Item sistema_mecanico.db ..\\_qa_tmp\\qa_copy.db -Force   # refrescar copia (opcional)", "$env:DATABASE_URL = \"sqlite:///D:/dev/sistema-mecanico/_qa_tmp/qa_copy.db\"", "uvicorn app.main:app --port 8001", "", "# Ventana 2", "cd D:\\dev\\sistema-mecanico\\backend", ".\\venv\\Scripts\\Activate.ps1", "python tests\\pruebas_integrales.py --usuario admin --password TU_PASSWORD", "# resultado: backend\\tests\\reporte_pruebas_integrales.json"].forEach((t) => hijos.push(mono(t)));
hijos.push(H3("S3 — Dispositivo"));
["cd D:\\dev\\sistema-mecanico\\mobile          (o mobile-cliente)", "npx expo start -c", "# escanear el QR con Expo Go y seguir la tabla de la sección 5"].forEach((t) => hijos.push(mono(t)));

hijos.push(H1("Anexo B. Evidencia S1 (extracto de qa/ultimo-reporte.txt)"));
[
  `QA Apps móviles (taller + clientes) — ${T.FECHA_AUTO}`,
  "===== ✓ Flujos E2E ===== (corrida 3 de 3)",
  ...T.automatizadas.map((t) => `✓ ${t.id.replace("PI-M-", "")}. ${t.nombre}: ${t.total}/${t.total}`),
  `TOTAL: ${totAuto}/${totAuto} pruebas OK`,
  "===== ✓ Cobertura de endpoints =====  Llamadas únicas: 100 · Sin equivalente local: 0",
  "===== ✓ Rutas y estilos — app taller =====  33 rutas · 268 JSX · 1,742 estilos · Sin fallas",
  "===== ✓ Rutas y estilos — app clientes =====  7 rutas · 81 JSX · 524 estilos · Sin fallas",
  "===== ✓ Contrato con el backend =====  230 rutas · taller 92 · cliente 17 · Sin ruta: 0",
  "===== ✓ Paridad de campos con la web =====  133/133",
  "Todo en verde.",
].forEach((t) => hijos.push(mono(t)));

const doc = L.documento({ titulo: "Reporte de Pruebas Integrales", codigo: "CRQ40067 · TAS30160 · Pruebas Integrales v1.0", secciones: hijos });
d.Packer.toBuffer(doc).then((b) => { fs.writeFileSync("CRQ40067_TAS30160_PruebasIntegrales.docx", b); console.log("ok"); });
