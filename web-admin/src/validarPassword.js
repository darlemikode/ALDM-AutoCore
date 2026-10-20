// Reglas de contraseña segura, compartidas por todas las pantallas donde se
// crea o cambia una contraseña (alta de usuario, cambiar contraseña,
// restablecer/crear contraseña por enlace).
//
// `datosSensibles` es una lista de textos que la contraseña NO debe
// contener (username, correo, nombre completo del propio usuario) — se
// compara en minúsculas e ignorando espacios.
export function validarPassword(pw) {
  return [
    { clave: "longitud", label: "Mínimo 8 caracteres", ok: pw.length >= 8 },
    { clave: "mayus", label: "Contiene mayúsculas", ok: /[A-Z]/.test(pw) },
    { clave: "minus", label: "Contiene minúsculas", ok: /[a-z]/.test(pw) },
    { clave: "numero", label: "Contiene números", ok: /[0-9]/.test(pw) },
  ];
}
