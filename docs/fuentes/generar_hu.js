const fs = require("fs");
const L = require("./lib");
const { d, C, ANCHO, P, H1, H2, H3, Viñeta, listaNumerada, celda, etiqueta, encabezadoTabla, tabla, ficha, tituloBloque, celdaEstado, espacio } = L;
const EPICAS = require("./datos_hu");

const todas = EPICAS.flatMap((e) => e.hus.map((h) => ({ ...h, epica: e.epica })));
const cuenta = (est) => todas.filter((h) => h.estado === est).length;
const hijos = [];

// ---- Portada / datos del documento ----
hijos.push(tabla([[
  celda([new d.Paragraph({ spacing: { after: 0 }, children: [new d.TextRun({ text: "ALDM AutoCore", bold: true, size: 26, color: C.petrol }), new d.TextRun({ text: "  ·  Dirección de Sistemas", size: 20, color: C.gris })] })], 5040, { valign: d.VerticalAlign.CENTER }),
  celda([new d.Paragraph({ alignment: d.AlignmentType.RIGHT, spacing: { after: 0 }, children: [new d.TextRun({ text: "Historias de Usuario (HU)", bold: true, size: 26, color: C.ink })] })], 5040, { valign: d.VerticalAlign.CENTER }),
]], [5040, 5040]));
hijos.push(espacio(160));
hijos.push(tabla([
  [L.etiqueta("Proyecto:", 2200), celda("Sistema Mecánico ALDM AutoCore — migración a versión web + apps móviles (taller y clientes)", 4280), L.etiqueta("Fecha:", 1500), celda("26 de septiembre de 2026", 2100)],
  [L.etiqueta("N° Track / CRQ:", 2200), celda("CRQ40067", 4280), L.etiqueta("Tarea:", 1500), celda("TAS30160", 2100)],
  [L.etiqueta("Responsable de Sistemas:", 2200), celda("", 4280), L.etiqueta("Versión:", 1500), celda("1.0", 2100)],
  [L.etiqueta("Aplicaciones:", 2200), celda("API (FastAPI) · Panel web (React) · App del taller (Expo) · App de clientes (Expo)", 4280), L.etiqueta("Total HU:", 1500), celda(`${todas.length} en ${EPICAS.length} épicas`, 2100)],
], [2200, 4280, 1500, 2100]));

// ---- 1. Objetivo y alcance ----
hijos.push(H1("1. Objetivo y alcance"));
hijos.push(P("Documentar, en formato de historias de usuario, todas las funciones del Sistema Mecánico ALDM AutoCore tal como quedaron implementadas al 26 de septiembre de 2026, con sus criterios de aceptación, las plataformas donde aplican, su estado y las pruebas que las respaldan. Este documento es la base de trazabilidad del **Reporte de Pruebas Integrales (CRQ40067_TAS30160_PruebasIntegrales)**."));
hijos.push(H2("Plataformas"));
[
  "**API** — backend FastAPI (230 rutas) con base SQLite / SQL Server / PostgreSQL y WebSocket para eventos en vivo.",
  "**Web** — panel de administración React para todo el personal y la super administración.",
  "**App taller** — app Expo (SDK 57) para el personal, con modo local (SQLite en el teléfono) y diseño homologado con la web.",
  "**App clientes** — app Expo para los clientes del taller: seguimiento en vivo, costos, chat, citas y asistente.",
].forEach((t) => hijos.push(Viñeta(t)));
hijos.push(H2("Fuera de alcance de las apps móviles (decisión del proyecto)"));
["Módulo de Super Administración (solo panel web).", "Emisión y cancelación de facturas CFDI (en la app del taller solo consulta y descarga)."].forEach((t) => hijos.push(Viñeta(t)));

// ---- 2. Actores ----
hijos.push(H1("2. Actores"));
hijos.push(tabla([
  [L.encabezadoTabla("Actor", 2600), L.encabezadoTabla("Descripción", 7480)],
  ...[
    ["Administrador General", "Acceso total: configuración, usuarios, roles, catálogos y todos los módulos operativos."],
    ["Jefe de Taller / Receptor", "Administra catálogos, promociones, vehículos, órdenes y refacciones; clientes, herramientas y proveedores sin eliminar."],
    ["Asesor de Servicio / Caja", "Abre órdenes, captura conceptos y cobros; consulta clientes, vehículos y refacciones."],
    ["Técnico / Mecánico", "Ve las órdenes asignadas y su propio dashboard; actualiza etapas, inspección y chat."],
    ["Cliente del taller", "Usa la app de clientes: sigue su vehículo, ve costos, platica con el taller y agenda citas."],
    ["ALDM AutoCore (super admin)", "Administra talleres cliente, paquetes, módulos y suscripciones (solo web)."],
  ].map(([a, b]) => [celda(a, 2600, { bold: true }), celda(b, 7480)]),
], [2600, 7480], { encabezado: true }));

