import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Clientes = lazy(() => import("./pages/Clientes"));
const Vehiculos = lazy(() => import("./pages/Vehiculos"));
const Servicios = lazy(() => import("./pages/Servicios"));
const ServicioDetalle = lazy(() => import("./pages/ServicioDetalle"));
const Citas = lazy(() => import("./pages/Citas"));
const Promociones = lazy(() => import("./pages/Promociones"));
const Asistente = lazy(() => import("./pages/Asistente"));
const Empleados = lazy(() => import("./pages/Empleados"));
const AsignacionRoles = lazy(() => import("./pages/AsignacionRoles"));
const ConfiguracionTaller = lazy(() => import("./pages/ConfiguracionTaller"));
const Comisiones = lazy(() => import("./pages/Comisiones"));
const Inventario = lazy(() => import("./pages/Inventario"));
const Errores = lazy(() => import("./pages/Errores"));
const NuevaOrden = lazy(() => import("./pages/NuevaOrden"));
const MiDashboard = lazy(() => import("./pages/MiDashboard"));
const Refacciones = lazy(() => import("./pages/Refacciones"));
const Proveedores = lazy(() => import("./pages/Proveedores"));
const ProveedorDetalle = lazy(() => import("./pages/ProveedorDetalle"));
const Herramientas = lazy(() => import("./pages/Herramientas"));
const Catalogos = lazy(() => import("./pages/Catalogos"));
const ConfiguracionInicio = lazy(() => import("./pages/ConfiguracionInicio"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const Roles = lazy(() => import("./pages/Roles"));
const Cotizaciones = lazy(() => import("./pages/Cotizaciones"));
const CotizacionDetalle = lazy(() => import("./pages/CotizacionDetalle"));
const Nomina = lazy(() => import("./pages/Nomina"));
const NominaDetalle = lazy(() => import("./pages/NominaDetalle"));
const Facturacion = lazy(() => import("./pages/Facturacion"));
const SuperAdmin = lazy(() => import("./pages/superadmin/SuperAdmin"));
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
      <Suspense fallback={<div className="loading-text">Cargando…</div>}>
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
        <Route path="servicios/nueva" element={<RequirePermission clave="servicios.crear"><NuevaOrden /></RequirePermission>} />
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
        <Route path="errores" element={<RequirePermission clave="configuracion.editar"><Errores /></RequirePermission>} />
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
        <Route path="nomina" element={<RequirePermission clave="nomina.ver"><Nomina /></RequirePermission>} />
        <Route path="nomina/:id" element={<RequirePermission clave="nomina.ver"><NominaDetalle /></RequirePermission>} />
        <Route path="facturacion" element={<RequirePermission clave="facturacion.ver"><Facturacion /></RequirePermission>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </>
  );
}
