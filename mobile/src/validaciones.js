// Reglas de validación compartidas por los formularios de la app.
//
// Teléfono: exactamente 10 dígitos, ni menos ni más — el estándar de
// número celular/fijo en México sin lada de país. Se limpia lo que no sea
// dígito (espacios, guiones, paréntesis) para que "33 1234 5678" o
// "(33) 1234-5678" cuenten los 10 dígitos igual, pero el valor guardado
// queda solo con números.

export function soloDigitos(texto) {
  return String(texto ?? "").replace(/\D/g, "");
}

// true si son exactamente 10 dígitos. `opcional`: si el campo puede ir
// vacío, una cadena vacía también se considera válida (el required, si
// aplica, se revisa aparte).
export function telefonoValido(texto, { opcional = false } = {}) {
  const digitos = soloDigitos(texto);
  if (!digitos) return opcional;
  return digitos.length === 10;
}

export const MENSAJE_TELEFONO_INVALIDO = "El teléfono debe tener exactamente 10 dígitos.";

// Correo: formato nombre@dominio.ext (opcional si va vacío).
export function correoValido(texto, { opcional = true } = {}) {
  const t = String(texto ?? "").trim();
  if (!t) return opcional;
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(t);
}

export const MENSAJE_CORREO_INVALIDO = "Escribe un correo válido, por ejemplo nombre@correo.com";