// ---- 3. Convenciones ----
hijos.push(H1("3. Convenciones"));
hijos.push(P("Formato de cada historia: **Como** [actor] **quiero** [acción] **para** [beneficio]. Los criterios de aceptación son verificables y están ligados a casos del reporte de pruebas integrales (PI-xx automatizados contra la API real, PI-M-x automatizados de las apps, PI-D-xx en dispositivo)."));
hijos.push(tabla([
  [L.encabezadoTabla("Estado", 3400), L.encabezadoTabla("Significado", 6680)],
  [celdaEstado("OK", 3400), celda("Funciona y la cubren pruebas automatizadas en verde.", 6680)],
  [celdaEstado("DISP", 3400), celda("Implementada y verificada por contrato con el backend; falta la corrida en celular (Expo Go).", 6680)],
  [celdaEstado("PROG", 3400), celda("Funciona parcialmente; se indica en la nota qué falta.", 6680)],
  [celdaEstado("WEB", 3400), celda("Disponible solo en el panel web por decisión de alcance.", 6680)],
], [3400, 6680], { encabezado: true }));

// ---- 4. Resumen ----
hijos.push(H1("4. Resumen por épica"));
const anchosRes = [3280, 1100, 1400, 1500, 1300, 1500];
hijos.push(tabla([
  ["Épica", "HU", "Probadas", "Validar en disp.", "En progreso", "Solo web"].map((t, i) => L.encabezadoTabla(t, anchosRes[i], { align: i ? d.AlignmentType.CENTER : undefined })),
  ...EPICAS.map((e) => {
    const n = (est) => e.hus.filter((h) => h.estado === est).length || "—";
    return [celda(e.epica, anchosRes[0], { bold: true }), ...[e.hus.length, n("OK"), n("DISP"), n("PROG"), n("WEB")].map((v, i) => celda(String(v), anchosRes[i + 1], { align: d.AlignmentType.CENTER }))];
  }),
  [celda("Total", anchosRes[0], { bold: true, fondo: C.label }), ...[todas.length, cuenta("OK"), cuenta("DISP"), cuenta("PROG"), cuenta("WEB")].map((v, i) => celda(String(v), anchosRes[i + 1], { align: d.AlignmentType.CENTER, bold: true, fondo: C.label }))],
], anchosRes, { encabezado: true }));

// ---- 5. HU detalladas ----
hijos.push(H1("5. Historias de usuario"));
const A = [2000, ANCHO - 2000];
EPICAS.forEach((e, ie) => {
  hijos.push(H2(`5.${ie + 1} ${e.epica}`));
  e.hus.forEach((h) => {
    hijos.push(tabla([
      [celda(`${h.id} · ${h.titulo}`, ANCHO, { span: 2, bold: true, fondo: C.petrol, color: "FFFFFF", size: 20, keep: true })],
      [etiqueta("Historia", A[0], { keep: true }), celda(`**Como** ${h.como}, **quiero** ${h.quiero}, **para** ${h.para}.`, A[1], { keep: true })],
      [etiqueta("Criterios de aceptación", A[0], { keep: true }), celda(listaNumerada(h.ca, true), A[1])],
      [etiqueta("Plataformas", A[0], { keep: true }), celda(h.plat.join(" · "), A[1], { keep: true })],
      [etiqueta("Prioridad", A[0], { keep: true }), celda(h.prio, A[1], { keep: true })],
      [etiqueta("Estado", A[0], { keep: true }), celdaEstado(h.estado, A[1], h.nota ? `${L.ESTADOS[h.estado][0]} — ${h.nota}` : undefined, true)],
      [etiqueta("Pruebas", A[0]), celda(h.pruebas.join(", "), A[1])],
    ], A));
    hijos.push(espacio(160));
  });
});

// ---- 6. Control de versiones ----
hijos.push(H1("6. Control de versiones"));
const Av = [1200, 2200, 2700, 3980];
hijos.push(tabla([
  ["Versión", "Fecha", "Autor", "Cambios"].map((t, i) => L.encabezadoTabla(t, Av[i])),
  [celda("1.0", Av[0]), celda("26/09/2026", Av[1]), celda("", Av[2]), celda(`Versión inicial: ${todas.length} HU documentadas sobre el sistema implementado.`, Av[3])],
], Av, { encabezado: true }));
hijos.push(espacio(200));
hijos.push(tabla([
  [L.encabezadoTabla("Revisión y aprobación", ANCHO, { span: 3 })],
  [L.etiqueta("Rol", 3000), L.etiqueta("Nombre", 4080), L.etiqueta("Firma / Fecha", 3000)],
  ...["Usuario (dueño del producto)", "Responsable de Sistemas", "Calidad TI"].map((r) => [celda(r, 3000, { bold: true }), celda("", 4080), celda("", 3000)]),
], [3000, 4080, 3000]));

const doc = L.documento({ titulo: "Historias de Usuario", codigo: "CRQ40067 · TAS30160 · HU v1.0", secciones: hijos });
d.Packer.toBuffer(doc).then((b) => { fs.writeFileSync("CRQ40067_TAS30160_HistoriasUsuario.docx", b); console.log("HU:", todas.length); });
