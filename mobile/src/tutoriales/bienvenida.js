import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../api";
import { abrirTour } from "../ui/Tour";

// Tutorial 1 · Recorrido de bienvenida (app). Cada paso ilumina un elemento;
// si no está en pantalla (p. ej. el rol no puede crear órdenes) se brinca.
export const PASOS_BIENVENIDA = (nombre, pestanas) => [
  { centro: true, titulo: `¡Hola${nombre ? `, ${nombre}` : ""}!`, texto: "Te muestro en un minuto dónde está cada cosa. Puedes saltarlo y repetirlo cuando quieras en Más → Ayuda." },
  { objetivo: "barra", titulo: "Barra de abajo", texto: "Aquí cambias entre el Panel, Clientes, Servicios y Más. Siempre está a la mano." },
  { objetivo: "nueva-orden", titulo: "Nueva orden", texto: "El botón grande abre una orden de servicio en segundos, desde cualquier pantalla." },
  { objetivo: "menu", titulo: "Menú de módulos", texto: "Con ☰ abres todos los módulos: refacciones, vehículos, citas, proveedores y más." },
  { objetivo: "campana", titulo: "Avisos", texto: "La campana te avisa de mensajes de clientes, citas nuevas y solicitudes de cambio de contraseña." },
  { objetivo: "barra", parte: { i: pestanas - 1, n: pestanas }, titulo: "Más y Ajustes", texto: "Datos del taller, usuarios, tema de color, tu contraseña y la Ayuda con los recorridos de cada módulo." },
  { centro: true, titulo: "¡Listo!", texto: "Ya conoces lo básico. Para verlo otra vez, o ver los de cada módulo, entra a Más → Ayuda." },
];

const CLAVE = "bienvenida";
const llaveLocal = (u) => `sm_tutorial_${CLAVE}_${u?.username || "x"}`;
let abiertoEnSesion = false;
// Vistos en esta sesión (para marcar «Visto ✓» en Ayuda sin esperar al servidor)
export const vistosSesion = new Set();

// Número de pestañas visibles en la barra de abajo (lo fija AppNavigator)
let pestanasVisibles = 4;
export function fijarPestanas(n) { pestanasVisibles = n; }

export function mostrarBienvenida(user) {
  abiertoEnSesion = true;
  const nombre = (user?.nombre_completo || user?.username || "").split(" ")[0];
  abrirTour(PASOS_BIENVENIDA(nombre, pestanasVisibles), () => marcarVisto(user));
}

// Se abre sola la primera vez (si el usuario no la ha visto en ningún dispositivo)
export async function bienvenidaSiFalta(user) {
  if (!user || abiertoEnSesion) return;
  if ((user.tutoriales_vistos || []).includes(CLAVE)) return;
  try { if ((await AsyncStorage.getItem(llaveLocal(user))) === "1") return; } catch { /* sin almacenamiento */ }
  mostrarBienvenida(user);
}

async function marcarVisto(user) {
  vistosSesion.add(CLAVE);
  try { await AsyncStorage.setItem(llaveLocal(user), "1"); } catch { /* sin almacenamiento */ }
  try { await api.put("/auth/tutoriales", { clave: CLAVE }); } catch { /* sin conexión: queda guardado en el celular */ }
}
