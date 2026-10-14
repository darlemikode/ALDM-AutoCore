import { registrarPush } from "../push";
import { createContext, useContext, useEffect, useState } from "react";
import { api, cargarServidor, getToken, login as apiLogin, onSesionExpirada, setToken } from "../api";
import { isBiometricHardwareAvailable, isBiometricEnabled, setBiometricEnabled, authenticateWithBiometrics } from "../biometrics";
import { alerta } from "../ui/Dialogo";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [lockedByBiometrics, setLockedByBiometrics] = useState(false);

  async function logout() {
    await setToken(null);
    await setBiometricEnabled(false);
    setUsuario(null);
    setLockedByBiometrics(false);
  }

  async function validarYEntrar() {
    try {
      const me = await api.get("/auth/me");
      if (me.es_superadmin) { setUsuario(me); setLockedByBiometrics(false); registrarPush(); }
      else { await setToken(null); setUsuario(null); setLockedByBiometrics(false); }
    } catch {
      // Token vencido o inválido: se borra y se libera el bloqueo biométrico
      // para que caiga al login normal, en vez de quedarse pidiendo huella
      // sin fin (no hay token con qué validar).
      await setToken(null);
      setUsuario(null);
      setLockedByBiometrics(false);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    onSesionExpirada(() => logout());
    (async () => {
      await cargarServidor();
      if (await getToken()) {
        const biometriaActiva = await isBiometricEnabled();
        if (biometriaActiva) {
          setLockedByBiometrics(true);
          setCargando(false);
          return; // espera a que la persona toque "Desbloquear con biometría"
        }
        await validarYEntrar();
      } else {
        setCargando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function desbloquearConBiometria() {
    const ok = await authenticateWithBiometrics("Entra a ALDM AutoCore Súper");
    if (ok) {
      setCargando(true);
      await validarYEntrar();
      return true;
    }
    return false;
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

  async function login(username, password) {
    await apiLogin(username, password);
    setUsuario(await api.get("/auth/me"));
    setLockedByBiometrics(false);
    registrarPush();
    await ofrecerActivarBiometria();
  }

  return <AuthContext.Provider value={{ usuario, cargando, login, logout, lockedByBiometrics, desbloquearConBiometria }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
