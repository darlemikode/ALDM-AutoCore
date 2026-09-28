import { useState } from "react";
import { api } from "../api";

/**
 * Consultas rápidas de uso interno para el staff del taller — no es de
 * cara al cliente. Antes este módulo simulaba una llamada telefónica con
 * verificación de identidad (cuenta + VIN); se reemplazó porque lo que
 * realmente se necesita es resolver preguntas del día a día sin andar
 * navegando por varias pantallas: inicia solo, sin pedir nada.
 */
export default function Asistente() {
  const [mensajes, setMensajes] = useState([]);
  const [cargando, setCargando] = useState(null);
  const [busquedaCliente, setBusquedaCliente] = useState("");

  function agregarMensaje(autor, texto) {
    setMensajes((prev) => [...prev, { autor, texto }]);
  }

  async function ejecutar(clave, etiqueta, fn) {
    agregarMensaje("staff", etiqueta);
    setCargando(clave);
    try {
      const resultado = await fn();
      agregarMensaje("bot", resultado);
    } catch (err) {
      agregarMensaje("bot", `⚠️ ${err.message}`);
    } finally {
      setCargando(null);
    }
  }

  async function buscarClientes() {
    const texto = busquedaCliente.trim();
    if (!texto) return;
    await ejecutar("buscar-cliente", `👥 Buscar cliente: "${texto}"`, async () => {
      const clientes = await api.get(`/clientes/?q=${encodeURIComponent(texto)}`);
      if (clientes.length === 0) return `No encontré ningún cliente que coincida con "${texto}".`;
      return `${clientes.length} resultado(s):\n` +
        clientes.slice(0, 10).map((c) => `• ${c.nombre_cliente} ${c.paterno_cliente || ""} (${c.numero_cuenta}) — ${c.telefono1 || "sin teléfono"}`).join("\n") +
        (clientes.length > 10 ? `\n… y ${clientes.length - 10} más.` : "");
    });
    setBusquedaCliente("");
  }

  async function serviciosPorEstatus(status, etiqueta) {
    await ejecutar(`estatus-${status}`, `🔧 Servicios ${etiqueta}`, async () => {
      const ordenes = await api.get(`/servicios/?status=${status}`);
      if (ordenes.length === 0) return `No hay órdenes ${etiqueta.toLowerCase()} en este momento.`;
      return `${ordenes.length} orden(es) ${etiqueta.toLowerCase()}:\n` +
        ordenes.slice(0, 15).map((s) => `• #${s.id_servicio} — ${s.nombre_servicio} (${s.cliente?.nombre_cliente || "—"})`).join("\n") +
        (ordenes.length > 15 ? `\n… y ${ordenes.length - 15} más.` : "");
    });
  }

  async function pendientesDePago() {
    await ejecutar("pendientes-pago", "💵 Pendientes de pago", async () => {
      const ordenes = await api.get("/servicios/?status=abierto");
      const pendientes = ordenes.filter((s) => !s.pagado && s.costos?.saldo_pendiente > 0.01);
      if (pendientes.length === 0) return "No hay ninguna orden con saldo pendiente. ✅";
      const total = pendientes.reduce((acc, s) => acc + s.costos.saldo_pendiente, 0);
      return `${pendientes.length} orden(es) con saldo pendiente, por un total de $${total.toFixed(2)}:\n` +
        pendientes.map((s) => `• #${s.id_servicio} — ${s.cliente?.nombre_cliente || "—"}: $${s.costos.saldo_pendiente.toFixed(2)}`).join("\n");
    });
  }

  async function stockBajo() {
    await ejecutar("stock-bajo", "📦 Stock bajo", async () => {
      const refacciones = await api.get("/refacciones/?bajo_stock=true");
      if (refacciones.length === 0) return "No hay ninguna refacción en stock crítico. ✅";
      return `${refacciones.length} refacción(es) con stock crítico:\n` +
        refacciones.map((r) => `• ${r.nombre_refaccion}: ${r.cantidad_refaccion} pza(s)`).join("\n");
    });
  }

  async function proximosServicio() {
    await ejecutar("proximos-servicio", "🔔 Próximos a dar servicio", async () => {
      const proximos = await api.get("/dashboard/proximos-servicios?dias_umbral=150");
      if (proximos.length === 0) return "No hay clientes próximos a dar servicio (150+ días sin visitar).";
      return `${proximos.length} cliente(s) con 150+ días sin dar servicio:\n` +
        proximos.slice(0, 15).map((p) => `• ${p.nombre_cliente} — hace ${Math.floor(p.dias_desde_ultimo_servicio / 30)} meses`).join("\n");
    });
  }

  async function deudaProveedores() {
    await ejecutar("deuda-proveedores", "🧾 Deuda con proveedores", async () => {
      const resumen = await api.get("/dashboard/resumen");
      const deuda = resumen.deuda_con_proveedores || 0;
      if (deuda <= 0.01) return "No tienes deuda pendiente con proveedores. ✅";
      return `Deuda total con proveedores: $${deuda.toFixed(2)}.`;
    });
  }

  function limpiar() {
    setMensajes([]);
  }

  const ESTATUS = [
    { status: "abierto", etiqueta: "Abiertos", icono: "🟦" },
    { status: "cerrado", etiqueta: "Cerrados", icono: "🟩" },
    { status: "cancelado", etiqueta: "Cancelados", icono: "🟥" },
  ];

  const REPORTES = [
    { clave: "pendientes-pago", icono: "💵", titulo: "Pendientes de pago", fn: pendientesDePago },
    { clave: "stock-bajo", icono: "📦", titulo: "Stock bajo", fn: stockBajo },
    { clave: "proximos-servicio", icono: "🔔", titulo: "Próximos a dar servicio", fn: proximosServicio },
    { clave: "deuda-proveedores", icono: "🧾", titulo: "Deuda con proveedores", fn: deudaProveedores },
  ];

  const OPCIONES = [
    ...ESTATUS.map((e) => ({ clave: `estatus-${e.status}`, icono: e.icono, titulo: e.etiqueta, fn: () => serviciosPorEstatus(e.status, e.etiqueta) })),
    ...REPORTES.map((r) => ({ clave: r.clave, icono: r.icono, titulo: r.titulo, fn: r.fn })),
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>💬 Asistente</h1>
          <div className="subtitle">Consultas rápidas de uso interno — clientes, servicios por estatus y reportes</div>
        </div>
        {mensajes.length > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={limpiar}>Limpiar</button>
        )}
      </div>

      <div
        className="panel"
        style={{
          maxWidth: 760, padding: 0, overflow: "hidden",
          display: "flex", flexDirection: "column",
          height: "min(640px, calc(100vh - 210px))", minHeight: 420,
        }}
      >
        {/* Historial */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 18px 14px", display: "flex", flexDirection: "column", gap: 10, background: "var(--paper-0)" }}>
          {mensajes.length === 0 && (
            <div style={{ margin: "auto", textAlign: "center", maxWidth: 340, color: "var(--ink-500)" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
              <div style={{ fontWeight: 700, color: "var(--ink-900)", fontSize: 15, marginBottom: 4 }}>¿En qué te ayudo?</div>
              <div style={{ fontSize: 13 }}>Busca un cliente o elige una consulta rápida abajo.</div>
            </div>
          )}

          {mensajes.map((m, i) => (
            <div
              key={i}
              style={{ display: "flex", gap: 8, alignItems: "flex-end", flexDirection: m.autor === "staff" ? "row-reverse" : "row" }}
            >
              <span style={{ fontSize: 14, flex: "none", opacity: 0.8 }}>{m.autor === "staff" ? "🧑‍🔧" : "💬"}</span>
              <div
                style={{
                  maxWidth: "85%",
                  background: m.autor === "staff" ? "var(--petrol-500)" : "var(--paper-100)",
                  color: m.autor === "staff" ? "#fff" : "var(--ink-900)",
                  border: m.autor === "staff" ? "none" : "1px solid var(--ink-300)",
                  borderRadius: 10,
                  padding: "8px 12px",
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: "pre-line",
                  boxShadow: "0 1px 2px rgba(20,24,28,0.05)",
                }}
              >
                {m.texto}
              </div>
            </div>
          ))}

          {cargando && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", paddingLeft: 22 }}>
              <span style={{ fontSize: 12, color: "var(--ink-500)", fontStyle: "italic" }}>Consultando…</span>
            </div>
          )}
        </div>

        {/* Opciones flotando sobre la barra de entrada */}
        <div style={{ position: "relative", padding: "0 14px" }}>
          <div
            style={{
              display: "flex", gap: 6, overflowX: "auto", padding: "8px 10px",
              background: "var(--paper-100)", border: "1px solid var(--ink-300)", borderRadius: 100,
              boxShadow: "0 6px 16px rgba(20,24,28,0.10)",
              transform: "translateY(50%)",
              scrollbarWidth: "none",
            }}
          >
            {OPCIONES.map((o) => (
              <button
                key={o.clave}
                type="button"
                className={`chip-toggle ${cargando === o.clave ? "chip-toggle-on" : ""}`}
                style={{ flex: "none", whiteSpace: "nowrap" }}
                onClick={o.fn}
                disabled={!!cargando}
              >
                {o.icono} {o.titulo}
              </button>
            ))}
          </div>
        </div>

        {/* Entrada */}
        <div style={{ display: "flex", gap: 8, padding: "26px 16px 16px", borderTop: "1px solid var(--ink-300)", background: "var(--paper-100)" }}>
          <input
            className="search-input"
            placeholder="Nombre, cuenta o teléfono…"
            value={busquedaCliente}
            onChange={(e) => setBusquedaCliente(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscarClientes()}
          />
          <button className="btn btn-primary btn-sm" onClick={buscarClientes} disabled={!!cargando}>Buscar</button>
        </div>
      </div>
    </>
  );
}
