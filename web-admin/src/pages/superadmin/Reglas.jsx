import { useEffect, useState } from "react";
import { api } from "../../api";
import { useUI } from "../../context/UIContext";
import { Cargando, fmt, useCargar } from "./comun";

const CAMPOS = [
  ["dias_prueba", "Días de prueba", "Cuánto dura la prueba gratis de un taller nuevo."],
  ["dias_gracia", "Días de gracia", "Después de vencer, el taller solo puede consultar (no capturar) durante estos días."],
  ["dias_conservacion", "Días de conservación de datos", "Tiempo que se guardan los datos de un taller vencido o suspendido antes de marcarlo para depurar."],
  ["dias_aviso_vencimiento", "Días de aviso antes de vencer", "Desde cuántos días antes se avisa que la suscripción está por vencer."],
];

export default function Reglas() {
  const { notify } = useUI();
  const { datos, error } = useCargar(async () => {
    const [config, paquetes] = await Promise.all([api.get("/superadmin/configuracion"), api.get("/superadmin/paquetes")]);
    return { config, paquetes };
  });
  const [v, setV] = useState(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { if (datos) setV({ ...datos.config }); }, [datos]);
  if (!v) return <Cargando error={error} />;

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    try {
      const cuerpo = { id_paquete_prueba: v.id_paquete_prueba ? Number(v.id_paquete_prueba) : null };
      for (const [k, etiqueta] of CAMPOS) {
        const n = parseInt(String(v[k]), 10);
        if (Number.isNaN(n) || n < 0) throw new Error(`Revisa "${etiqueta}": debe ser un número de 0 en adelante.`);
        cuerpo[k] = n;
      }
      await api.put("/superadmin/configuracion", cuerpo);
      notify("Reglas guardadas; aplican de inmediato a todos los talleres.", "success");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="panel" onSubmit={guardar} style={{ maxWidth: 640 }}>
      {CAMPOS.map(([k, etiqueta, ayuda]) => (
        <div className="field" key={k} style={{ marginBottom: 14 }}>
          <label>{etiqueta} (días)</label>
          <input type="number" min="0" value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
          <div className="field-hint">{ayuda}</div>
        </div>
      ))}
      <div className="field" style={{ marginBottom: 14 }}>
        <label>Paquete durante la prueba</label>
        <select value={v.id_paquete_prueba ?? ""} onChange={(e) => setV({ ...v, id_paquete_prueba: e.target.value })}>
          <option value="">— Ninguno —</option>
          {datos.paquetes.map((p) => <option key={p.id_paquete} value={p.id_paquete}>{p.nombre} · {fmt(p.precio_mensual)}</option>)}
        </select>
        <div className="field-hint">El que se propone al dar de alta un taller en prueba.</div>
      </div>
      <button className="btn btn-primary" disabled={guardando}>{guardando ? "Guardando…" : "Guardar reglas"}</button>
    </form>
  );
}
