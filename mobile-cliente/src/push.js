// Notificaciones push (Expo). Al iniciar sesión se registra el token del
// celular en el servidor (/portal-cliente/push-token) y así llegan los
// avisos: cambios de etapa en el servicio, confirmación/rechazo de citas, chat.
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { api } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function registrarPush() {
  try {
    if (!Device.isDevice) return; // en emulador no hay push
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", { name: "Avisos", importance: Notifications.AndroidImportance.HIGH });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api.post("/portal-cliente/push-token", { push_token: data });
  } catch {
    // sin permiso, sin internet o sin credenciales de push: la app sigue normal
  }
}

// Al tocar una notificación se abre la pantalla que le corresponde.
// También cubre el caso de la app cerrada: el toque que la abrió se atiende al iniciar.
const atendidas = new Set();
export function escucharToquesPush(abrir) {
  const atender = (respuesta) => {
    const id = respuesta?.notification?.request?.identifier;
    if (!respuesta || (id && atendidas.has(id))) return;
    if (id) atendidas.add(id);
    abrir(respuesta.notification.request.content?.data || {});
  };
  Notifications.getLastNotificationResponseAsync().then(atender).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(atender);
  return () => sub.remove();
}
