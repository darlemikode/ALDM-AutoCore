import { createContext, useContext, useEffect, useState } from "react";
import { api, getToken, setToken } from "../api";
import { olvidarNavegacion } from "../navigation/estadoNavegacion";
import { iniciarActualizacionesGlobales, detenerActualizacionesGlobales } from "../actualizacionesGlobales";
import { isBiometricHardwareAvailable, isBiometricEnabled, setBiometricEnabled, authenticateWithBiometrics } from "../biometrics";
import { alerta } from "../ui/Dialogo";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [cliente, setCliente] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lockedByBiometrics, setLockedByBiometrics] = useState(false);

  useEffect(() => {
    validarSesion();
  }, []);

  async function validarSesion() {
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
    await validarPerfilYEntrar();
  }

  async function validarPerfilYEntrar() {
    try {
      const perfil = await api.get("/portal-cliente/me");
      setCliente(perfil);
      setLockedByBiometrics(false);
      iniciarActualizacionesGlobales();
    } catch {
      // Token vencido o inválido: se borra y se libera el bloqueo biométrico
      // para que caiga al login normal, en vez de quedarse pidiendo huella
      // sin fin (no hay token con qué validar).
      await setToken(null);
      setCliente(null);
      setLockedByBiometrics(false);
    } finally {
      setLoading(false);
    }
  }

  async function desbloquearConBiometria() {
    const ok = await authenticateWithBiometrics("Entra a tu cuenta");
    if (ok) {
      setLoading(true);
      await validarPerfilYEntrar();
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

  async function activarCuenta(identificador, codigoInvitacion, passwordNueva) {
    const data = await api.post("/portal-cliente/activar", {
      identificador,
      codigo_invitacion: codigoInvitacion,
      password_nueva: passwordNueva,
    });
    await setToken(data.access_token);
    await validarSesion();
    await ofrecerActivarBiometria();
  }

  async function login(identificador, password) {
    const data = await api.post("/portal-cliente/login", { identificador, password });
    await setToken(data.access_token);
    await validarSesion();
    await ofrecerActivarBiometria();
  }

  async function logout() {
    olvidarNavegacion(); // al volver a entrar se empieza en la pantalla principal
    await setToken(null);
    await setBiometricEnabled(false);
    setCliente(null);
    setLockedByBiometrics(false);
    detenerActualizacionesGlobales();
  }

  return (
    <AuthContext.Provider value={{ cliente, loading, login, activarCuenta, logout, lockedByBiometrics, desbloquearConBiometria }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
