// Paquetes (precio y módulos incluidos), módulos del sistema y tipos de cobro.
import { Text } from "react-native";
import { api } from "../api";
import { colors } from "../theme";
import ListaEditable from "../ui/ListaEditable";
import { fmt } from "../ui/comunes";

// Precio calculado de un paquete para un tipo de cobro (si no tiene precio fijo)
const calculado = (mensual, t) => (Number(mensual) || 0) * t.meses * (1 - (t.descuento_porcentaje || 0) / 100);

export function PaquetesScreen() {
  return (
    <ListaEditable
      endpoint="/superadmin/paquetes"
      idCampo="id_paquete"
      etiqueta="paquete"
      icono="layers-outline"
      cargarExtra={async () => {
        const [modulos, tipos] = await Promise.all([api.get("/superadmin/modulos"), api.get("/superadmin/tipos-cobro")]);
        return { modulos, tipos };
      }}
      titulo={(p) => p.nombre}
      subtitulo={(p, extra) => {
        const precios = (extra?.tipos || []).filter((t) => t.activo).map((t) => {
          const fijo = p.precios?.find((x) => x.id_tipo_cobro === t.id_tipo_cobro);
          return `${t.nombre} ${fmt(fijo ? fijo.precio : calculado(p.precio_mensual, t))}`;
        });
        return `${p.modulos.length} módulo(s)${p.limite_usuarios ? ` · hasta ${p.limite_usuarios} usuarios` : ""}\n${precios.join(" · ")}`;
      }}
      badge={(p) => (!p.activo ? { texto: "no se ofrece", tono: "gris" } : null)}
      valoresNuevos={{ activo: true, modulos: [] }}
      valoresParaEditar={(p) => {
        const v = { ...p, modulos: (p.modulos || []).map((m) => m.clave) };
        (p.precios || []).forEach((x) => { v[`precio_${x.id_tipo_cobro}`] = x.precio; });
        return v;
      }}
      prepararGuardar={(v, editando, extra) => ({
        nombre: v.nombre, descripcion: v.descripcion || null, precio_mensual: v.precio_mensual || 0,
        limite_usuarios: v.limite_usuarios || null, activo: !!v.activo, modulos: v.modulos || [],
        precios: (extra?.tipos || [])
          .filter((t) => v[`precio_${t.id_tipo_cobro}`] !== null && v[`precio_${t.id_tipo_cobro}`] !== undefined && v[`precio_${t.id_tipo_cobro}`] !== "")
          .map((t) => ({ id_tipo_cobro: t.id_tipo_cobro, precio: Number(v[`precio_${t.id_tipo_cobro}`]) })),
      })}
      grupos={{ plan: "Paquete", precios: "Precios por tipo de cobro", modulos: "Qué incluye" }}
      campos={(v, extra) => [
        { name: "nombre", label: "Nombre del paquete", required: true, grupo: "plan", placeholder: "Ej. Arranque, Taller Pro" },
        { name: "descripcion", label: "Descripción", type: "textarea", grupo: "plan" },
        { name: "limite_usuarios", label: "Límite de usuarios", type: "number", hint: "Vacío = sin límite", grupo: "plan" },
        { name: "activo", label: "Se ofrece a talleres nuevos", type: "checkbox", grupo: "plan" },
        { name: "precio_mensual", label: "Precio mensual (sin IVA)", type: "number", required: true, grupo: "precios" },
        ...(extra?.tipos || []).filter((t) => t.activo || v[`precio_${t.id_tipo_cobro}`] != null).map((t) => ({
          name: `precio_${t.id_tipo_cobro}`,
          label: `Precio ${t.nombre.toLowerCase()} (${t.meses} mes${t.meses > 1 ? "es" : ""})`,
          type: "number",
          grupo: "precios",
          mitad: true,
          hint: `Vacío = ${fmt(calculado(v.precio_mensual, t))}${t.descuento_porcentaje ? ` (−${t.descuento_porcentaje}%)` : ""}`,
        })),
        { name: "modulos", label: "Módulos incluidos", type: "multiselect", grupo: "modulos",
          options: (extra?.modulos || []).map((m) => ({ value: m.clave, label: `${m.icono || ""} ${m.nombre}`.trim() })) },
      ]}
      encabezado={<Text style={{ fontSize: 12.5, color: colors.ink700, marginBottom: 12 }}>Crea los planes que vendes, su precio por cada forma de cobro y qué módulos incluye. Lo que no incluya el plan no le aparece al taller.</Text>}
    />
  );
}

export function ModulosScreen() {
  return (
    <ListaEditable
      endpoint="/superadmin/modulos"
      idCampo="id_modulo"
      etiqueta="módulo"
      icono="apps-outline"
      permitirCrear={false}
      permitirEliminar={false}
      cargarExtra={() => api.get("/superadmin/paquetes")}
      titulo={(m) => `${m.icono || ""} ${m.nombre}`.trim()}
      subtitulo={(m, paquetes) => {
        const en = (paquetes || []).filter((p) => p.modulos.some((x) => x.clave === m.clave)).map((p) => p.nombre);
        return `${m.descripcion || ""}\n${en.length ? `En: ${en.join(", ")}` : "No está en ningún paquete"}`;
      }}
      prepararGuardar={(v) => ({ nombre: v.nombre, descripcion: v.descripcion || null, icono: v.icono || null, orden: v.orden || 0 })}
      campos={[
        { name: "clave", label: "Clave del sistema", disabled: true },
        { name: "nombre", label: "Nombre que ven los talleres", required: true },
        { name: "descripcion", label: "Descripción", type: "textarea" },
        { name: "icono", label: "Ícono (emoji)", mitad: true },
        { name: "orden", label: "Orden", type: "number", mitad: true },
      ]}
      encabezado={<Text style={{ fontSize: 12.5, color: colors.ink700, marginBottom: 12 }}>Los módulos los define el sistema (no se agregan ni se eliminan). Aquí solo cambias cómo se muestran; para decidir qué incluye cada plan ve a Paquetes.</Text>}
    />
  );
}

export function TiposCobroScreen() {
  return (
    <ListaEditable
      endpoint="/superadmin/tipos-cobro"
      idCampo="id_tipo_cobro"
      etiqueta="tipo de cobro"
      icono="repeat-outline"
      titulo={(t) => t.nombre}
      subtitulo={(t) => `Cada pago cubre ${t.meses} mes${t.meses > 1 ? "es" : ""}${t.descuento_porcentaje ? ` · ${t.descuento_porcentaje}% de descuento` : ""}`}
      badge={(t) => (!t.activo ? { texto: "inactivo", tono: "gris" } : null)}
      valoresNuevos={{ meses: 1, descuento_porcentaje: 0, activo: true, orden: 0 }}
      prepararGuardar={(v) => ({ nombre: v.nombre, meses: v.meses || 1, descuento_porcentaje: v.descuento_porcentaje || 0, activo: !!v.activo, orden: v.orden || 0 })}
      campos={[
        { name: "nombre", label: "Nombre", required: true, placeholder: "Ej. Mensual, Anual" },
        { name: "meses", label: "Meses que cubre cada pago", type: "number", required: true, mitad: true },
        { name: "descuento_porcentaje", label: "Descuento %", type: "number", mitad: true },
        { name: "orden", label: "Orden en la lista", type: "number" },
        { name: "activo", label: "Disponible", type: "checkbox" },
      ]}
    />
  );
}
