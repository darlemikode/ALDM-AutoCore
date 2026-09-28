const d = require("docx");
const {
  Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, AlignmentType,
  HeadingLevel, Header, Footer, PageNumber, TabStopType, VerticalAlign, LevelFormat,
} = d;

const C = { petrol: "166478", petrolOsc: "0E4A58", ink: "1B2226", gris: "5B6B70", label: "E3ECEE", linea: "B9C9CD", ok: "2F7D5B", okFondo: "DCEFE5", pend: "9A6700", pendFondo: "FBF0D3", falla: "C4432F", fallaFondo: "F8DFDA", web: "4B5A61", webFondo: "E8ECEE" };
const ANCHO = 10080; // Carta con márgenes de 0.75"
const FUENTE = "Arial";

function runs(texto, base = {}) {
  // **negritas** dentro del texto
  const partes = String(texto).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return partes.map((t) => (t.startsWith("**") ? new TextRun({ ...base, text: t.slice(2, -2), bold: true }) : new TextRun({ ...base, text: t })));
}
const P = (texto, o = {}) => new Paragraph({ spacing: { after: o.after ?? 120, before: o.before ?? 0, line: o.line ?? 276 }, alignment: o.align, keepNext: o.keepNext, children: runs(texto, { size: o.size ?? 20, color: o.color, bold: o.bold, italics: o.italics, font: o.font }) });
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] });
const Viñeta = (t, nivel = 0) => new Paragraph({ numbering: { reference: "viñetas", level: nivel }, spacing: { after: 60 }, children: runs(t, { size: 20 }) });
const Num = (t, ref = "numeros", keep = false) => new Paragraph({ keepNext: keep, keepLines: true, numbering: { reference: ref, level: 0 }, spacing: { after: 40 }, children: runs(t, { size: 19 }) });

const borde = { style: BorderStyle.SINGLE, size: 4, color: C.linea };
const bordes = { top: borde, bottom: borde, left: borde, right: borde };

function celda(contenido, ancho, o = {}) {
  const hijos = Array.isArray(contenido) ? contenido : [new Paragraph({ keepNext: o.keep, keepLines: true, alignment: o.align, spacing: { after: 0 }, children: runs(contenido ?? "", { size: o.size ?? 19, bold: o.bold, color: o.color }) })];
  return new TableCell({
    width: { size: ancho, type: WidthType.DXA }, borders: bordes, columnSpan: o.span, verticalAlign: o.valign ?? VerticalAlign.TOP,
    shading: o.fondo ? { fill: o.fondo, type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 110 }, children: hijos,
  });
}
const etiqueta = (t, ancho, o = {}) => celda(t, ancho, { bold: true, fondo: C.label, ...o });
const encabezadoTabla = (t, ancho, o = {}) => celda(t, ancho, { bold: true, fondo: C.petrol, color: "FFFFFF", ...o });

function tabla(filas, anchos, o = {}) {
  return new Table({ width: { size: anchos.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: anchos, rows: filas.map((f, i) => new TableRow({ children: f, tableHeader: o.encabezado && i === 0, cantSplit: true })) });
}
// Tabla de etiqueta/valor (2 o 4 columnas)
function ficha(pares, anchos = [2600, ANCHO - 2600]) {
  return tabla(pares.map(([k, v]) => [etiqueta(k, anchos[0]), celda(v, anchos[1])]), anchos);
}
function tituloBloque(texto, ancho = ANCHO) {
  return tabla([[celda(texto, ancho, { bold: true, fondo: C.petrol, color: "FFFFFF", size: 20 })]], [ancho]);
}
const ESTADOS = {
  OK: ["Implementada y probada", C.ok, C.okFondo],
  DISP: ["Implementada · validar en dispositivo", C.pend, C.pendFondo],
  PROG: ["En progreso", C.falla, C.fallaFondo],
  WEB: ["Solo panel web", C.web, C.webFondo],
  PEND: ["Pendiente de ejecución", C.pend, C.pendFondo],
  FALLA: ["Falla", C.falla, C.fallaFondo],
};
const celdaEstado = (clave, ancho, texto, keep) => { const [t, col, fondo] = ESTADOS[clave]; return celda(texto ?? t, ancho, { bold: true, color: col, fondo, keep }); };
const espacio = (n = 120) => new Paragraph({ spacing: { after: n }, children: [] });

function encabezado(tituloDoc) {
  return new Header({ children: [
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: ANCHO }],
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.petrol, space: 4 } },
      children: [new TextRun({ text: "ALDM AutoCore", bold: true, color: C.petrol, size: 18 }), new TextRun({ text: " · Sistema Mecánico (web + mobile)", color: C.gris, size: 18 }), new TextRun({ text: `\t${tituloDoc}`, color: C.gris, size: 18 })],
    }),
  ]});
}
function pie(codigo) {
  return new Footer({ children: [
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: ANCHO }],
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.linea, space: 4 } },
      children: [new TextRun({ text: codigo, color: C.gris, size: 16 }), new TextRun({ children: ["\tPágina ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES], color: C.gris, size: 16 })],
    }),
  ]});
}

function documento({ titulo, codigo, secciones }) {
  return new d.Document({
    creator: "ALDM AutoCore", title: titulo,
    styles: {
      default: { document: { run: { font: FUENTE, size: 20, color: C.ink } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 30, bold: true, color: C.petrol, font: FUENTE }, paragraph: { spacing: { before: 320, after: 140 }, outlineLevel: 0, keepNext: true } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 24, bold: true, color: C.petrolOsc, font: FUENTE }, paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 1, keepNext: true } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 21, bold: true, color: C.ink, font: FUENTE }, paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 2, keepNext: true } },
      ],
    },
    numbering: { config: [
      { reference: "viñetas", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1000, hanging: 270 } } } },
      ]},
      ...Array.from({ length: 120 }, (_, i) => ({ reference: `num${i}`, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 300 } } } }] })),
    ]},
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1000, left: 1080, right: 1080, header: 500, footer: 450 } } },
      headers: { default: encabezado(titulo) }, footers: { default: pie(codigo) },
      children: secciones,
    }],
  });
}

let contadorNum = 0;
const listaNumerada = (items, keep = false) => { const ref = `num${contadorNum++}`; return items.map((t) => Num(t, ref, keep)); };

module.exports = { d, C, ANCHO, P, H1, H2, H3, Viñeta, listaNumerada, celda, etiqueta, encabezadoTabla, tabla, ficha, tituloBloque, celdaEstado, ESTADOS, espacio, documento, runs };
