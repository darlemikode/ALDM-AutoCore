import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Clientes from "./pages/Clientes";
import Vehiculos from "./pages/Vehiculos";
import Servicios from "./pages/Servicios";
import ServicioDetalle from "./pages/ServicioDetalle";
import Citas from "./pages/Citas";
import Promociones from "./pages/Promociones";
import Asistente from "./pages/Asistente";
import Empleados from "./pages/Empleados";
import AsignacionRoles from "./pages/AsignacionRoles";
import ConfiguracionTaller from "./pages/ConfiguracionTaller";
import Comisiones from "./pages/Comisiones";
import Inventario from "./pages/Inventario";
import Sincronizacion from "./pages/Sincronizacion";
import MiDashboard from "./pages/MiDashboard";
import Refacciones from "./pages/Refacciones";
import Proveedores from "./pages/Proveedores";
import ProveedorDetalle from "./pages/ProveedorDetalle";
import Herramientas from "./pages/Herramientas";
import Catalogos from "./pages/Catalogos";
import ConfiguracionInicio from "./pages/ConfiguracionInicio";
import Usuarios from "./pages/Usuarios";
import Roles from "./pages/Roles";
import Cotizaciones from "./pages/Cotizaciones";
import CotizacionDetalle from "./pages/CotizacionDetalle";
import Facturacion from "./pages/Facturacion";
import SuperAdmin from "./pages/superadmin/SuperAdmin";
import ScrollToTop from "./components/ScrollToTop";

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-text">Cargando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireSuperadmin({ children }) {
  const { user } = useAuth();
  if (!user?.es_superadmin) return <Navigate to="/" replace />;
  return children;
}

function RequirePermission({ clave, children }) {
  const { hasPermission } = useAuth();
  if (!hasPermission(clave)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="clientes" element={<RequirePermission clave="clientes.ver"><Clientes /></RequirePermission>} />
        <Route path="vehiculos" element={<RequirePermission clave="vehiculos.ver"><Vehiculos /></RequirePermission>} />
        <Route path="servicios" element={<RequirePermission clave="servicios.ver"><Servicios /></RequirePermission>} />
        <Route path="servicios/:id" element={<RequirePermission clave="servicios.ver"><ServicioDetalle /></RequirePermission>} />
        <Route path="cotizaciones" element={<RequirePermission clave="cotizaciones.ver"><Cotizaciones /></RequirePermission>} />
        <Route path="cotizaciones/:id" element={<RequirePermission clave="cotizaciones.ver"><CotizacionDetalle /></RequirePermission>} />
        <Route path="citas" element={<Citas />} />
        <Route path="promociones" element={<RequirePermission clave="promociones.ver"><Promociones /></RequirePermission>} />
        <Route path="asistente" element={<Asistente />} />
        <Route path="empleados" element={<RequirePermission clave="empleados.ver"><Empleados /></RequirePermission>} />
        <Route path="asignacion-roles" element={<RequirePermission clave="usuarios.ver"><AsignacionRoles /></RequirePermission>} />
        <Route path="configuracion-taller" element={<RequirePermission clave="configuracion.editar"><ConfiguracionTaller /></RequirePermission>} />
        <Route path="comisiones" element={<RequirePermission clave="configuracion.editar"><Comisiones /></RequirePermission>} />
        <Route path="sincronizacion" element={<Sincronizacion />} />
        <Route path="mi-dashboard" element={<MiDashboard />} />
        <Route path="refacciones" element={<RequirePermission clave="refacciones.ver"><Refacciones /></RequirePermission>} />
        <Route path="inventario" element={<RequirePermission clave="inventario.ver"><Inventario /></RequirePermission>} />
        <Route path="proveedores" element={<RequirePermission clave="proveedores.ver"><Proveedores /></RequirePermission>} />
        <Route path="proveedores/:id" element={<RequirePermission clave="proveedores.ver"><ProveedorDetalle /></RequirePermission>} />
        <Route path="herramientas" element={<RequirePermission clave="herramientas.ver"><Herramientas /></RequirePermission>} />
        <Route path="catalogos" element={<RequirePermission clave="catalogos.ver"><Catalogos /></RequirePermission>} />
        <Route path="configuracion" element={<ConfiguracionInicio />} />
        <Route path="usuarios" element={<RequirePermission clave="usuarios.ver"><Usuarios /></RequirePermission>} />
        <Route path="roles" element={<RequirePermission clave="roles.ver"><Roles /></RequirePermission>} />
        <Route path="superadmin/*" element={<RequireSuperadmin><SuperAdmin /></RequireSuperadmin>} />
        <Route path="facturacion" element={<RequirePermission clave="facturacion.ver"><Facturacion /></RequirePermission>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
