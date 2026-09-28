import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

export default function Login() {
  const { user, login, entrarConToken } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [recovering, setRecovering] = useState(false);
  const [identificador, setIdentificador] = useState("");
  const [recoveryMsg, setRecoveryMsg] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  // Primera vez: activar el taller y registrar al administrador
  const [activando, setActivando] = useState(false);
  const [tallerActivar, setTallerActivar] = useState(null);
  const [act, setAct] = useState({ codigo_taller: "", codigo_activacion: "", nombre_completo: "", username: "", password: "", confirmar: "" });
  const [errorAct, setErrorAct] = useState("");
  const [cargandoAct, setCargandoAct] = useState(false);
  const campoAct = (k, mayus = false) => (e) => setAct((a) => ({ ...a, [k]: mayus ? e.target.value.toUpperCase() : e.target.value }));

  async function handleActivar(e) {
    e.preventDefault();
    setErrorAct("");
    setCargandoAct(true);
    try {
      if (!tallerActivar) {
        setTallerActivar(await api.post("/auth/verificar-activacion", { codigo_taller: act.codigo_taller, codigo_activacion: act.codigo_activacion }));
      } else {
        if (act.password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
        if (act.password !== act.confirmar) throw new Error("Las contraseñas no coinciden.");
        const data = await api.post("/auth/activar-taller", {
          codigo_taller: act.codigo_taller, codigo_activacion: act.codigo_activacion,
          nombre_completo: act.nombre_completo, username: act.username.trim(), password: act.password,
        });
        await entrarConToken(data.access_token);
        navigate("/");
      }
    } catch (err) {
      setErrorAct(err.message);
    } finally {
      setCargandoAct(false);
    }
  }

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRecoverySubmit(e) {
    e.preventDefault();
    setRecoveryLoading(true);
    setRecoveryMsg("");
    try {
      const res = await api.post("/auth/recuperar-password", { identificador });
      setRecoveryMsg(res.detail);
    } catch (err) {
      setRecoveryMsg(err.message);
    } finally {
      setRecoveryLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="brand">
          ALDM <span>AutoCore</span>
        </div>
        <div className="tagline">Panel de administración del taller</div>

        {activando ? (
          <>
            <form onSubmit={handleActivar}>
              <div className="field-stack">
                <div className="recovery-msg" style={{ marginBottom: 4 }}>
                  {tallerActivar
                    ? <>Activa <b>{tallerActivar.nombre}</b>: crea tu usuario de administrador. Con él vas a entrar de aquí en adelante.</>
                    : "Escribe los códigos que te mandó ALDM. Solo se hace la primera vez."}
                </div>
                {!tallerActivar ? (
                  <>
                    <div className="field">
                      <label>Código del taller</label>
                      <input value={act.codigo_taller} onChange={campoAct("codigo_taller", true)} required autoFocus />
                    </div>
                    <div className="field">
                      <label>Código de activación</label>
                      <input value={act.codigo_activacion} onChange={campoAct("codigo_activacion", true)} required />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="field">
                      <label>Nombre completo</label>
                      <input value={act.nombre_completo} onChange={campoAct("nombre_completo")} required autoFocus />
                    </div>
                    <div className="field">
                      <label>Usuario</label>
                      <input value={act.username} onChange={campoAct("username")} required autoCapitalize="none" />
                    </div>
                    <div className="field">
                      <label>Contraseña</label>
                      <input type="password" value={act.password} onChange={campoAct("password")} required minLength={6} placeholder="Mínimo 6 caracteres" />
                    </div>
                    <div className="field">
                      <label>Confirmar contraseña</label>
                      <input type="password" value={act.confirmar} onChange={campoAct("confirmar")} required />
                    </div>
                  </>
                )}
              </div>
              {errorAct && <div className="error-text">{errorAct}</div>}
              <button className="btn btn-primary" style={{ width: "100%" }} disabled={cargandoAct}>
                {cargandoAct ? "Un momento…" : tallerActivar ? "Crear mi usuario y entrar" : "Continuar"}
              </button>
            </form>
            <button type="button" className="btn-link" onClick={() => { setActivando(false); setTallerActivar(null); setErrorAct(""); }}>
              ← Volver a iniciar sesión
            </button>
          </>
        ) : !recovering ? (
          <>
            <form onSubmit={handleSubmit}>
              <div className="field-stack">
                <div className="field">
                  <label>Usuario</label>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
                </div>
                <div className="field">
                  <label>Contraseña</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
              </div>
              {error && <div className="error-text">{error}</div>}
              <button className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
                {loading ? "Entrando…" : "Entrar"}
              </button>
            </form>
            <button
              type="button"
              className="btn-link"
              onClick={() => { setRecovering(true); setRecoveryMsg(""); setIdentificador(""); }}
            >
              ¿Olvidaste tu contraseña?
            </button>
            <button type="button" className="btn-link" onClick={() => { setActivando(true); setErrorAct(""); }}>
              ¿Primera vez? Activa tu taller
            </button>
          </>
        ) : (
          <>
            <form onSubmit={handleRecoverySubmit}>
              <div className="field-stack">
                <div className="field">
                  <label>Usuario, correo o teléfono</label>
                  <input value={identificador} onChange={(e) => setIdentificador(e.target.value)} required autoFocus placeholder="Con lo que te registró el admin" />
                </div>
              </div>
              {recoveryMsg && <div className="recovery-msg">{recoveryMsg}</div>}
              <button className="btn btn-primary" style={{ width: "100%" }} disabled={recoveryLoading}>
                {recoveryLoading ? "Enviando…" : "Avisar al administrador"}
              </button>
            </form>
            <button type="button" className="btn-link" onClick={() => setRecovering(false)}>
              ← Volver a iniciar sesión
            </button>
          </>
        )}
      </div>
    </div>
  );
}
