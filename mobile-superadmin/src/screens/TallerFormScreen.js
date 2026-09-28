// Alta de taller (con su paquete, prueba y su usuario administrador) o
// edición de sus datos de contacto.
import { useEffect, useState } from "react";
import { View } from "react-native";
import { api } from "../api";
import { colors } from "../theme";
import HojaFormulario from "../ui/HojaFormulario";
import { alerta } from "../ui/Dialogo";
import { fmt } from "../ui/comunes";

const TIPOS_NEGOCIO = [{ value: "taller", label: "Taller" }, { value: "refaccionaria", label: "Refaccionaria" }, { value: "ambos", label: "Ambos" }];
const DATOS = [
  { name: "nombre_comercial", label: "Nombre comercial", required: true, grupo: "taller" },
  { name: "razon_social", label: "Razón social", grupo: "taller" },
  { name: "tipo_negocio", label: "Tipo de negocio", type: "select", options: TIPOS_NEGOCIO, grupo: "taller" },
  { name: "codigo", label: "Código del taller (para su QR)", autoCapitalize: "characters", hint: "Letras y números. Vacío = se genera del nombre.", grupo: "taller" },
  { name: "contacto_nombre", label: "Persona de contacto", grupo: "contacto" },
  { name: "telefono", label: "Teléfono", type: "phone", grupo: "contacto" },
  { name: "correo", label: "Correo", type: "email", grupo: "contacto" },
  { name: "ciudad", label: "Ciudad", grupo: "contacto", mitad: true },
  { name: "estado_mx", label: "Estado", grupo: "contacto", mitad: true },
  { name: "notas", label: "Notas", type: "textarea", grupo: "contacto" },
];
const GRUPOS = { taller: "Taller", contacto: "Contacto", plan: "Plan" };

export default function TallerFormScreen({ route, navigation }) {
  const existente = route.params?.taller || null;
  const [catalogos, setCatalogos] = useState(null);

  useEffect(() => {
    if (existente) return;
    Promise.all([api.get("/superadmin/paquetes"), api.get("/superadmin/tipos-cobro"), api.get("/superadmin/configuracion")])
      .then(([paquetes, tipos, config]) => setCatalogos({ paquetes, tipos, config }))
      .catch((err) => alerta("No se pudo cargar", err.message));
  }, []);

  async function guardar(v) {
    if (existente) {
      const cuerpo = { ...v };
      if (!cuerpo.codigo) delete cuerpo.codigo;
      await api.put(`/superadmin/talleres/${existente.id_taller}`, cuerpo);
      navigation.goBack();
      return;
    }
    const cuerpo = {
      nombre_comercial: v.nombre_comercial, razon_social: v.razon_social || null, tipo_negocio: v.tipo_negocio || "taller",
      codigo: v.codigo || null, contacto_nombre: v.contacto_nombre || null, telefono: v.telefono || null, correo: v.correo || null,
      ciudad: v.ciudad || null, estado_mx: v.estado_mx || null, notas: v.notas || null,
      id_paquete: v.id_paquete ? Number(v.id_paquete) : null, id_tipo_cobro: v.id_tipo_cobro ? Number(v.id_tipo_cobro) : null,
      en_prueba: !!v.en_prueba,
    };
    const creado = await api.post("/superadmin/talleres", cuerpo);
    navigation.replace("TallerDetalle", { id: creado.id_taller });
    alerta(
      "Taller dado de alta",
      `Mándale al dueño estos dos datos. La primera vez que entre, con ellos registra su usuario y contraseña de administrador:\n\nCódigo del taller: ${creado.codigo}\nCódigo de activación: ${creado.codigo_activacion}\n\n${creado.estado?.estado === "prueba" ? `Prueba hasta el ${creado.suscripcion?.fecha_vencimiento}.` : "Suscripción activa: registra su primer pago."}`,
    );
  }

  if (!existente && !catalogos) return <View style={{ flex: 1, backgroundColor: colors.paper0 }} />;

  const campos = existente
    ? DATOS
    : [
        ...DATOS,
        { name: "id_paquete", label: "Paquete", type: "select", required: true, grupo: "plan",
          options: catalogos.paquetes.filter((p) => p.activo).map((p) => ({ value: p.id_paquete, label: `${p.nombre} · ${fmt(p.precio_mensual)}/mes` })) },
        { name: "id_tipo_cobro", label: "Tipo de cobro", type: "select", grupo: "plan",
          options: catalogos.tipos.filter((t) => t.activo).map((t) => ({ value: t.id_tipo_cobro, label: t.nombre })) },
        { name: "en_prueba", label: "Periodo de prueba", type: "checkbox", grupo: "plan", hint: `Empieza con ${catalogos.config.dias_prueba} días de prueba` },
      ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper0 }}>
      <HojaFormulario
        visible
        titulo={existente ? "Datos del taller" : "Nuevo taller"}
        subtitulo={existente ? existente.nombre_comercial : "Se crea con su código QR y sus roles base. El dueño registra su usuario administrador la primera vez que entra."}
        icono="business-outline"
        campos={campos}
        grupos={GRUPOS}
        valoresIniciales={existente ? { ...existente } : { tipo_negocio: "taller", en_prueba: true, id_paquete: catalogos.config.id_paquete_prueba || undefined }}
        textoGuardar={existente ? "Guardar" : "Dar de alta"}
        onGuardar={guardar}
        onCerrar={() => navigation.goBack()}
      />
    </View>
  );
}
