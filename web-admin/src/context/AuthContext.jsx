import { createContext, useContext, useEffect, useState } from "react";
import { api, getToken, setToken, login as apiLogin } from "../api";
import { iniciarActualizacionesGlobales, detenerActualizacionesGlobales, suscribirActualizacionGlobal } from "../actualizacionesGlobales";
import { iniciarMonitoreoNotificaciones, detenerMonitoreoNotificaciones } from "../notificaciones";

const AuthContext = createContext(null);
const ELEGIR_KEY = "sm_elegir_taller";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [permisos, setPermisos] = useState([]);
  const [loading, setLoading] = useState(true);
  // Recién entró y tiene acceso a más de un taller: se le pide elegir
  const [eligiendoTaller, setEligiendoTaller] = useState(() => sessionStorage.getItem(ELEGIR_KEY) === "1");

  function aplicarPerfil(me) {
    setUser(me);
    setPermisos(me.permisos || []);
  }

  useEffect(() => {
    async function loadUser() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        aplicarPerfil(await api.get("/auth/me"));
        iniciarActualizacionesGlobales();
        iniciarMonitoreoNotificaciones();
      } catch (err) {
        // Solo se cierra la sesión si el servidor la rechazó. Un fallo de red
        // (o una petición cortada por recargar la página) no debe sacar al
        // usuario: el token se conserva y al recargar vuelve a entrar.
        if (err?.status === 401 || err?.status === 403) setToken(null);
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, []);

  // Si un admin edita este rol (o le cambian el rol al usuario) mientras
  // está conectado, refresca sus permisos sin que tenga que cerrar sesión.
  useEffect(() => {
    if (!user) return;
    async function refrescarPermisos() {
      try {
        aplicarPerfil(await api.get("/auth/me"));
      } catch {
        // si falla (p.ej. sesión ya no válida) no hacemos nada, el resto
        // de la app ya maneja el 401
      }
    }
    const quitar1 = suscribirActualizacionGlobal("roles", refrescarPermisos);
    const quitar2 = suscribirActualizacionGlobal("usuarios", refrescarPermisos);
    return () => {
      quitar1();
      quitar2();
    };
  }, [user?.username, user?.id_taller]);

  async function login(username, password) {
    const data = await apiLogin(username, password);
    const me = await api.get("/auth/me");
    aplicarPerfil(me);
    const variosTalleres = (data.talleres || []).length > 1;
    if (variosTalleres) sessionStorage.setItem(ELEGIR_KEY, "1");
    setEligiendoTaller(variosTalleres);
    iniciarActualizacionesGlobales();
    iniciarMonitoreoNotificaciones();
  }

  // Primera vez de un taller: el dueño registró su usuario y ya trae token
  async function entrarConToken(token) {
    setToken(token);
    aplicarPerfil(await api.get("/auth/me"));
    iniciarActualizacionesGlobales();
    iniciarMonitoreoNotificaciones();
  }

  // Cambiar de taller: nuevo token con ese taller y se recarga todo el
  // panel desde cero para que ninguna pantalla se quede con datos del otro.
  async function seleccionarTaller(idTaller) {
    const data = await api.post("/auth/seleccionar-taller", { id_taller: idTaller });
    setToken(data.access_token);
    sessionStorage.removeItem(ELEGIR_KEY);
    window.location.href = "/";
  }

  function continuarEnTallerActual() {
    sessionStorage.removeItem(ELEGIR_KEY);
    setEligiendoTaller(false);
  }

  function logout() {
    setToken(null);
    setUser(null);
    setPermisos([]);
    sessionStorage.removeItem(ELEGIR_KEY);
    detenerActualizacionesGlobales();
    detenerMonitoreoNotificaciones();
  }

  // hasPermission("clientes.eliminar") — así se pregunta en cualquier
  // pantalla si el rol actual puede hacer algo, en vez del viejo isAdmin fijo.
  // Los permisos ya vienen filtrados por el paquete contratado del taller.
  function hasPermission(clave) {
    return permisos.includes(clave);
  }

  const talleres = user?.talleres || [];
  const estadoSuscripcion = user?.estado_suscripcion || null;

  return (
    <AuthContext.Provider
      value={{
        user, loading, login, logout, permisos, hasPermission,
        talleres, estadoSuscripcion, seleccionarTaller, eligiendoTaller, continuarEnTallerActual, entrarConToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
