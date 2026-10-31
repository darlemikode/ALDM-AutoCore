import { useEffect, useMemo, useState } from "react";
import { View, Text, Image, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { colors } from "../theme";
import { crearEstilos } from "../ui/estilos";
import Auto3D from "./Auto3D";
import VisorFoto from "./VisorFoto";
import { PIEZAS3D } from "../lib/autoGeometria";
import { ZONAS } from "../lib/zonas";
import { urlFoto } from "../lib/fotos";

/**
 * Lo que ve el cliente del auto de su orden (solo lectura):
 *  · Avance: el auto 3D se ilumina de adelante hacia atrás según la etapa y resalta las zonas que el taller va atendiendo.
 *  · Recepción: los detalles con los que llegó el vehículo, marcados en el auto, con fotos.
 */
export default function AvanceYRecepcion({ servicioId, etapa }) {
  const [datos, setDatos] = useState(null);
  const [sel, setSel] = useState(null);
  const [visor, setVisor] = useState(null);

  useEffect(() => {
    let vivo = true;
    api.get(`/portal-cliente/mis-servicios/${servicioId}/visual`).then((d) => { if (vivo) setDatos(d); }).catch(() => { if (vivo) setDatos({ recepcion: null }); });
    return () => { vivo = false; };
  }, [servicioId, etapa]);

  const danos = datos?.recepcion?.danos || [];
  const avance = datos?.recepcion?.avance || null;
  const porPieza = useMemo(() => {
    const m = {};
    danos.forEach((d) => { (m[d.pieza] = m[d.pieza] || []).push(d); });
    return m;
  }, [danos]);
  const puntos = useMemo(() => Object.fromEntries(Object.entries(PIEZAS3D).filter(([k]) => porPieza[k])), [porPieza]);
  const estadoPieza = (k) => (porPieza[k] ? (porPieza[k].some((d) => d.gravedad === "severo") ? "mal" : "regular") : "ninguno");

  if (!datos) return <ActivityIndicator color={colors.petrol500} style={{ marginVertical: 16 }} />;
  if (!avance && danos.length === 0) return null;

  const pct = Math.round((avance?.progreso || 0) * 100);
  const zonas = avance?.zonas || {};
  const enProceso = Object.keys(zonas).filter((k) => zonas[k] === "proceso" && ZONAS[k]);
  const listas = Object.keys(zonas).filter((k) => zonas[k] === "listo" && ZONAS[k]);
  const lista = sel && porPieza[sel] ? porPieza[sel] : danos;

  return (
    <>
      {avance && (
        <View style={s.tarjeta}>
          <Text style={s.titulo}>Avance de tu vehículo</Text>
          <Auto3D sinPuntos altura={230} fps={16} avance={avance} ayuda="Arrastra para girar" />
          <View style={s.barra}><View style={[s.barraRelleno, { width: `${pct}%` }]} /></View>
          <Text style={s.pct}><Text style={s.pctNum}>{pct}%</Text> del servicio</Text>
          {(enProceso.length > 0 || listas.length > 0) && (
            <View style={s.chips}>
              {enProceso.map((k) => <View key={`p${k}`} style={s.chip}><View style={[s.punto, { backgroundColor: "#ffb932" }]} /><Text style={s.chipTexto}>{ZONAS[k]} · En proceso</Text></View>)}
              {listas.map((k) => <View key={`l${k}`} style={s.chip}><View style={[s.punto, { backgroundColor: "#3ceb87" }]} /><Text style={s.chipTexto}>{ZONAS[k]} · Listo</Text></View>)}
            </View>
          )}
        </View>
      )}

      {danos.length > 0 && (
        <View style={s.tarjeta}>
          <Text style={s.titulo}>Recepción del vehículo</Text>
          <Text style={s.intro}>Así recibimos tu vehículo. Estos son los detalles que se registraron al llegar.</Text>
          <Auto3D puntos={puntos} compacto altura={230} fps={16} estadoZona={estadoPieza} elegida={sel && porPieza[sel] ? sel : null}
            onSelect={(k) => setSel(sel === k ? null : k)} ayuda="Arrastra para girar · toca una marca para ver el detalle" />
          {lista.map((d, i) => (
            <View key={i} style={s.dano}>
              <Text style={[s.gravedad, d.gravedad === "severo" ? { color: colors.red600, borderColor: colors.red600 } : { color: colors.warn600, borderColor: colors.warn600 }]}>{d.gravedad}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.danoTitulo}>{d.pieza_nombre}</Text>
                <Text style={s.danoSub}>{d.tipo_nombre}{d.comentario ? ` — ${d.comentario}` : ""}</Text>
                {d.fotos?.length > 0 && (
                  <View style={s.fotos}>
                    {d.fotos.map((f, k) => (
                      <TouchableOpacity key={k} onPress={() => setVisor({ fotos: d.fotos, indice: k })}><Image source={{ uri: urlFoto(f) }} style={s.foto} /></TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>
          ))}
          {sel && <TouchableOpacity style={s.verTodos} onPress={() => setSel(null)}><Text style={s.verTodosTexto}>Ver todos los detalles</Text></TouchableOpacity>}
        </View>
      )}
      {visor && <VisorFoto fotos={visor.fotos} indice={visor.indice} onClose={() => setVisor(null)} />}
    </>
  );
}

const s = crearEstilos({
  tarjeta: { backgroundColor: colors.paper100, borderRadius: 14, padding: 16, marginBottom: 12 },
  titulo: { fontSize: 12.5, fontWeight: "700", color: colors.ink700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 },
  intro: { fontSize: 13, color: colors.ink500, marginBottom: 10 },
  barra: { height: 8, borderRadius: 99, backgroundColor: colors.ink300, overflow: "hidden", marginTop: 12 },
  barraRelleno: { height: "100%", borderRadius: 99, backgroundColor: "#2fc9a8" },
  pct: { textAlign: "center", fontSize: 13, color: colors.ink500, marginTop: 8 },
  pctNum: { fontSize: 16, fontWeight: "800", color: colors.ink900 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderColor: colors.ink300, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6 },
  punto: { width: 9, height: 9, borderRadius: 5 },
  chipTexto: { fontSize: 12.5, fontWeight: "600", color: colors.ink900 },
  dano: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 12 },
  gravedad: { fontSize: 11, fontWeight: "800", borderWidth: 1.5, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 1, textTransform: "capitalize" },
  danoTitulo: { fontSize: 14, fontWeight: "700", color: colors.ink900 },
  danoSub: { fontSize: 13, color: colors.ink500 },
  fotos: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  foto: { width: 72, height: 72, borderRadius: 8, backgroundColor: colors.paper0 },
  verTodos: { alignSelf: "flex-start", marginTop: 12, borderWidth: 1, borderColor: colors.ink300, borderRadius: 99, paddingHorizontal: 16, paddingVertical: 8 },
  verTodosTexto: { fontSize: 13, fontWeight: "600", color: colors.ink700 },
});
