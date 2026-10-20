import { useEffect, useState } from "react";
import logoAldm from "../assets/logo-aldm.png";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { Icono } from "../components/Icono";
import { validarPassword } from "../validarPassword";

const CARACTERISTICAS = [
  { icono: "wrench", titulo: "Órdenes de servicio", texto: "Diagnóstico, autorización, reparación y entrega en un solo tablero." },
  { icono: "car", titulo: "Clientes y vehículos", texto: "Historial completo de cada auto y cada cliente del taller." },
  { icono: "cube", titulo: "Inventario y compras", texto: "Refacciones, proveedores y existencias siempre al día." },
  { icono: "document-text", titulo: "Facturación CFDI", texto: "Factura directo desde la orden, sin pasos de más." },
];

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
  const [recoveryCooldown, setRecoveryCooldown] = useState(0);

  useEffect(() => {
    if (recoveryCooldown <= 0) return;
    const t = setInterval(() => setRecoveryCooldown((s) => (s > 1 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [recoveryCooldown]);

  // Primera vez: activar el taller y registrar al administrador
  const [activando, setActivando] = useState(false);
  const [tallerActivar, setTallerActivar] = useState(null);
  const [act, setAct] = useState({ codigo_taller: "", codigo_activacion: "", nombre_completo: "", username: "", correo: "", password: "", confirmar: "" });
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
        if (!validarPassword(act.password, [act.username, act.correo, act.nombre_completo]).every((r) => r.ok)) throw new Error("La contraseña no cumple los requisitos.");
        if (act.password !== act.confirmar) throw new Error("Las contraseñas no coinciden.");
        const data = await api.post("/auth/activar-taller", {
          codigo_taller: act.codigo_taller, codigo_activacion: act.codigo_activacion,
          nombre_completo: act.nombre_completo, username: act.username.trim(),
          correo: act.correo.trim(), password: act.password,
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
    if (recoveryCooldown > 0) return;
    setRecoveryLoading(true);
    setRecoveryMsg("");
    try {
      const res = await api.post("/auth/password/solicitar", { correo: identificador });
      setRecoveryMsg(res.detail);
    } catch (err) {
      setRecoveryMsg(err.message);
    } finally {
      setRecoveryCooldown(30);
      setRecoveryLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <aside className="login-aside">
        <img src={logoAldm} alt="ALDM AutoCore · Administración de talleres mecánicos" className="login-logo" />
        <h1 className="login-aside-titulo">
          Todo tu taller,<br />
          <span>en un solo lugar</span>
        </h1>
        <p className="login-aside-sub">Órdenes, clientes, inventario y facturación sobre la misma información — sin pagar por usuario.</p>
        <ul className="login-aside-features">
          {CARACTERISTICAS.map((c) => (
            <li key={c.icono}>
              <span className="login-aside-ico"><Icono nombre={c.icono} size={21} /></span>
              <div>
                <b>{c.titulo}</b>
                <span>{c.texto}</span>
              </div>
            </li>
          ))}
        </ul>
        <div className="login-aside-pie">Administración de talleres mecánicos</div>
      </aside>

      <div className="login-main">
        <img src={logoAldm} alt="ALDM AutoCore · Administración de talleres mecánicos" className="login-logo-movil" />
        <div className="login-card">
          <div className="brand">
            Bienvenido
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
                      <label>Correo electrónico</label>
                      <input type="email" value={act.correo} onChange={campoAct("correo")} required placeholder="Con este vas a entrar de aquí en adelante" />
                    </div>
                    <div className="field">
                      <label>Contraseña</label>
                      <input type="password" value={act.password} onChange={campoAct("password")} required minLength={6} placeholder="Mínimo 6 caracteres" />
                      {act.password && (
                        <ul className="password-checklist">
                          {validarPassword(act.password, [act.username, act.correo, act.nombre_completo]).map((r) => (
                            <li key={r.clave} className={r.ok ? "ok" : ""}>
                              <Icono nombre={r.ok ? "check-circle" : "x-circle"} size={14} />
                              {r.label}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="field">
                      <label>Confirmar contraseña</label>
                      <input type="password" value={act.confirmar} onChange={campoAct("confirmar")} required />
                    </div>
                  </>
                )}
              </div>
              {errorAct && <div className="error-text">{errorAct}</div>}
              <button
                className="btn btn-primary"
                style={{ width: "100%" }}
                disabled={cargandoAct || (tallerActivar && (!validarPassword(act.password, [act.username, act.correo, act.nombre_completo]).every((r) => r.ok) || act.password !== act.confirmar))}
              >
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
                  <label>Correo electrónico</label>
                  <input type="text" inputMode="email" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus autoCapitalize="none" placeholder="Usuarios antiguos: también puede ser tu usuario" />
                </div>
                <div className="field">
                  <label>Contraseña</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
              </div>
              {error && <div className="error-text">{error}</div>}
              <button className="btn btn-entrar" style={{ width: "100%" }} disabled={loading}>
                {loading ? (
                  "Entrando…"
                ) : (
                  <>
                    Entrar
                    <Icono nombre="log-out" size={18} className="btn-entrar-ico" />
                  </>
                )}
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
                  <label>Correo electrónico</label>
                  <input type="email" value={identificador} onChange={(e) => setIdentificador(e.target.value)} required autoFocus autoCapitalize="none" placeholder="Con el que entras al sistema" />
                </div>
              </div>
              {recoveryMsg && <div className="recovery-msg">{recoveryMsg}</div>}
              <button className="btn btn-primary" style={{ width: "100%" }} disabled={recoveryLoading || recoveryCooldown > 0}>
                {recoveryLoading ? "Enviando…" : recoveryCooldown > 0 ? `Espera ${recoveryCooldown}s` : "Mandarme el enlace"}
              </button>
            </form>
            <button type="button" className="btn-link" onClick={() => setRecovering(false)}>
              ← Volver a iniciar sesión
            </button>
          </>
          )}

          <div className="login-legal">
            <a href="https://aldmautocore.com/terminos-condiciones.html" target="_blank" rel="noopener noreferrer">Términos y condiciones</a>
            <span>·</span>
            <a href="https://aldmautocore.com/aviso-privacidad.html" target="_blank" rel="noopener noreferrer">Aviso de privacidad</a>
          </div>
        </div>
      </div>
    </div>
  );
}
