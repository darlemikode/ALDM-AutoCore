// Un solo lugar para la URL del backend — antes vivía dentro de api.js,
// pero conexion.js también la necesita y api.js importa cosas de
// conexion.js, así que quedaba en un ciclo. Aquí no depende de nada.
import Constants from "expo-constants";

// Cambia esto en app.json (expo.extra.apiUrl) por la IP de tu servidor
// backend en la misma red que tu teléfono, ej: "http://192.168.1.100:8000/api"
export const API_URL = Constants.expoConfig?.extra?.apiUrl || "http://192.168.1.100:8000/api";
export const WS_URL = Constants.expoConfig?.extra?.wsUrl || "ws://192.168.1.100:8000";
