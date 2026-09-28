// Descripciones al pasar el mouse, para toda la app.
// - Cualquier elemento con title, aria-label o data-tip muestra un globo con
//   el texto (se reemplaza el title nativo, que tarda y se ve distinto en
//   cada navegador).
// - Botones/enlaces que solo tienen un ícono y no traen descripción toman
//   una genérica según el ícono (✕ → "Cerrar", 🗑️ → "Eliminar", …).
const POR_ICONO = {
  "✕": "Cerrar", "×": "Cerrar", "✖": "Cerrar", "✏️": "Editar", "✎": "Editar", "🗑️": "Eliminar", "🗑": "Eliminar",
  "🔍": "Buscar", "💬": "Abrir chat", "←": "Regresar", "→": "Siguiente", "↺": "Reabrir", "↻": "Actualizar",
  "➕": "Agregar", "+": "Agregar", "🖨️": "Imprimir", "📄": "Ver documento", "📷": "Tomar foto", "📎": "Adjuntar",
  "⬇️": "Descargar", "👁️": "Ver", "🔔": "Notificaciones", "⚙️": "Configuración", "☰": "Menú", "⋯": "Más opciones",
  "▲": "Contraer", "▼": "Expandir", "✓": "Confirmar", "💾": "Guardar", "📋": "Copiar", "🛠️": "Estatus",
};
const TIENE_TEXTO = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]/;

let globo = null;
let objetivo = null;
let temporizador = null;

function textoDe(el) {
  if (el.tagName === "IFRAME") return null;
  if (el.title) {
    el.dataset.tip = el.title;
    el.removeAttribute("title");
  }
  if (el.dataset.tip) return el.dataset.tip;
  if (el.getAttribute("aria-label")) return el.getAttribute("aria-label");
  if (el.matches("button, a, [role=button]")) {
    const texto = (el.textContent || "").trim();
    if (texto && !TIENE_TEXTO.test(texto) && POR_ICONO[texto]) return POR_ICONO[texto];
  }
  return null;
}

function buscar(el) {
  while (el && el !== document.body) {
    if (el.nodeType === 1) {
      const t = textoDe(el);
      if (t) return [el, t];
    }
    el = el.parentElement;
  }
  return [null, null];
}

function ocultar() {
  clearTimeout(temporizador);
  objetivo = null;
  if (globo) globo.classList.remove("visible");
}

function mostrar(el, texto) {
  if (!globo) {
    globo = document.createElement("div");
    globo.className = "tip-globo";
    globo.setAttribute("role", "tooltip");
    document.body.appendChild(globo);
  }
  globo.textContent = texto;
  globo.classList.add("visible");
  const r = el.getBoundingClientRect();
  const g = globo.getBoundingClientRect();
  let top = r.top - g.height - 8;
  let abajo = false;
  if (top < 6) { top = r.bottom + 8; abajo = true; }
  let left = r.left + r.width / 2 - g.width / 2;
  left = Math.max(6, Math.min(left, window.innerWidth - g.width - 6));
  globo.style.top = `${top}px`;
  globo.style.left = `${left}px`;
  globo.classList.toggle("abajo", abajo);
}

document.addEventListener("mouseover", (e) => {
  const [el, texto] = buscar(e.target);
  if (el === objetivo) return;
  ocultar();
  if (!el) return;
  objetivo = el;
  temporizador = setTimeout(() => objetivo === el && mostrar(el, texto), 250);
}, true);
document.addEventListener("mouseout", (e) => {
  if (objetivo && !objetivo.contains(e.relatedTarget)) ocultar();
}, true);
document.addEventListener("mousedown", ocultar, true);
window.addEventListener("scroll", ocultar, true);
