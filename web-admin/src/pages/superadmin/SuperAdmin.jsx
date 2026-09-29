// Panel de súper administración de ALDM AutoCore (web). Mismas funciones
// que la app móvil mobile-superadmin: talleres clientes, su suscripción y
// cobranza, usuarios y accesos, paquetes/tipos de cobro/módulos y reglas.
// Solo lo ve quien tiene es_superadmin (el backend también lo exige).
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import Resumen from "./Resumen";
import Talleres from "./Talleres";
import TallerDetalle from "./TallerDetalle";
import Cobranza from "./Cobranza";
import Usuarios from "./Usuarios";
import UsuarioDetalle from "./UsuarioDetalle";
import Catalogos from "./Catalogos";
import Reglas from "./Reglas";
import Solicitudes from "./Solicitudes";

const PESTANAS = [
  ["resumen", "Resumen"],
  ["talleres", "Talleres"],
  ["solicitudes", "Solicitudes"],
  ["cobranza", "Cobranza"],
  ["usuarios", "Usuarios"],
  ["catalogos", "Paquetes y cobros"],
  ["reglas", "Reglas"],
];

export default function SuperAdmin() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Súper admin</h1>
          <div className="subtitle">Talleres clientes, suscripciones y cobranza de ALDM AutoCore</div>
        </div>
      </div>
      <nav className="sa-tabs">
        {PESTANAS.map(([ruta, texto]) => (
          <NavLink key={ruta} to={`/superadmin/${ruta}`} className={({ isActive }) => "sa-tab" + (isActive ? " sa-tab-activo" : "")}>
            {texto}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Navigate to="resumen" replace />} />
        <Route path="resumen" element={<Resumen />} />
        <Route path="talleres" element={<Talleres />} />
        <Route path="talleres/:id" element={<TallerDetalle />} />
        <Route path="solicitudes" element={<Solicitudes />} />
        <Route path="cobranza" element={<Cobranza />} />
        <Route path="usuarios" element={<Usuarios />} />
        <Route path="usuarios/:id" element={<UsuarioDetalle />} />
        <Route path="catalogos" element={<Catalogos />} />
        <Route path="reglas" element={<Reglas />} />
        <Route path="*" element={<Navigate to="resumen" replace />} />
      </Routes>
    </>
  );
}
