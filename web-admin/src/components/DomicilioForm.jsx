import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useUI } from "../context/UIContext";
import MapaUbicacion from "./MapaUbicacion";

export const DOMICILIO_VACIO = { calle: "", numero: "", colonia: "", cp: "", ciudad: "", estado: "", referencias: "", maps_url: "", lat: null, lng: null, id_empleado_mecanico: "" };

/** ¿Hay lo mínimo para ir al domicilio? (calle, enlace de mapa o ubicación) */
export const domicilioCompleto = (f) => !!(String(f.calle || "").trim() || String(f.maps_url || "").trim() || (f.lat != null && f.lng != null));

export const domicilioPayload = (f) => ({
  calle: f.calle || null, numero: f.numero || null, colonia: f.colonia || null, cp: f.cp || null,
  ciudad: f.ciudad || null, estado: f.estado || null, referencias: f.referencias || null,
  maps_url: f.maps_url || null, lat: f.lat, lng: f.lng,
  id_empleado_mecanico: f.id_empleado_mecanico ? Number(f.id_empleado_mecanico) : null,
});

const IcoPin = ({ s = 18 }) => (
  <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></svg>
);

/** Campos de dirección, ubicación y mecánico (se usa al crear la orden y al editarla). */
export default function DomicilioForm({ form, setForm, empleados = [] }) {
  const { notify } = useUI();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  // Al corregir un dato de la dirección el mapa se vuelve a ubicar solo con la nueva dirección
  const setDir = (k) => (e) => { origenCoord.current = "direccion"; setForm((f) => ({ ...f, [k]: e.target.value })); };
  const [estado, setEstado] = useState(null); // { tipo: "cargando"|"ok"|"aviso"|"error", texto }
  const ultimo = useRef("");
  const [colonias, setColonias] = useState([]);
  const [cpInfo, setCpInfo] = useState(null); // { tipo, texto }
  // Buscador con sugerencias (como Maps): se escribe calle, colonia o lugar y se elige de la lista
  const [busca, setBusca] = useState("");
  const [sugs, setSugs] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(-1);
  const [buscando, setBuscando] = useState(false);
  const ultimaBusca = useRef("");
  const origenCoord = useRef(form.lat != null ? "otro" : null); // de dónde salió el pin: "direccion" | "otro"
  const dirHecha = useRef("");
  const [coordTxt, setCoordTxt] = useState(form.lat != null ? `${form.lat}, ${form.lng}` : "");
  const [fijarDir, setFijarDir] = useState(false); // fraccionamientos privados: el pin no debe cambiar la dirección escrita
  const coordRef = useRef(null);
  const [mapaMsg, setMapaMsg] = useState(null);
  const cpHecho = useRef(String(form.cp || "")); // el C.P. con el que ya abrió el formulario no se vuelve a buscar

  // Del enlace de Maps / de las coordenadas se llenan solos calle, colonia, C.P., ciudad y estado
  async function resolver(body, etiqueta) {
    setEstado({ tipo: "cargando", texto: "Buscando la dirección…" });
    try {
      const r = await api.post("/servicio-domicilio/resolver-ubicacion", body);
      origenCoord.current = "otro"; // pin del enlace / GPS / ajuste manual: la dirección escrita ya no lo mueve
      setMapaMsg(null);
      if (r.cp) cpHecho.current = r.cp; // ya viene completo: el complemento por C.P. no debe pisarlo
      setForm((f) => ({
        ...f, lat: r.lat, lng: r.lng,
        calle: r.calle || f.calle, numero: body.url ? (r.numero || f.numero) : (r.numero || ""), colonia: r.colonia || f.colonia,
        cp: r.cp || f.cp, ciudad: r.ciudad || f.ciudad, estado: r.estado || f.estado,
      }));
      setEstado(r.fuente === "google"
        ? { tipo: "ok", texto: "Dirección tomada de Google Maps. Revísala y agrega referencias." }
        : r.direccion_encontrada
          ? { tipo: "aviso", texto: r.numero ? `Dirección tomada de ${etiqueta}: revisa que el número ${r.numero} sea el correcto.` : `Dirección aproximada por ${etiqueta}: no se halló el número, escríbelo.` }
          : { tipo: "aviso", texto: "Se guardó la ubicación del mapa, pero no se encontró la calle. Escríbela." });
    } catch (e) {
      setEstado({ tipo: "error", texto: e.message || "No se pudo leer la ubicación." });
    }
  }

  useEffect(() => {
    const url = String(form.maps_url || "").trim();
    if (!/^https:\/\/\S{8,}$/i.test(url) || url === ultimo.current) return undefined;
    const t = setTimeout(() => { ultimo.current = url; resolver({ url }, "el enlace"); }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.maps_url]);

  useEffect(() => {
    const q = busca.trim();
    if (q.length < 3 || q === ultimaBusca.current) { if (q.length < 3) setSugs([]); return undefined; }
    const t = setTimeout(async () => {
      ultimaBusca.current = q;
      setBuscando(true);
      try {
        const ctx = form.lat != null ? `&lat=${form.lat}&lng=${form.lng}` : "";
        const r = await api.get(`/servicio-domicilio/sugerencias?q=${encodeURIComponent(q)}${ctx}`);
        setSugs(r || []); setActiva(-1); setAbierto(true);
      } catch { setSugs([]); } finally { setBuscando(false); }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  function elegir(s) {
    origenCoord.current = "otro";
    cpHecho.current = s.cp || cpHecho.current;
    dirHecha.current = "";
    setForm((f) => ({
      ...f, lat: s.lat, lng: s.lng,
      calle: s.calle || f.calle, numero: s.numero || "", colonia: s.colonia || f.colonia, cp: s.cp || f.cp, ciudad: s.ciudad || f.ciudad, estado: s.estado || f.estado,
    }));
    setBusca(""); ultimaBusca.current = ""; setSugs([]); setAbierto(false);
    setMapaMsg({ tipo: s.numero ? "ok" : "aviso", texto: s.numero ? "Dirección elegida. Ajusta el pin si no queda en la puerta." : "Elegiste la calle; falta el número. Arrastra o haz clic en el mapa para marcar la puerta." });
  }
  const teclas = (e) => {
    if (!abierto || !sugs.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiva((i) => (i + 1) % sugs.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiva((i) => (i <= 0 ? sugs.length - 1 : i - 1)); }
    else if (e.key === "Enter" && activa >= 0) { e.preventDefault(); elegir(sugs[activa]); }
    else if (e.key === "Escape") { e.stopPropagation(); setAbierto(false); }
  };

  // Con la dirección completa se genera el mapa solo (calle, colonia, C.P., ciudad y estado; el número es opcional)
  useEffect(() => {
    const completo = ["calle", "colonia", "ciudad", "estado"].every((k) => String(form[k] || "").trim()) && /^\d{5}$/.test(String(form.cp || ""));
    if (!completo || (form.lat != null && origenCoord.current !== "direccion")) return undefined;
    const clave = JSON.stringify([form.calle, form.numero, form.colonia, form.cp, form.ciudad, form.estado].map((v) => String(v || "").trim().toLowerCase()));
    if (clave === dirHecha.current) return undefined;
    const t = setTimeout(async () => {
      dirHecha.current = clave;
      setMapaMsg({ tipo: "cargando", texto: "Generando el mapa con la dirección…" });
      try {
        const r = await api.post("/servicio-domicilio/geocodificar", { calle: form.calle, numero: form.numero, colonia: form.colonia, cp: form.cp, ciudad: form.ciudad, estado: form.estado });
        origenCoord.current = "direccion";
        setForm((f) => ({ ...f, lat: r.lat, lng: r.lng }));
        setMapaMsg(r.precision === "direccion"
          ? { tipo: "ok", texto: "Mapa generado con la dirección. Si el pin no queda en la puerta, arrastra el mapa." }
          : { tipo: "aviso", texto: `Ubicación aproximada (${r.precision === "colonia" ? "por la colonia" : "por el C.P."}). Arrastra el mapa hasta la puerta del domicilio.` });
      } catch (e) {
        setMapaMsg({ tipo: "aviso", texto: e.message || "No se pudo generar el mapa." });
      }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.calle, form.numero, form.colonia, form.cp, form.ciudad, form.estado, form.lat]);

  // Complemento por C.P.: al completar los 5 dígitos se llenan estado y ciudad y se ofrecen las colonias
  useEffect(() => {
    const cp = String(form.cp || "").trim();
    if (!/^\d{5}$/.test(cp)) { if (cpHecho.current && cp.length < 5) { cpHecho.current = ""; setColonias([]); setCpInfo(null); } return undefined; }
    if (cp === cpHecho.current) return undefined;
    const t = setTimeout(async () => {
      cpHecho.current = cp;
      setCpInfo({ tipo: "cargando", texto: "Buscando el código postal…" });
      try {
        const r = await api.get(`/servicio-domicilio/cp/${cp}`);
        const lista = r.colonias || [];
        setColonias(lista);
        setForm((f) => ({
          ...f,
          estado: r.estado || f.estado,
          ciudad: r.ciudad || r.municipio || f.ciudad,
          colonia: lista.length === 1 ? lista[0] : f.colonia,
        }));
        setCpInfo({ tipo: "ok", texto: lista.length > 1 ? `${r.ciudad || r.municipio || ""}, ${r.estado || ""} · elige la colonia (${lista.length} opciones).` : `${r.ciudad || r.municipio || ""}, ${r.estado || ""}.` });
      } catch (e) {
        setColonias([]);
        setCpInfo({ tipo: "aviso", texto: e.message || "No se pudo consultar el código postal." });
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.cp]);

  function miUbicacion() {
    if (!navigator.geolocation) { notify("Este navegador no permite obtener la ubicación.", "error"); return; }
    notify("Obteniendo ubicación…", "info");
    navigator.geolocation.getCurrentPosition(
      (p) => resolver({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) }, "tu ubicación"),
      () => notify("No se pudo obtener la ubicación. Permite el acceso o pega un enlace de Google Maps.", "error"),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  const hayUbi = form.lat != null && form.lng != null;

  // El campo de coordenadas sigue al pin (salvo mientras se está escribiendo en él)
  useEffect(() => {
    if (document.activeElement === coordRef.current) return;
    setCoordTxt(form.lat != null && form.lng != null ? `${form.lat}, ${form.lng}` : "");
  }, [form.lat, form.lng]);

  // Coordenadas escritas o pegadas (p. ej. «clic derecho» en Google Maps > copiar coordenadas)
  function escribirCoords(txt) {
    setCoordTxt(txt);
    const m = txt.match(/(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (!m) return;
    const la = Number(m[1]), lo = Number(m[2]);
    if (!(la >= 14 && la <= 33 && lo >= -119 && lo <= -86)) { setMapaMsg({ tipo: "aviso", texto: "Esas coordenadas no están en México. Revisa que sean latitud, longitud (ej. 21.13709, -101.646931)." }); return; }
    origenCoord.current = "otro";
    setFijarDir(true);
    setForm((f) => ({ ...f, lat: Number(la.toFixed(6)), lng: Number(lo.toFixed(6)) }));
    setMapaMsg({ tipo: "ok", texto: "Pin colocado con las coordenadas. La dirección escrita se conserva." });
  }
  function moverPin(la, lo) {
    if (!fijarDir) { resolver({ lat: la, lng: lo }, "el pin del mapa"); return; }
    origenCoord.current = "otro";
    setForm((f) => ({ ...f, lat: la, lng: lo }));
  }
  const hayDatos = hayUbi || ["calle", "numero", "colonia", "cp", "ciudad", "estado", "referencias", "maps_url", "id_empleado_mecanico"].some((k) => String(form[k] || "").trim()) || busca.trim();

  // Vacía todo para empezar de nuevo (dirección, enlace, pin, mecánico y avisos)
  function limpiar() {
    origenCoord.current = null; dirHecha.current = ""; cpHecho.current = ""; ultimo.current = ""; ultimaBusca.current = "";
    setForm({ ...DOMICILIO_VACIO });
    setCoordTxt(""); setFijarDir(false);
    setBusca(""); setSugs([]); setAbierto(false); setColonias([]); setCpInfo(null); setMapaMsg(null); setEstado(null);
    notify("Datos limpios. Empieza de nuevo con una búsqueda, un enlace o tu ubicación.", "info");
  }

  return (
    <div className="dom-form-campos grande">
      <div className="dom-mapa-col">
        {hayUbi ? (
          <MapaUbicacion lat={form.lat} lng={form.lng} alto="100%" onMover={moverPin} />
        ) : (
          <div className="dom-mapa-vacio dom-mapa-grande">
            <IcoPin s={44} />
            <b>Aquí aparecerá el mapa</b>
            <span>Busca la dirección, pega el enlace de Maps, usa tu ubicación o llena calle, colonia, C.P., ciudad y estado.</span>
          </div>
        )}
        {mapaMsg && <p className={`dom-estado dom-mapa-aviso ${mapaMsg.tipo}`} role="status">{mapaMsg.tipo === "cargando" ? "⏳ " : mapaMsg.tipo === "ok" ? "✓ " : "⚠ "}{mapaMsg.texto}</p>}
      </div>

      <div className="dom-panel">
        <div className="dom-panel-cab">
          <h3>Datos del servicio</h3>
          <button type="button" className="dom-limpiar" onClick={limpiar} disabled={!hayDatos}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6" /></svg>
            Limpiar datos
          </button>
        </div>
        <div className="dom-panel-cuerpo">
          <section className="dom-sec">
            <h3><i>1</i> ¿A dónde va el mecánico?</h3>
            <div className="dom-busca">
              <label>Buscar dirección
                <input value={busca} onChange={(e) => { setBusca(e.target.value); setAbierto(true); }} onFocus={() => sugs.length && setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)} onKeyDown={teclas}
                  placeholder="Calle, número (opcional)" autoComplete="off" role="combobox" aria-expanded={abierto && sugs.length > 0} aria-autocomplete="list" />
              </label>
              {buscando && <span className="dom-busca-spin" aria-hidden="true" />}
              {abierto && busca.trim().length >= 3 && (
                <ul className="dom-sugs" role="listbox">
                  {sugs.length === 0 && !buscando && <li className="vacio">Sin resultados. Prueba con menos datos (calle y colonia) o pega un enlace de Maps.</li>}
                  {sugs.map((s, i) => (
                    <li key={`${s.lat}${s.lng}${i}`} role="option" aria-selected={i === activa} className={i === activa ? "act" : ""} onMouseDown={(e) => { e.preventDefault(); elegir(s); }} onMouseEnter={() => setActiva(i)}>
                      <IcoPin s={16} /><span><b>{s.titulo}</b><small>{s.subtitulo}</small></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <label className="dom-enlace-campo">Enlace Maps / Waze
              <input value={form.maps_url} onChange={set("maps_url")} placeholder="https://maps.app.goo.gl/…" maxLength={500} />
            </label>
            {estado && <p className={`dom-estado ${estado.tipo}`} role="status">{estado.tipo === "cargando" ? "⏳ " : estado.tipo === "ok" ? "✓ " : "⚠ "}{estado.texto}</p>}
            <label className="dom-enlace-campo">Coordenadas
              <input ref={coordRef} value={coordTxt} onChange={(e) => escribirCoords(e.target.value)} onBlur={() => setCoordTxt(form.lat != null ? `${form.lat}, ${form.lng}` : coordTxt)}
                placeholder="000.000000, 000.000000" inputMode="decimal" autoComplete="off" maxLength={60} />
            </label>
            <label className="dom-fijar">
              <input type="checkbox" checked={fijarDir} onChange={(e) => setFijarDir(e.target.checked)} />
              <span>Conservar la dirección escrita al mover el pin</span>
            </label>
            <div className="dom-ubi">
              <button type="button" className={`dom-btn-ubi ${hayUbi ? "ok" : ""}`} onClick={miUbicacion}>
                <IcoPin /> {hayUbi ? "Usar mi ubicación otra vez" : "Usar mi ubicación actual"}
              </button>
              {hayUbi && <span className="dom-coords">{form.lat}, {form.lng} <button type="button" onClick={() => setForm((f) => ({ ...f, lat: null, lng: null }))}>Quitar pin</button></span>}
            </div>
          </section>

          <section className="dom-sec">
            <h3><i>2</i> Dirección <small>se llena sola o edítala</small></h3>
            <div className="dom-fila dom-f-calle">
              <label>Calle<input value={form.calle} onChange={setDir("calle")} maxLength={150} placeholder="Av. Reforma" /></label>
              <label>Número<input value={form.numero} onChange={setDir("numero")} maxLength={30} placeholder="123" /></label>
            </div>
            <div className="dom-fila dom-f-calle">
              <label>Colonia
                <input value={form.colonia} onChange={setDir("colonia")} maxLength={100} list="dom-colonias" placeholder={colonias.length > 1 ? "Elige o escribe…" : ""} autoComplete="off" />
                <datalist id="dom-colonias">{colonias.map((c) => <option key={c} value={c} />)}</datalist>
              </label>
              <label>C.P.<input value={form.cp} onChange={(e) => { origenCoord.current = "direccion"; setForm((f) => ({ ...f, cp: e.target.value.replace(/\D/g, "").slice(0, 5) })); }} maxLength={5} inputMode="numeric" placeholder="37530" /></label>
            </div>
            {cpInfo && <p className={`dom-estado ${cpInfo.tipo}`} role="status">{cpInfo.tipo === "cargando" ? "⏳ " : cpInfo.tipo === "ok" ? "📮 " : "⚠ "}{cpInfo.texto}</p>}
            <div className="dom-fila">
              <label>Ciudad<input value={form.ciudad} onChange={setDir("ciudad")} maxLength={100} /></label>
              <label>Estado<input value={form.estado} onChange={setDir("estado")} maxLength={100} /></label>
            </div>
            <label>Referencias<textarea rows={2} value={form.referencias} onChange={set("referencias")} maxLength={400} placeholder="Fachada, portón, entre qué calles…" /></label>
          </section>

          <section className="dom-sec">
            <h3><i>3</i> ¿Quién va? <small>puedes asignarlo después</small></h3>
            <label>
              <select value={form.id_empleado_mecanico} onChange={set("id_empleado_mecanico")}>
                <option value="">Sin asignar</option>
                {empleados.map((e) => <option key={e.id_empleado} value={e.id_empleado}>{[e.nombre, e.paterno].filter(Boolean).join(" ")}</option>)}
              </select>
            </label>
            <p className="dom-ayuda">Al guardar se genera un <b>código de 6 dígitos</b> para el cliente y un <b>enlace</b> para el mecánico.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
