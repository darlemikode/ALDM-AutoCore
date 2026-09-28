import { createContext, useContext, useEffect, useState } from "react";
import { api, getToken, setToken, login as apiLogin, esTokenLocal } from "../api";
import {
  isBiometricHardwareAvailable, isBiometricEnabled, setBiometricEnabled,
  authenticateWithBiometrics,
} from "../biometrics";
import { olvidarNavegacion } from "../navigation/estadoNavegacion";
import { suscribirActualizacionGlobal } from "../actualizacionesGlobales";
import { alerta } from "../ui/Dialogo";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [permisos, setPermisos] = useState([]);
  const [loading, setLoading] = useState(true);
  // Cuando hay una sesión guardada pero la biometría está activada y aún no
  // se ha confirmado, la app se queda en este estado de "bloqueada" en vez
  // de restaurar la sesión directamente.
  const [lockedByBiometrics, setLockedByBiometrics] = useState(false);
  // Recién entró y su usuario puede entrar a más de un taller: elige a cuál
  const [eligiendoTaller, setEligiendoTaller] = useState(false);

  async function restaurarSesion() {
    const token = await getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    const biometriaActiva = await isBiometricEnabled();
    if (biometriaActiva) {
      setLockedByBiometrics(true);
      setLoading(false);
      return; // espera a que la persona toque "Desbloquear con biometría"
    }
    await validarTokenYEntrar();
  }

  async function validarTokenYEntrar() {
    try {
      const me = await api.get("/auth/me");
      setUser(me);
      setPermisos(me.permisos || []);
      setLockedByBiometrics(false);
    } catch {
      await setToken(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    restaurarSesion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si un admin edita este rol (o le cambian el rol al usuario) mientras
  // tiene la app abierta, refresca sus permisos sin que tenga que salir y
  // volver a entrar.
  useEffect(() => {
    if (!user) return;
    async function refrescarPermisos() {
      try {
        const me = await api.get("/auth/me");
        setUser(me);
        setPermisos(me.permisos || []);
      } catch {
        // si falla, el resto de la app ya maneja la sesión inválida
      }
    }
    const quitar1 = suscribirActualizacionGlobal("roles", refrescarPermisos);
    const quitar2 = suscribirActualizacionGlobal("usuarios", refrescarPermisos);
    return () => {
      quitar1();
      quitar2();
    };
  }, [user?.username, user?.id_taller]);

  async function desbloquearConBiometria() {
    const ok = await authenticateWithBiometrics("Entra a ALDM AutoCore");
    if (ok) {
      setLoading(true);
      await validarTokenYEntrar();
      return true;
    }
    return false;
  }

  async function login(username, password) {
    const data = await apiLogin(username, password);
    if (esTokenLocal(data.access_token)) {
      setUser({ username, nombre_completo: data.nombre_completo || username, rol: { nombre: data.rol } });
      setPermisos(data.permisos || []);
    } else {
      const me = await api.get("/auth/me");
      setUser(me);
      setPermisos(me.permisos || []);
      setEligiendoTaller((data.talleres || []).length > 1);
    }
    setLockedByBiometrics(false);
    await ofrecerActivarBiometria();
  }

  // Primera vez de un taller: el dueño registró su usuario y ya trae token
  async function entrarConToken(token) {
    await setToken(token);
    const me = await api.get("/auth/me");
    setUser(me);
    setPermisos(me.permisos || []);
    setLockedByBiometrics(false);
  }

  // Cambiar de taller: nuevo token ligado a ese taller y se vuelve a
  // cargar el perfil (permisos, suscripción). La navegación se reinicia
  // desde cero (ver App.js: key={user.id_taller}).
  async function seleccionarTaller(idTaller) {
    const data = await api.post("/auth/seleccionar-taller", { id_taller: idTaller });
    await setToken(data.access_token);
    olvidarNavegacion();
    const me = await api.get("/auth/me");
    setUser(me);
    setPermisos(me.permisos || []);
    setEligiendoTaller(false);
  }

  function continuarEnTallerActual() {
    setEligiendoTaller(false);
  }

  async function ofrecerActivarBiometria() {
    const yaActiva = await isBiometricEnabled();
    if (yaActiva) return;
    const disponible = await isBiometricHardwareAvailable();
    if (!disponible) return;

    alerta(
      "Entrar con huella o Face ID",
      "¿Quieres usar la biometría de tu teléfono para entrar más rápido la próxima vez, en lugar de escribir tu contraseña?",
      [
        { text: "Ahora no", style: "cancel" },
        {
          text: "Activar",
          onPress: async () => {
            const confirmado = await authenticateWithBiometrics("Confirma para activar el acceso biométrico");
            if (confirmado) await setBiometricEnabled(true);
          },
        },
      ]
    );
  }

  async function desactivarBiometria() {
    await setBiometricEnabled(false);
  }

  async function logout() {
    olvidarNavegacion(); // al volver a entrar se empieza en la pantalla principal
    await setToken(null);
    await setBiometricEnabled(false);
    setUser(null);
    setPermisos([]);
    setLockedByBiometrics(false);
    setEligiendoTaller(false);
  }

  function hasPermission(clave) {
    return permisos.includes(clave);
  }

  return (
    <AuthContext.Provider
      value={{
        user, loading, login, logout,
        lockedByBiometrics, desbloquearConBiometria, desactivarBiometria,
        permisos, hasPermission,
        talleres: user?.talleres || [], estadoSuscripcion: user?.estado_suscripcion || null,
        seleccionarTaller, eligiendoTaller, continuarEnTallerActual, entrarConToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
