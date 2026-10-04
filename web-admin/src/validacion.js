// Validación visible y homologada: campo en rojo + mensaje bajo el campo.
// Se usa tanto para el `required` nativo (ver Atajos.jsx) como para las
// validaciones manuales de cada pantalla.
export function limpiarCampo(campo) {
  if (!campo) return;
  campo.classList.remove("campo-invalido");
  campo.querySelectorAll(".campo-error-msg").forEach((n) => n.remove());
}

export function marcarCampo(el, mensaje = "Este campo es obligatorio") {
  if (!el) return;
  const campo = el.closest(".field") || el.parentElement;
  if (!campo) return;
  limpiarCampo(campo);
  campo.classList.add("campo-invalido");
  const msg = document.createElement("div");
  msg.className = "campo-error-msg";
  msg.textContent = mensaje;
  campo.appendChild(msg);
  const quitar = () => limpiarCampo(campo);
  el.addEventListener("input", quitar, { once: true });
  el.addEventListener("change", quitar, { once: true });
  setTimeout(() => { el.focus?.(); el.scrollIntoView?.({ block: "center" }); }, 0);
}
