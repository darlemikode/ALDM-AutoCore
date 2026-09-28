// Captura rápida en campos numéricos (cantidades, precios, kilometraje…):
// al posicionarse en el campo se borra el número para escribir directo el
// nuevo; si sales sin escribir nada, regresa el valor que tenía.
// Se aplica a toda la app con un solo listener (no hay que tocar cada input).
function esNumerico(el) {
  return el instanceof HTMLInputElement && el.type === "number" && !el.readOnly && !el.disabled && !el.dataset.sinBorrar;
}

document.addEventListener(
  "focusin",
  (e) => {
    const el = e.target;
    if (!esNumerico(el) || el.value === "") return;
    el.dataset.valorPrevio = el.value;
    el.dataset.placeholderPrevio = el.placeholder || "";
    el.placeholder = el.value;
    el.value = "";
  },
  true
);

// Fase de captura: corre ANTES que los onBlur de React, así el componente
// ya lee el valor restaurado si no se escribió nada.
document.addEventListener(
  "focusout",
  (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || el.dataset.valorPrevio === undefined) return;
    if (el.value === "") el.value = el.dataset.valorPrevio;
    el.placeholder = el.dataset.placeholderPrevio || "";
    delete el.dataset.valorPrevio;
    delete el.dataset.placeholderPrevio;
  },
  true
);
