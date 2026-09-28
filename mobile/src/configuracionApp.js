import AsyncStorage from "@react-native-async-storage/async-storage";

// Igual que la biometría: no es un dato sensible, vive en AsyncStorage
// normal. Apagada por defecto — "omitamos la autorización del cliente"
// fue la decisión de producto original.
const VERIFICACION_2_PASOS_KEY = "sm_verificacion_2_pasos";

export async function isVerificacion2PasosActiva() {
  const value = await AsyncStorage.getItem(VERIFICACION_2_PASOS_KEY);
  return value === "true";
}

export async function setVerificacion2PasosActiva(activa) {
  await AsyncStorage.setItem(VERIFICACION_2_PASOS_KEY, activa ? "true" : "false");
}

// En modo local (sin backend real) no hay un hash de contraseña que
// verificar, así que llevamos la bandera "ya cambió la contraseña del
// admin" en AsyncStorage — arranca en false (recién sembrado con la
// contraseña de fábrica) y se pone en true cuando el admin la cambia
// desde Más > Seguridad. Sirve para replicar en local el mismo bloqueo
// que el backend real aplica al dar de alta clientes.
const ADMIN_PASSWORD_CAMBIADA_KEY = "sm_admin_password_cambiada";

export async function isPasswordAdminCambiada() {
  const value = await AsyncStorage.getItem(ADMIN_PASSWORD_CAMBIADA_KEY);
  return value === "true";
}

export async function setPasswordAdminCambiada(cambiada) {
  await AsyncStorage.setItem(ADMIN_PASSWORD_CAMBIADA_KEY, cambiada ? "true" : "false");
}
