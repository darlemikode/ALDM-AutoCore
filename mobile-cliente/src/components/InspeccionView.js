import { useEffect, useState } from "react";
import { View, Text, Image, ScrollView, ActivityIndicator, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { crearEstilos } from "../ui/estilos";
import { api, urlArchivo } from "../api";
import { colors, spacing } from "../theme";
import Auto3D from "./Auto3D";
import VisorFoto from "./VisorFoto";
import { ZONAS, zonasDe, peorEstado } from "../lib/zonas";
import { urlFoto } from "../lib/fotos";

const ETIQUETA_ESTADO = { bien: "Bien", regular: "Regular", mal: "Requiere atención" };
const ICONO_ESTADO = { bien: "checkmark-circle", regular: "alert-circle", mal: "close-circle" };

/**
 * Vista de la inspección digital para el cliente — SOLO LECTURA. No hay
 * ningún botón de editar, subir foto ni cambiar nada; es exactamente lo
 * que el taller capturó, tal cual.
 */
export default function InspeccionView({ servicioId }) {
  const [inspeccion, setInspeccion] = useState(null);
  const [fotos, setFotos] = useState([]);
  const [fotosPuntos, setFotosPuntos] = useState({}); // { id_item: [url] } — fotos de los puntos en Regular/Mal
  const [zona, setZona] = useState(null); // zona elegida en el auto 3D
  const [visor, setVisor] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.get(`/portal-cliente/mis-servicios/${servicioId}/inspeccion`)
      .then((data) => {
        setInspeccion(data);
        if (data) {
          api.get(`/portal-cliente/inspecciones/${data.id_inspeccion}/fotos`).then(setFotos).catch(() => setFotos([]));
          api.get(`/portal-cliente/mis-servicios/${servicioId}/visual`).then((d) => setFotosPuntos(d?.fotos_puntos || {})).catch(() => setFotosPuntos({}));
        }
      })
      .catch(() => setInspeccion(null))
      .finally(() => setCargando(false));
  }, [servicioId]);

  if (cargando) return <ActivityIndicator color={colors.petrol500} style={{ marginVertical: spacing.md }} />;
  if (!inspeccion) return (
    <View style={[styles.contenedor, { alignItems: "center", paddingVertical: 30 }]}>
      <Ionicons name="clipboard-outline" size={34} color={colors.ink300} />
      <Text style={[styles.subtitulo, { textAlign: "center", marginTop: 8 }]}>El taller aún no registra la inspección de tu vehículo.</Text>
    </View>
  );

  // Puntos de la inspección por zona del auto
  const porZona = {};
  inspeccion.resultados.forEach((r) => zonasDe(r.item.categoria, r.item.nombre_item).forEach((z) => { (porZona[z] = porZona[z] || []).push(r); }));
  const estadoZona = (z) => (porZona[z] ? peorEstado(porZona[z].map((r) => r.estado)) : "ninguno");
  const visibles = zona && porZona[zona] ? porZona[zona] : inspeccion.resultados;
  const categorias = [...new Set(visibles.map((r) => r.item.categoria))];
  const conteo = (e) => inspeccion.resultados.filter((r) => r.estado === e).length;
  const tono = { bien: colors.teal600, regular: colors.warn600, mal: colors.red600 };

  return (
    <View style={styles.contenedor}>
      <Text style={styles.titulo}>Inspección digital</Text>
      <Text style={styles.subtitulo}>Realizada el {new Date(inspeccion.fecha).toLocaleDateString("es-MX")}</Text>
      <View style={styles.resumen}>
        {["bien", "regular", "mal"].map((e) => (
          <View key={e} style={styles.resumenItem}>
            <Ionicons name={ICONO_ESTADO[e]} size={18} color={tono[e]} />
            <Text style={[styles.resumenNumero, { color: tono[e] }]}>{conteo(e)}</Text>
            <Text style={styles.resumenEtiqueta}>{ETIQUETA_ESTADO[e]}</Text>
          </View>
        ))}
      </View>

      <Auto3D compacto altura={240} fps={16} estadoZona={estadoZona} elegida={zona} onSelect={(z) => setZona(zona === z ? null : z)}
        ayuda="Gira el auto · toca una zona para ver sus puntos" />
      {zona && porZona[zona] ? (
        <View style={styles.zonaBarra}>
          <Text style={styles.zonaNombre} numberOfLines={2}>{ZONAS[zona]}</Text>
          <TouchableOpacity style={styles.verTodos} onPress={() => setZona(null)}><Text style={styles.verTodosTexto}>Ver todos</Text></TouchableOpacity>
        </View>
      ) : null}

      {categorias.map((cat) => (
        <View key={cat} style={{ marginBottom: spacing.md }}>
          <Text style={styles.categoria}>{cat}</Text>
          {visibles.filter((r) => r.item.categoria === cat).map((r) => (
            <View key={r.id_resultado} style={styles.itemRow}>
              <Text style={styles.itemNombre}>{r.item.nombre_item}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 }}>
                <Ionicons name={ICONO_ESTADO[r.estado] || "ellipse-outline"} size={15} color={tono[r.estado] || colors.ink500} />
                <Text style={[styles.itemEstado, { color: tono[r.estado] || colors.ink500 }]}>{ETIQUETA_ESTADO[r.estado] || r.estado}</Text>
              </View>
              {r.comentario ? <Text style={styles.itemComentario}>{r.comentario}</Text> : null}
              {(fotosPuntos[String(r.id_item)] || []).length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  {fotosPuntos[String(r.id_item)].map((u, k, lista) => (
                    <TouchableOpacity key={k} onPress={() => setVisor({ fotos: lista, indice: k })}>
                      <Image source={{ uri: urlFoto(u) }} style={styles.fotoPunto} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          ))}
        </View>
      ))}

      {inspeccion.comentario_general ? (
        <View style={styles.generalBox}>
          <Text style={styles.generalLabel}>Observaciones generales</Text>
          <Text style={styles.generalTexto}>{inspeccion.comentario_general}</Text>
        </View>
      ) : null}

      {fotos.length > 0 && (
        <>
          <Text style={styles.categoria}>Fotos</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {fotos.map((foto) => (
              <Image
                key={foto.id_foto}
                source={{ uri: urlArchivo(foto.ruta_archivo) }}
                style={styles.foto}
              />
            ))}
          </ScrollView>
        </>
      )}
      {visor && <VisorFoto fotos={visor.fotos} indice={visor.indice} onClose={() => setVisor(null)} />}
    </View>
  );
}

const styles = crearEstilos({
  zonaBarra: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: spacing.sm },
  zonaNombre: { flex: 1, fontSize: 13, fontWeight: "800", color: colors.petrol600 },
  verTodos: { borderWidth: 1, borderColor: colors.ink300, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 6 },
  verTodosTexto: { fontSize: 12, fontWeight: "700", color: colors.ink700 },
  fotoPunto: { width: 72, height: 72, borderRadius: 8, marginRight: 8, backgroundColor: colors.paper100 },
  contenedor: { backgroundColor: colors.paper100, borderRadius: 14, padding: 16, marginBottom: 12 },
  resumen: { flexDirection: "row", gap: 8, marginBottom: 14 },
  resumenItem: { flex: 1, alignItems: "center", backgroundColor: colors.paper0, borderRadius: 10, paddingVertical: 10 },
  resumenNumero: { fontFamily: "BarlowCondensed_700Bold", fontSize: 22 },
  resumenEtiqueta: { fontSize: 11, color: colors.ink500 },
  titulo: { fontSize: 12.5, fontWeight: "700", color: colors.ink700, textTransform: "uppercase", letterSpacing: 0.6 },
  subtitulo: { fontSize: 11, color: colors.ink500, marginBottom: spacing.md },
  categoria: { fontSize: 11, fontWeight: "800", color: colors.petrol600, textTransform: "uppercase", marginBottom: 6 },
  itemRow: { backgroundColor: colors.paper0, borderRadius: 10, padding: 10, marginBottom: 6 },
  itemNombre: { fontSize: 14, fontWeight: "600", color: colors.ink900 },
  itemEstado: { fontSize: 12.5, fontWeight: "600" },
  itemComentario: { fontSize: 13, color: colors.ink700, marginTop: 2 },
  generalBox: { backgroundColor: colors.paper0, borderRadius: 8, padding: 10, marginBottom: spacing.md },
  generalLabel: { fontSize: 10.5, fontWeight: "700", color: colors.ink500, textTransform: "uppercase" },
  generalTexto: { fontSize: 12.5, color: colors.ink900, marginTop: 2 },
  foto: { width: 110, height: 110, borderRadius: 8, marginRight: 8, backgroundColor: colors.paper0 },
});
