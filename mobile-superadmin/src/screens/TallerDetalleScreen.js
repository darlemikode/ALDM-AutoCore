import { useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Share } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import HojaFormulario from "../ui/HojaFormulario";
import QrVista from "../ui/QrVista";
import { alerta } from "../ui/Dialogo";
import { Badge, Boton, EstadoBadge, Fila, Seccion, Tarjeta, confirmar, fmt, fmtFecha, useCargar } from "../ui/comunes";

export const METODOS_PAGO = [
  { value: "transferencia", label: "Transferencia" }, { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" }, { value: "deposito", label: "Depósito" }, { value: "otro", label: "Otro" },
];
const ESTADOS_MANUALES = [
  { value: "prueba", label: "En prueba" }, { value: "activa", label: "Activa" },
  { value: "suspendida", label: "Suspendida" }, { value: "cancelada", label: "Cancelada" },
];

export default function TallerDetalleScreen({ route, navigation }) {
  const { id } = route.params;
  const [hoja, setHoja] = useState(null); // "pago" | "suscripcion"
  const [verQr, setVerQr] = useState(false);
  const { datos, recargar, refrescando } = useCargar(async () => {
    const [taller, pagos, usuarios, paquetes, tipos] = await Promise.all([
      api.get(`/superadmin/talleres/${id}`),
      api.get(`/superadmin/pagos?id_taller=${id}`),
      api.get(`/superadmin/talleres/${id}/usuarios`),
      api.get("/superadmin/paquetes"),
      api.get("/superadmin/tipos-cobro"),
    ]);
    navigation.setOptions({ title: taller.nombre_comercial });
    return { taller, pagos, usuarios, paquetes, tipos };
  }, [id]);

  if (!datos) return <View style={styles.screen} />;
  const { taller: t, pagos, usuarios, paquetes, tipos } = datos;
  const s = t.suscripcion;
  const e = t.estado || {};
  const opcionesTipos = tipos.filter((x) => x.activo || x.id_tipo_cobro === s?.id_tipo_cobro).map((x) => ({ value: x.id_tipo_cobro, label: `${x.nombre} (${x.meses} mes${x.meses > 1 ? "es" : ""}${x.descuento_porcentaje ? `, -${x.descuento_porcentaje}%` : ""})` }));
  const opcionesPaquetes = paquetes.filter((p) => p.activo || p.id_paquete === s?.id_paquete).map((p) => ({ value: p.id_paquete, label: `${p.nombre} · ${fmt(p.precio_mensual)}/mes` }));

  function precioCalculado(idTipo) {
    if (s?.precio_pactado != null) return s.precio_pactado;
    const tipo = tipos.find((x) => x.id_tipo_cobro === Number(idTipo));
    const meses = tipo?.meses || 1;
    return (s?.paquete?.precio_mensual || 0) * meses * (1 - (tipo?.descuento_porcentaje || 0) / 100);
  }

  async function registrarPago(v) {
    const pago = await api.post(`/superadmin/talleres/${id}/renovar`, {
      id_tipo_cobro: v.id_tipo_cobro ? Number(v.id_tipo_cobro) : null,
      monto: v.monto === null || v.monto === undefined || v.monto === "" ? null : v.monto,
      metodo_pago: v.metodo_pago || "transferencia", referencia: v.referencia || null, notas: v.notas || null,
    });
    setHoja(null);
    await recargar();
    alerta("Pago registrado", `${fmt(pago.monto)} — cubre del ${fmtFecha(pago.periodo_desde)} al ${fmtFecha(pago.periodo_hasta)}.`);
  }

  async function guardarSuscripcion(v) {
    const cuerpo = {
      id_paquete: v.id_paquete ? Number(v.id_paquete) : undefined,
      id_tipo_cobro: v.id_tipo_cobro ? Number(v.id_tipo_cobro) : undefined,
      estado: v.estado || undefined,
      fecha_vencimiento: v.fecha_vencimiento || null,
      notas: v.notas || null,
    };
    if (v.precio_pactado === null || v.precio_pactado === undefined || v.precio_pactado === "") cuerpo.quitar_precio_pactado = true;
    else cuerpo.precio_pactado = v.precio_pactado;
    await api.put(`/superadmin/talleres/${id}/suscripcion`, cuerpo);
    setHoja(null);
    recargar();
  }

  const suspender = () => confirmar("Suspender taller", `${t.nombre_comercial} dejará de poder entrar al sistema. Sus datos se conservan.`, "Suspender", async () => {
    try { await api.post(`/superadmin/talleres/${id}/suspender`, { motivo: null }); recargar(); } catch (err) { alerta("No se pudo suspender", err.message); }
  });
  const reactivar = async () => {
    try { await api.post(`/superadmin/talleres/${id}/reactivar`); recargar(); } catch (err) { alerta("No se pudo reactivar", err.message); }
  };
  const eliminarPago = (p) => confirmar("Eliminar pago", `¿Eliminar el pago de ${fmt(p.monto)} del ${fmtFecha(p.fecha_pago)}? La fecha de vencimiento NO se regresa sola; ajústala en la suscripción si hace falta.`, "Eliminar", async () => {
    try { await api.del(`/superadmin/pagos/${p.id_pago}`); recargar(); } catch (err) { alerta("No se pudo eliminar", err.message); }
  });

  const bloqueado = e.bloqueado;

  const compartirActivacion = () => Share.share({
    message: `Bienvenido a ALDM AutoCore 👋\n\nPara entrar por primera vez a tu sistema abre la página o la app del taller, toca "¿Primera vez? Activa tu taller" y escribe:\n\nCódigo del taller: ${t.codigo}\nCódigo de activación: ${t.codigo_activacion}\n\nAhí creas tu usuario y contraseña de administrador.`,
  }).catch(() => {});
  const nuevoCodigo = () => confirmar("Nuevo código de activación", "El código anterior dejará de servir.", "Generar", async () => {
    try { await api.post(`/superadmin/talleres/${id}/codigo-activacion`); recargar(); } catch (err) { alerta("No se pudo generar", err.message); }
  }, false);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => recargar(true)} />}>
      <Tarjeta>
        <View style={styles.cabecera}>
          <View style={{ flex: 1 }}>
            <Text style={styles.nombre}>{t.nombre_comercial}</Text>
            <Text style={styles.sub}>{[t.razon_social, t.tipo_negocio].filter(Boolean).join(" · ")}</Text>
          </View>
          <EstadoBadge estado={e.estado} />
        </View>
        {e.mensaje ? <Text style={[styles.mensaje, { color: bloqueado ? colors.red600 : colors.warn600 }]}>{e.mensaje}</Text> : null}
        <TouchableOpacity style={styles.codigo} onPress={() => setVerQr((x) => !x)}>
          <Ionicons name="qr-code-outline" size={18} color={colors.petrol600} />
          <Text style={styles.codigoTexto}>{t.codigo}</Text>
          <Text style={styles.link}>{verQr ? "Ocultar QR" : "Ver QR"}</Text>
        </TouchableOpacity>
        {verQr && t.qr ? (
          <View style={{ alignItems: "center", marginTop: 10, gap: 6 }}>
            <QrVista contenido={t.qr} tamano={220} />
            <Text style={styles.qrNota}>Los clientes del taller lo escanean para entrar a la app "Mi Taller".</Text>
          </View>
        ) : null}
      </Tarjeta>

      {t.pendiente_activacion ? (
        <Tarjeta style={styles.activacion}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="key-outline" size={20} color={colors.warn600} />
            <Text style={styles.activacionTitulo}>Pendiente de activar</Text>
          </View>
          <Text style={styles.sub}>Todavía nadie registró el administrador. El dueño lo crea la primera vez que entra, con el código del taller y este código de activación:</Text>
          {t.codigo_activacion ? <Text style={styles.activacionCodigo} selectable>{t.codigo_activacion}</Text> : <Text style={styles.sub}>Sin código vigente: genera uno.</Text>}
          <View style={styles.acciones}>
            {t.codigo_activacion ? <Boton texto="Compartir" icono="share-social-outline" onPress={compartirActivacion} style={{ flex: 1 }} /> : null}
            <Boton texto="Nuevo código" icono="refresh-outline" tipo="secundario" onPress={nuevoCodigo} style={{ flex: 1 }} />
          </View>
        </Tarjeta>
      ) : null}

      <View style={styles.acciones}>
        <Boton texto="Registrar pago" icono="cash-outline" onPress={() => setHoja("pago")} style={{ flex: 1 }} />
        <Boton texto="Suscripción" icono="options-outline" tipo="secundario" onPress={() => setHoja("suscripcion")} style={{ flex: 1 }} />
      </View>

      <Seccion titulo="Suscripción" />
      <Tarjeta>
        <Fila etiqueta="Paquete" valor={s?.paquete?.nombre} />
        <Fila etiqueta="Tipo de cobro" valor={s?.tipo_cobro?.nombre || "Sin definir"} />
        <Fila etiqueta="Precio por periodo" valor={t.precio_periodo != null ? fmt(t.precio_periodo) : "—"} />
        {s?.precio_pactado != null ? <Fila etiqueta="Precio pactado" valor="Sí (precio especial)" tono="blue" /> : null}
        <Fila etiqueta="Inicio" valor={fmtFecha(s?.fecha_inicio)} />
        <Fila etiqueta="Vence" valor={s?.fecha_vencimiento ? fmtFecha(s.fecha_vencimiento) : "Sin vencimiento"} tono={e.dias_restantes != null && e.dias_restantes < 0 ? "red" : null} />
        {e.fin_gracia ? <Fila etiqueta="Fin de gracia (solo consulta)" valor={fmtFecha(e.fin_gracia)} /> : null}
        {e.fecha_depuracion ? <Fila etiqueta="Conservar datos hasta" valor={fmtFecha(e.fecha_depuracion)} tono={e.para_depurar ? "red" : null} /> : null}
        <Text style={styles.modulos}>Módulos: {(s?.paquete?.modulos || []).map((m) => m.nombre).join(", ") || "—"}</Text>
        {s?.notas ? <Text style={styles.notas}>{s.notas}</Text> : null}
      </Tarjeta>

      <Seccion titulo="Uso" />
      <Tarjeta>
        <View style={styles.usoGrid}>
          {[["Usuarios", t.uso?.usuarios_activos], ["Clientes", t.uso?.clientes], ["Vehículos", t.uso?.vehiculos], ["Órdenes mes", t.uso?.ordenes_mes], ["Órdenes total", t.uso?.ordenes_total]].map(([k, v]) => (
            <View key={k} style={styles.usoItem}><Text style={styles.usoValor}>{v || 0}</Text><Text style={styles.usoEtiqueta}>{k}</Text></View>
          ))}
        </View>
        <Text style={styles.sub}>Última orden: {t.uso?.ultima_actividad ? fmtFecha(t.uso.ultima_actividad) : "sin actividad"}</Text>
      </Tarjeta>

      <Seccion titulo={`Pagos (${pagos.length})`} />
      <Tarjeta style={{ paddingVertical: 4 }}>
        {pagos.length === 0 ? <Text style={[styles.sub, { paddingVertical: 12 }]}>Todavía no hay pagos registrados.</Text> : pagos.map((p, i) => (
          <TouchableOpacity key={p.id_pago} style={[styles.pago, i > 0 && styles.divisor]} onLongPress={() => eliminarPago(p)} delayLongPress={500}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pagoMonto}>{fmt(p.monto)}</Text>
              <Text style={styles.sub}>{fmtFecha(p.fecha_pago)} · {p.metodo_pago || "—"}{p.referencia ? ` · ${p.referencia}` : ""}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              {p.tipo_cobro ? <Badge texto={p.tipo_cobro.nombre} tono="petrol" /> : null}
              {p.periodo_desde ? <Text style={styles.periodo}>{fmtFecha(p.periodo_desde)} – {fmtFecha(p.periodo_hasta)}</Text> : null}
            </View>
          </TouchableOpacity>
        ))}
      </Tarjeta>
      {pagos.length > 0 ? <Text style={styles.ayuda}>Mantén presionado un pago para eliminarlo si se capturó por error.</Text> : null}

      <Seccion titulo={`Usuarios (${usuarios.length})`} />
      <Tarjeta style={{ paddingVertical: 4 }}>
        {usuarios.map((u, i) => {
          const m = u.membresias.find((x) => x.id_taller === t.id_taller);
          return (
            <TouchableOpacity key={u.id_usuario} style={[styles.pago, i > 0 && styles.divisor]} onPress={() => navigation.navigate("UsuarioDetalle", { id: u.id_usuario })}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pagoMonto}>{u.nombre_completo}</Text>
                <Text style={styles.sub}>@{u.username} · {m?.rol?.nombre}{u.membresias.length > 1 ? ` · ${u.membresias.length} talleres` : ""}</Text>
              </View>
              {m && !m.activo ? <Badge texto="sin acceso" tono="gris" /> : <Ionicons name="chevron-forward" size={18} color={colors.ink500} />}
            </TouchableOpacity>
          );
        })}
      </Tarjeta>

      <Seccion titulo="Datos de contacto" accion="Editar" onAccion={() => navigation.navigate("TallerForm", { taller: t })} />
      <Tarjeta>
        <Fila etiqueta="Contacto" valor={t.contacto_nombre} />
        <Fila etiqueta="Teléfono" valor={t.telefono} />
        <Fila etiqueta="Correo" valor={t.correo} />
        <Fila etiqueta="Ciudad" valor={[t.ciudad, t.estado_mx].filter(Boolean).join(", ") || null} />
        <Fila etiqueta="Alta" valor={fmtFecha(t.fecha_alta)} />
        {t.notas ? <Text style={styles.notas}>{t.notas}</Text> : null}
      </Tarjeta>

      {bloqueado && (e.estado === "suspendida" || e.estado === "cancelada")
        ? <Boton texto="Reactivar taller" icono="play-circle-outline" onPress={reactivar} style={{ marginTop: 6 }} />
        : <Boton texto="Suspender taller" icono="pause-circle-outline" tipo="peligro" onPress={suspender} style={{ marginTop: 6 }} />}

      <HojaFormulario
        visible={hoja === "pago"}
        titulo="Registrar pago"
        subtitulo="Renueva la suscripción: el nuevo periodo empieza al terminar el actual (o hoy, si ya venció)."
        icono="cash-outline"
        valoresIniciales={{ id_tipo_cobro: s?.id_tipo_cobro || opcionesTipos[0]?.value, metodo_pago: "transferencia" }}
        campos={(v) => [
          { name: "id_tipo_cobro", label: "Tipo de cobro", type: "select", required: true, options: opcionesTipos },
          { name: "monto", label: "Monto cobrado", type: "number", placeholder: String(precioCalculado(v.id_tipo_cobro).toFixed(2)), hint: `Vacío = ${fmt(precioCalculado(v.id_tipo_cobro))} (precio calculado)` },
          { name: "metodo_pago", label: "Forma de pago", type: "select", options: METODOS_PAGO },
          { name: "referencia", label: "Referencia", placeholder: "Folio, núm. de operación…" },
          { name: "notas", label: "Notas", type: "textarea" },
        ]}
        textoGuardar="Registrar pago"
        onGuardar={registrarPago}
        onCerrar={() => setHoja(null)}
      />
      <HojaFormulario
        visible={hoja === "suscripcion"}
        titulo="Suscripción"
        subtitulo="Paquete, forma de cobro, precio especial y fechas."
        icono="options-outline"
        valoresIniciales={{
          id_paquete: s?.id_paquete, id_tipo_cobro: s?.id_tipo_cobro, estado: s?.estado,
          precio_pactado: s?.precio_pactado ?? "", fecha_vencimiento: s?.fecha_vencimiento || "", notas: s?.notas || "",
        }}
        campos={[
          { name: "id_paquete", label: "Paquete", type: "select", required: true, options: opcionesPaquetes },
          { name: "id_tipo_cobro", label: "Tipo de cobro", type: "select", options: opcionesTipos },
          { name: "precio_pactado", label: "Precio especial por periodo", type: "number", hint: "Vacío = precio de lista del paquete" },
          { name: "fecha_vencimiento", label: "Vence el", type: "date", hint: "Para dar días extra de prueba o corregir fechas" },
          { name: "estado", label: "Estado", type: "select", options: ESTADOS_MANUALES },
          { name: "notas", label: "Notas", type: "textarea" },
        ]}
        onGuardar={guardarSuscripcion}
        onCerrar={() => setHoja(null)}
      />
    </ScrollView>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  cabecera: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  nombre: { fontFamily: "BarlowCondensed_700Bold", fontSize: 26, color: colors.ink900 },
  sub: { fontSize: 12.5, color: colors.ink700, marginTop: 2 },
  mensaje: { fontSize: 13, fontWeight: "600", marginTop: 10 },
  codigo: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, backgroundColor: colors.paper0, borderRadius: 10, padding: 10 },
  codigoTexto: { flex: 1, fontSize: 16, fontWeight: "800", letterSpacing: 1.5, color: colors.ink900 },
  link: { fontSize: 13, fontWeight: "700", color: colors.petrol600 },
  qrNota: { fontSize: 12, color: colors.ink700, textAlign: "center" },
  acciones: { flexDirection: "row", gap: 10, marginBottom: 4 },
  activacion: { borderColor: colors.warn600, gap: 8 },
  activacionTitulo: { fontSize: 15, fontWeight: "800", color: colors.warn600 },
  activacionCodigo: { fontSize: 28, fontWeight: "800", letterSpacing: 4, color: colors.ink900, textAlign: "center", paddingVertical: 6 },
  modulos: { fontSize: 12.5, color: colors.ink700, marginTop: 10 },
  notas: { fontSize: 12.5, color: colors.ink700, marginTop: 10, fontStyle: "italic" },
  usoGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 6 },
  usoItem: { width: "33%", paddingVertical: 6 },
  usoValor: { fontFamily: "BarlowCondensed_700Bold", fontSize: 22, color: colors.ink900 },
  usoEtiqueta: { fontSize: 11.5, color: colors.ink700 },
  pago: { flexDirection: "row", alignItems: "center", paddingVertical: 11, gap: 10 },
  divisor: { borderTopWidth: 1, borderTopColor: colors.ink300 },
  pagoMonto: { fontSize: 14.5, fontWeight: "700", color: colors.ink900 },
  periodo: { fontSize: 11, color: colors.ink700, marginTop: 4 },
  ayuda: { fontSize: 11.5, color: colors.ink500, marginTop: -4, marginBottom: 8, textAlign: "center" },
});
