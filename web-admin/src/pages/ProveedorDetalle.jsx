import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import FormModal from "../components/FormModal";
import FotoGaleria from "../components/FotoGaleria";
import { useAuth } from "../context/AuthContext";

export default function ProveedorDetalle() {
  const { id } = useParams();
  const { hasPermission } = useAuth();
  const [proveedor, setProveedor] = useState(null);
  const [productos, setProductos] = useState([]);
  const [deudas, setDeudas] = useState([]);
  const [addingProducto, setAddingProducto] = useState(false);
  const [addingDeuda, setAddingDeuda] = useState(false);

  async function load() {
    const [p, prod, deu] = await Promise.all([
      api.get(`/proveedores/${id}`),
      api.get(`/proveedores/${id}/productos`),
      api.get(`/proveedores/${id}/deudas`),
    ]);
    setProveedor(p);
    setProductos(prod);
    setDeudas(deu);
  }

  useEffect(() => { load(); }, [id]);

  if (!proveedor) return <div className="loading-text">Cargando…</div>;

  const fmt = (n) => `$${(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
  const deudaTotal = deudas.reduce((acc, d) => acc + (d.saldo_total || 0), 0);

  async function handleAddProducto(values) {
    await api.post(`/proveedores/${id}/productos`, values);
    setAddingProducto(false);
    load();
  }

  async function handleAddDeuda(values) {
    await api.post(`/proveedores/${id}/deudas`, {
      ...values,
      monto_total: Number(values.monto_total),
      saldo_total: Number(values.saldo_total),
      cantidad_producto: Number(values.cantidad_producto || 0),
    });
    setAddingDeuda(false);
    load();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>🚚 {proveedor.nombre_proveedor}</h1>
          <div className="subtitle">{proveedor.empresa_proveedor || "Proveedor"} · {proveedor.telefono1_proveedor || "sin teléfono"}</div>
        </div>
        <Link className="btn btn-secondary" to="/proveedores">← Volver</Link>
      </div>

      <div className="kpi-grid">
        <div className={`kpi-card ${deudaTotal > 0 ? "alert" : "ok"}`}>
          <div className="kpi-label">Saldo que le debemos</div>
          <div className="kpi-value mono">{fmt(deudaTotal)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Productos ofrecidos</div>
          <div className="kpi-value">{productos.length}</div>
        </div>
      </div>

      <div className="panel">
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 18 }}>Productos que ofrece</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setAddingProducto(true)}>📦 Agregar producto</button>
        </div>
        {productos.length === 0 ? (
          <div className="empty-state">Sin productos registrados.</div>
        ) : (
          <table>
            <thead><tr><th>Producto</th><th>Comentario</th></tr></thead>
            <tbody>
              {productos.map((p) => (
                <tr key={p.id_producto_proveedor}><td>{p.nombre_producto}</td><td>{p.comentario || "—"}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 18 }}>Deuda / cuentas por pagar</h2>
          {hasPermission("proveedores.editar") && <button className="btn btn-primary btn-sm" onClick={() => setAddingDeuda(true)}>💳 Registrar deuda</button>}
        </div>
        {deudas.length === 0 ? (
          <div className="empty-state">Sin adeudos registrados.</div>
        ) : (
          <table>
            <thead><tr><th>Fecha</th><th>Monto total</th><th>Saldo</th><th>Comentario</th></tr></thead>
            <tbody>
              {deudas.map((d) => (
                <tr key={d.id_deuda}>
                  <td>{d.fecha ? new Date(d.fecha).toLocaleDateString("es-MX") : "—"}</td>
                  <td className="mono">{fmt(d.monto_total)}</td>
                  <td className="mono">{fmt(d.saldo_total)}</td>
                  <td>{d.comentario || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {addingProducto && (
        <FormModal
          title="Agregar producto del proveedor"
          icono="📦"
          subtitulo={`Producto que ofrece ${proveedor.nombre_proveedor}.`}
          fields={[
            { name: "nombre_producto", label: "Nombre del producto", required: true, full: true },
            { name: "comentario", label: "Comentario", type: "textarea", full: true },
          ]}
          initialValues={{}}
          onSubmit={handleAddProducto}
          onClose={() => setAddingProducto(false)}
        />
      )}

      {addingDeuda && (
        <FormModal
          title="Registrar deuda con el proveedor"
          icono="💳"
          colorAcento="warn"
          subtitulo={`Cuenta por pagar a ${proveedor.nombre_proveedor}.`}
          fields={[
            { name: "monto_total", label: "Monto total", type: "number", required: true },
            { name: "saldo_total", label: "Saldo pendiente", type: "number", required: true },
            { name: "cantidad_producto", label: "Cantidad de producto", type: "number" },
            { name: "comentario", label: "Comentario", type: "textarea", full: true },
          ]}
          initialValues={{}}
          onSubmit={handleAddDeuda}
          onClose={() => setAddingDeuda(false)}
        />
      )}

      <div className="panel" style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 16, marginBottom: 10 }}>Fotos</h2>
        <FotoGaleria entidadTipo="proveedor" entidadId={proveedor.id_proveedor} puedeEditar={hasPermission("proveedores.editar")} />
      </div>
    </>
  );
}
