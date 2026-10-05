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

// Reglas de contacto: teléfono = 10 dígitos exactos (solo números);
// correo = formato nombre@dominio.ext. Se deducen del nombre del campo.
export const esCampoTelefono = (nombre = "") => /telefono|celular|whatsapp/i.test(nombre);
export const esCampoCorreo = (nombre = "") => /correo|email/i.test(nombre);

export function propsContacto(nombre) {
  if (esCampoTelefono(nombre)) {
    return {
      inputMode: "numeric", maxLength: 10, pattern: "[0-9]{10}", autoComplete: "off",
      "data-msg": "El teléfono debe tener 10 dígitos",
    };
  }
  if (esCampoCorreo(nombre)) {
    return {
      inputMode: "email", pattern: "[^@\\s]+@[^@\\s]+\\.[^@\\s]{2,}", autoComplete: "off",
      "data-msg": "Escribe un correo válido, por ejemplo nombre@correo.com",
    };
  }
  return {};
}

export function limpiarValorContacto(nombre, valor) {
  return esCampoTelefono(nombre) ? String(valor).replace(/\D/g, "").slice(0, 10) : valor;
}
