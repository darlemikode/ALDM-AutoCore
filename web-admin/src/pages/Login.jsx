import { useEffect, useRef, useState } from "react";
import logoAldm from "../assets/logo-aldm.webp";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { Icono } from "../components/Icono";
import { validarPassword } from "../validarPassword";
import FondoTaller from "../components/FondoTaller";
import "./login-nuevo.css";

export default function Login() {
  const { user, login, entrarConToken } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pide2fa, setPide2fa] = useState(false); // súper admin: pedir el código de la app de autenticación
  const [codigo2fa, setCodigo2fa] = useState("");
  const [ver, setVer] = useState({ login: false, act: false, actConfirmar: false });
  const [paso, setPaso] = useState(1); // 1 = correo, 2 = contraseña
  const passRef = useRef(null);
  const correoRef = useRef(null);
  const tarjetaRef = useRef(null);

  // El acceso siempre es negro, aunque el tema de la app sea claro
  useEffect(() => {
    const raiz = document.documentElement;
    const previo = raiz.getAttribute("data-theme");
    raiz.setAttribute("data-theme", "dark");
    return () => { if (previo) raiz.setAttribute("data-theme", previo); else raiz.removeAttribute("data-theme"); };
  }, []);

  function sacudir() {
    const el = tarjetaRef.current;
    if (!el) return;
    el.classList.remove("lgn-sacude");
    void el.offsetWidth;
    el.classList.add("lgn-sacude");
  }
  function siguiente(e) {
    e.preventDefault();
    if (!username.trim()) { setError("Escribe tu correo."); sacudir(); return; }
    setError("");
    setPaso(2);
    setTimeout(() => passRef.current?.focus({ preventScroll: true }), 350);
  }
  function cambiarCorreo() {
    setError("");
    setPaso(1);
    setTimeout(() => correoRef.current?.focus({ preventScroll: true }), 350);
  }

  const [recovering, setRecovering] = useState(false);
  const [esNuevo, setEsNuevo] = useState(false); // "Soy usuario nuevo": el enlace sirve para crear la contraseña
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
    if (!password) { setError("Escribe tu contraseña."); sacudir(); return; }
    setLoading(true);
    setError("");
    try {
      await login(username, password, pide2fa ? codigo2fa.trim() : undefined);
      navigate("/");
    } catch (err) {
      if (err.requiere2fa) setPide2fa(true);
      setError(err.message);
      sacudir();
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
      const res = await api.post("/auth/password/solicitar", { correo: identificador, nuevo: esNuevo });
      setRecoveryMsg(res.detail);
    } catch (err) {
      setRecoveryMsg(err.message);
    } finally {
      setRecoveryCooldown(30);
      setRecoveryLoading(false);
    }
  }

  return (
    <div className="login-screen lgn">
      <FondoTaller />
      <div className="login-main">
        <div className="lgn-logo"><img src={logoAldm} alt="ALDM AutoCore · Administración de talleres mecánicos" /></div>
        <div className="login-card" ref={tarjetaRef}>
          {!activando && !recovering && (
            <div className="lgn-prog">
              <span className="lgn-prog-et">Paso {paso} de 2</span>
              <div className="lgn-puntos"><i className={paso === 1 ? "on" : ""} /><i className={paso === 2 ? "on" : ""} /></div>
            </div>
          )}
          <div className="brand">{!activando && !recovering && paso === 2 ? "Hola de nuevo" : "Bienvenido"}</div>

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
                      <div className="pass-caja">
                        <input type={ver.act ? "text" : "password"} value={act.password} onChange={campoAct("password")} required minLength={6} placeholder="Mínimo 6 caracteres" />
                        <button type="button" className={"pass-ojo" + (ver.act ? " activo" : "")} aria-pressed={ver.act} aria-label={ver.act ? "Ocultar contraseña" : "Ver contraseña"} onMouseDown={(e) => e.preventDefault()} onClick={() => setVer((v) => ({ ...v, act: !v.act }))}>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" />{!ver.act && <path d="M3 3l18 18" />}</svg>
                        </button>
                      </div>
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
                      <div className="pass-caja">
                        <input type={ver.actConfirmar ? "text" : "password"} value={act.confirmar} onChange={campoAct("confirmar")} required />
                        <button type="button" className={"pass-ojo" + (ver.actConfirmar ? " activo" : "")} aria-pressed={ver.actConfirmar} aria-label={ver.actConfirmar ? "Ocultar contraseña" : "Ver contraseña"} onMouseDown={(e) => e.preventDefault()} onClick={() => setVer((v) => ({ ...v, actConfirmar: !v.actConfirmar }))}>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" />{!ver.actConfirmar && <path d="M3 3l18 18" />}</svg>
                        </button>
                      </div>
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
            <form onSubmit={paso === 1 ? siguiente : handleSubmit} noValidate>
              <div className="lgn-pasos">
                <div className="lgn-pista" style={{ transform: paso === 1 ? "translateX(0)" : "translateX(-50%)" }}>
                  <div className="lgn-paso" aria-hidden={paso !== 1}>
                    <div className="field">
                      <label>Correo electrónico o usuario</label>
                      <div className="lgn-ico">
                        <svg className="lgn-i" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></svg>
                        <input ref={correoRef} type="text" inputMode="email" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoCapitalize="none" autoComplete="username" placeholder="correo o usuario" tabIndex={paso === 1 ? 0 : -1} />
                      </div>
                    </div>
                    {paso === 1 && error && <div className="error-text">{error}</div>}
                    <button type="submit" className="btn btn-entrar" tabIndex={paso === 1 ? 0 : -1}>
                      Continuar <span className="lgn-flecha">→</span>
                    </button>
                  </div>
                  <div className="lgn-paso" aria-hidden={paso !== 2}>
                    <div className="lgn-hola">
                      <span className="lgn-av">{(username.trim()[0] || "?").toUpperCase()}</span>
                      <span className="lgn-hola-txt">{username}</span>
                      <button type="button" onClick={cambiarCorreo} tabIndex={paso === 2 ? 0 : -1}>Cambiar</button>
                    </div>
                    <div className="field">
                      <label>Contraseña</label>
                      <div className="pass-caja lgn-ico">
                        <svg className="lgn-i" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="3" /><path d="M8 10V8a4 4 0 0 1 8 0v2" /></svg>
                        <input ref={passRef} type={ver.login ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="********" tabIndex={paso === 2 ? 0 : -1} />
                        <button type="button" tabIndex={paso === 2 ? 0 : -1} className={"pass-ojo" + (ver.login ? " activo" : "")} aria-pressed={ver.login} aria-label={ver.login ? "Ocultar contraseña" : "Ver contraseña"} onMouseDown={(e) => e.preventDefault()} onClick={() => setVer((v) => ({ ...v, login: !v.login }))}>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" />{!ver.login && <path d="M3 3l18 18" />}</svg>
                        </button>
                      </div>
                    </div>
                    {pide2fa && (
                      <div className="field">
                        <label>Código de verificación</label>
                        <div className="pass-caja">
                          <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={7} autoFocus value={codigo2fa} onChange={(e) => setCodigo2fa(e.target.value.replace(/[^0-9 ]/g, ""))} placeholder="000000" tabIndex={paso === 2 ? 0 : -1} />
                        </div>
                      </div>
                    )}
                    {paso === 2 && error && <div className="error-text">{error}</div>}
                    <button className="btn btn-entrar" disabled={loading} tabIndex={paso === 2 ? 0 : -1}>
                      {loading ? (
                        "Entrando…"
                      ) : (
                        <>
                          Entrar
                          <Icono nombre="log-out" size={18} className="btn-entrar-ico" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </form>
            <div className="lgn-enlaces">
              <button
                type="button"
                className="btn-link"
                onClick={() => { setEsNuevo(false); setRecovering(true); setRecoveryMsg(""); setIdentificador(""); }}
              >
                ¿Olvidaste tu contraseña?
              </button>
              <button type="button" className="btn-link" onClick={() => { setEsNuevo(true); setRecovering(true); setRecoveryMsg(""); setIdentificador(""); }}>
                Soy usuario nuevo
              </button>
              <button type="button" className="btn-link" onClick={() => { setActivando(true); setErrorAct(""); }}>
                ¿Primera vez? Activa tu taller
              </button>
            </div>
          </>
        ) : (
          <>
            <form onSubmit={handleRecoverySubmit}>
              {esNuevo && <p className="recovery-msg" style={{ marginBottom: 12 }}>Escribe el correo con el que te dieron de alta y te enviamos un enlace para crear tu contraseña.</p>}
              <div className="field-stack">
                <div className="field">
                  <label>Correo electrónico</label>
                  <input type="email" value={identificador} onChange={(e) => setIdentificador(e.target.value)} required autoFocus autoCapitalize="none" placeholder={esNuevo ? "El correo con el que te dieron de alta" : "Con el que entras al sistema"} />
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
