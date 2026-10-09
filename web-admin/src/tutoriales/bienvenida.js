// Tutorial 1 · Recorrido de bienvenida (web). Cada paso ilumina un elemento;
// si no existe en la pantalla (p. ej. un solo taller, menú en celular) se brinca.
export const BIENVENIDA = (nombre) => [
  { centro: true, titulo: `¡Hola${nombre ? `, ${nombre}` : ""}!`, texto: "Te muestro en un minuto dónde está cada cosa. Puedes saltarlo y repetirlo cuando quieras en Configuración → Ayuda." },
  { selectores: ["aside.sidebar", ".topbar-movil-hamburguesa"], titulo: "Menú de módulos", texto: "Aquí están todos los módulos, agrupados en Operación, Inventario y Administración. En el celular se abre con el botón ☰." },
  { selector: ".taller-actual", titulo: "Tu taller", texto: "Aquí ves en qué taller estás trabajando. Si manejas varios, desde aquí te cambias." },
  { selectores: [".kpi-grid .kpi-card", ".main"], titulo: "Panel general", texto: "Estas tarjetas resumen el día: clientes, órdenes abiertas, por cobrar y refacciones con poco stock. Toca cualquiera para ver el detalle." },
  { selector: ".hero-orden", titulo: "Nueva orden", texto: "Lo que más vas a usar: desde aquí abres una orden de servicio en segundos." },
  { selector: ".campana-flotante", titulo: "Avisos", texto: "La campana te avisa de mensajes de clientes, citas nuevas y solicitudes de cambio de contraseña." },
  { selector: ".nav-link-boton", titulo: "Configuración", texto: "Datos del taller, usuarios y roles, suscripción, integraciones y la Ayuda con los recorridos de cada módulo." },
  { selector: ".ayuda-flotante", titulo: "¿Necesitas ayuda?", texto: "Este botón te lleva a la Ayuda: recorridos de cada módulo, como este." },
];
