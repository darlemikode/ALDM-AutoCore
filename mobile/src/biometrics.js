import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Esta preferencia (activar/desactivar biometría) no es sensible, así que
// vive en AsyncStorage normal. El token de sesión en sí vive en SecureStore
// (ver api.js) y solo se "desbloquea" para usarlo después de pasar la
// biometría, cuando está activada.
const BIOMETRIC_PREF_KEY = "sm_biometric_enabled";

export async function isBiometricHardwareAvailable() {
  if (Platform.OS === "web") return false; // no hay huella/rostro en un navegador
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return false;
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return isEnrolled; // el usuario ya tiene huella/rostro registrado en el teléfono
}

export async function isBiometricEnabled() {
  const value = await AsyncStorage.getItem(BIOMETRIC_PREF_KEY);
  return value === "true";
}

export async function setBiometricEnabled(enabled) {
  await AsyncStorage.setItem(BIOMETRIC_PREF_KEY, enabled ? "true" : "false");
}

/**
 * Pide autenticación biométrica al sistema operativo.
 * Devuelve true si el usuario se autenticó correctamente.
 */
export async function authenticateWithBiometrics(motivo = "Confirma tu identidad para entrar") {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: motivo,
    cancelLabel: "Usar contraseña",
    disableDeviceFallback: false, // si falla la huella, iOS/Android ofrecen el PIN del teléfono como respaldo
  });
  return result.success;
}
