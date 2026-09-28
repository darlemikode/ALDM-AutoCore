import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { colors } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { alerta } from "../ui/Dialogo";

const ESTADO = {
  pendiente: ["Pendiente de confirmar", "time-outline", "warn"],
  confirmada: ["Confirmada por el taller", "checkmark-circle", "teal"],
  rechazada: ["No se pudo agendar", "close-circle", "red"],
};
const HORAS = ["09:00", "10:00", "11:00", "12:00", "13:00", "15:00", "16:00", "17:00"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function proximosDias(n = 10) {
  const out = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (out.length < n) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) out.push(new Date(d)); // domingo cerrado
  }
  return out;
}
const claveDia = (d) => d.toISOString().slice(0, 10);

export default function AgendarScreen({ route, navigation }) {
  const [vehiculos, setVehiculos] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [misCitas, setMisCitas] = useState([]);
  const [vehiculoId, setVehiculoId] = useState(null);
  const [tipoId, setTipoId] = useState(null);
  const [dia, setDia] = useState(null);
  const [horaSel, setHoraSel] = useState(null);
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  const scrollRef = useRef(null);
  const dias = proximosDias();

  async function cargar() {
    const [v, t, c] = await Promise.all([
      api.get("/portal-cliente/mis-vehiculos"),
      api.get("/portal-cliente/tipos-servicio"),
      api.get("/portal-cliente/mis-citas"),
    ]);
    setVehiculos(v || []);
    setTipos(t || []);
    setMisCitas(c || []);
    if ((v || []).length === 1) setVehiculoId((prev) => prev ?? v[0].id_vehiculo);
  }
  useFocusEffect(useCallback(() => { cargar().catch(() => {}); }, []));

  // Llegada desde "Mis vehículos" → preselecciona el vehículo
  useEffect(() => {
    if (route.params?.vehiculoId) {
      setVehiculoId(route.params.vehiculoId);
      navigation.setParams({ vehiculoId: undefined });
    }
  }, [route.params?.vehiculoId, navigation]);

  async function enviarSolicitud() {
    if (!descripcion.trim()) {
      setError("Cuéntanos brevemente qué necesita tu vehículo.");
      return;
    }
    setError("");
    let fecha_propuesta = null;
    if (dia) {
      const [h, m] = (horaSel || "09:00").split(":").map(Number);
      const f = new Date(dia);
      f.setHours(h, m, 0, 0);
      fecha_propuesta = f.toISOString();
    }
    setEnviando(true);
    try {
      await api.post("/portal-cliente/mis-citas", {
        id_vehiculo: vehiculoId || null,
        id_tipo_servicio: tipoId || null,
        descripcion: descripcion.trim(),
        fecha_propuesta,
      });
      setDescripcion("");
      setTipoId(null);
      setDia(null);
      setHoraSel(null);
      alerta("¡Solicitud enviada!", "El taller la revisará y te confirmará la cita.");
      await cargar();
      scrollRef.current?.scrollToEnd({ animated: true });
    } catch (err) {
      alerta("Error", err.message);
    } finally {
      setEnviando(false);
    }
  }

  const nombreVehiculo = (v) => [v.marca?.nombre_marca, v.modelo?.nombre_modelo].filter(Boolean).join(" ") || v.placas_vehiculo || v.numero_cuenta;
  const tono = { warn: [colors.warn100, colors.warn600], teal: [colors.teal100, colors.teal600], red: [colors.red100, colors.red600] };

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={async () => { setRefrescando(true); await cargar().catch(() => {}); setRefrescando(false); }} tintColor={colors.petrol500} colors={[colors.petrol500]} />}
    >
      <Text style={styles.intro}>Elige tu vehículo, el servicio y cuándo te gustaría venir. El taller confirma tu cita.</Text>

      <Paso n={1} titulo="Vehículo" opcional>
        <View style={styles.chips}>
          {vehiculos.map((v) => (
            <Chip key={v.id_vehiculo} activo={vehiculoId === v.id_vehiculo} onPress={() => setVehiculoId(vehiculoId === v.id_vehiculo ? null : v.id_vehiculo)} icono="car-sport-outline" texto={nombreVehiculo(v)} sub={v.placas_vehiculo} />
          ))}
          {!vehiculos.length ? <Text style={styles.meta}>Sin vehículos registrados — puedes solicitar de todos modos.</Text> : null}
        </View>
      </Paso>

      <Paso n={2} titulo="Tipo de servicio" opcional>
        <View style={styles.chips}>
          {tipos.map((t) => (
            <Chip key={t.id_tipo_servicio} activo={tipoId === t.id_tipo_servicio} onPress={() => setTipoId(tipoId === t.id_tipo_servicio ? null : t.id_tipo_servicio)} texto={t.nombre_tipo} />
          ))}
        </View>
      </Paso>

      <Paso n={3} titulo="¿Cuándo?" opcional>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {dias.map((d) => {
            const activo = dia && claveDia(dia) === claveDia(d);
            return (
              <TouchableOpacity key={claveDia(d)} style={[styles.dia, activo && styles.diaActivo]} onPress={() => setDia(activo ? null : d)}>
                <Text style={[styles.diaSemana, activo && styles.textoActivo]}>{DIAS[d.getDay()]}</Text>
                <Text style={[styles.diaNumero, activo && styles.textoActivo]}>{d.getDate()}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {dia ? (
          <View style={[styles.chips, { marginTop: 10 }]}>
            {HORAS.map((h) => <Chip key={h} activo={horaSel === h} onPress={() => setHoraSel(horaSel === h ? null : h)} texto={h} />)}
          </View>
        ) : null}
      </Paso>

      <Paso n={4} titulo="Cuéntanos qué necesita">
        <TextInput
          style={[styles.input, error && { borderColor: colors.red600 }]}
          value={descripcion}
          onChangeText={(t) => { setDescripcion(t); if (error) setError(""); }}
          multiline
          placeholder="Ej. Ruido al frenar, cambio de aceite…"
          placeholderTextColor={colors.ink500}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Paso>

      <TouchableOpacity style={[styles.boton, enviando && { opacity: 0.6 }]} onPress={enviarSolicitud} disabled={enviando}>
        <Ionicons name="calendar" size={18} color="#fff" />
        <Text style={styles.botonTexto}>{enviando ? "Enviando…" : "Solicitar cita"}</Text>
      </TouchableOpacity>

      {misCitas.length > 0 ? (
        <>
          <Text style={styles.seccion}>Tus solicitudes</Text>
          {misCitas.map((c) => {
            const [etiqueta, icono, t] = ESTADO[c.estado] || [c.estado, "ellipse-outline", "warn"];
            const [fondo, frente] = tono[t];
            const tipo = tipos.find((x) => x.id_tipo_servicio === c.id_tipo_servicio);
            return (
              <View key={c.id_cita} style={styles.cita}>
                <View style={[styles.citaIcono, { backgroundColor: fondo }]}><Ionicons name={icono} size={18} color={frente} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.citaTitulo} numberOfLines={2}>{tipo?.nombre_tipo || c.descripcion || "Solicitud"}</Text>
                  {tipo && c.descripcion ? <Text style={styles.meta} numberOfLines={2}>{c.descripcion}</Text> : null}
                  <Text style={styles.meta}>
                    {c.fecha_propuesta ? new Date(c.fecha_propuesta).toLocaleString("es-MX", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : `Solicitada ${new Date(c.fecha_creacion).toLocaleDateString("es-MX")}`}
                    {c.vehiculo?.placas_vehiculo ? ` · ${c.vehiculo.placas_vehiculo}` : ""}
                  </Text>
                  <Text style={[styles.citaEstado, { color: frente }]}>{etiqueta}{c.confirmada_por ? ` · ${c.confirmada_por}` : ""}</Text>
                </View>
              </View>
            );
          })}
        </>
      ) : null}
    </ScrollView>
  );
}

function Paso({ n, titulo, opcional, children }) {
  return (
    <View style={styles.paso}>
      <View style={styles.pasoCabecera}>
        <View style={styles.pasoNumero}><Text style={styles.pasoNumeroTexto}>{n}</Text></View>
        <Text style={styles.pasoTitulo}>{titulo}</Text>
        {opcional ? <Text style={styles.opcional}>opcional</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Chip({ activo, onPress, texto, sub, icono }) {
  return (
    <TouchableOpacity style={[styles.chip, activo && styles.chipActivo]} onPress={onPress}>
      {icono ? <Ionicons name={icono} size={16} color={activo ? colors.petrol600 : colors.ink500} /> : null}
      <View>
        <Text style={[styles.chipTexto, activo && styles.textoActivo]} numberOfLines={1}>{texto}</Text>
        {sub ? <Text style={styles.chipSub}>{sub}</Text> : null}
      </View>
      {activo ? <Ionicons name="checkmark" size={15} color={colors.petrol600} /> : null}
    </TouchableOpacity>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  intro: { fontSize: 14, color: colors.ink500, marginBottom: 14, lineHeight: 20 },
  paso: { backgroundColor: colors.paper100, borderRadius: 14, padding: 14, marginBottom: 12 },
  pasoCabecera: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  pasoNumero: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.petrol500, alignItems: "center", justifyContent: "center" },
  pasoNumeroTexto: { fontSize: 12.5, fontWeight: "700", color: "#fff" },
  pasoTitulo: { flex: 1, fontSize: 15.5, fontWeight: "700", color: colors.ink900 },
  opcional: { fontSize: 11.5, color: colors.ink500 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, borderWidth: 1, borderColor: colors.linea, backgroundColor: colors.paper0, paddingVertical: 8, paddingHorizontal: 12, maxWidth: "100%" },
  chipActivo: { borderColor: colors.petrol500, backgroundColor: colors.petrol100 },
  chipTexto: { fontSize: 13.5, fontWeight: "600", color: colors.ink700 },
  chipSub: { fontSize: 11, color: colors.ink500 },
  textoActivo: { color: colors.petrol600 },
  dia: { width: 54, alignItems: "center", paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.linea, backgroundColor: colors.paper0 },
  diaActivo: { borderColor: colors.petrol500, backgroundColor: colors.petrol100 },
  diaSemana: { fontSize: 11.5, fontWeight: "600", color: colors.ink500, textTransform: "uppercase" },
  diaNumero: { fontFamily: "BarlowCondensed_700Bold", fontSize: 22, color: colors.ink900 },
  input: { minHeight: 90, textAlignVertical: "top", borderRadius: 10, borderWidth: 1, borderColor: colors.linea, backgroundColor: colors.paper0, padding: 12, fontSize: 15, color: colors.ink900 },
  error: { fontSize: 12.5, color: colors.red600, marginTop: 6 },
  boton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.petrol500, borderRadius: 12, paddingVertical: 15, marginTop: 4 },
  botonTexto: { fontSize: 15, fontWeight: "700", color: "#fff" },
  seccion: { fontSize: 12.5, fontWeight: "700", color: colors.ink700, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 24, marginBottom: 10 },
  cita: { flexDirection: "row", gap: 12, backgroundColor: colors.paper100, borderRadius: 12, padding: 14, marginBottom: 8 },
  citaIcono: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  citaTitulo: { fontSize: 14.5, fontWeight: "600", color: colors.ink900 },
  citaEstado: { fontSize: 12.5, fontWeight: "700", marginTop: 4 },
  meta: { fontSize: 12.5, color: colors.ink500, marginTop: 2 },
});
