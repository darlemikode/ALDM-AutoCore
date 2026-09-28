import { useEffect, useState } from "react";
import { View, Text, Image, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { crearEstilos } from "../ui/estilos";
import { api, urlArchivo } from "../api";
import { colors, spacing } from "../theme";

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
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.get(`/portal-cliente/mis-servicios/${servicioId}/inspeccion`)
      .then((data) => {
        setInspeccion(data);
        if (data) {
          api.get(`/portal-cliente/inspecciones/${data.id_inspeccion}/fotos`).then(setFotos).catch(() => setFotos([]));
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

  const categorias = [...new Set(inspeccion.resultados.map((r) => r.item.categoria))];
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

      {categorias.map((cat) => (
        <View key={cat} style={{ marginBottom: spacing.md }}>
          <Text style={styles.categoria}>{cat}</Text>
          {inspeccion.resultados.filter((r) => r.item.categoria === cat).map((r) => (
            <View key={r.id_resultado} style={styles.itemRow}>
              <Text style={styles.itemNombre}>{r.item.nombre_item}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 }}>
                <Ionicons name={ICONO_ESTADO[r.estado] || "ellipse-outline"} size={15} color={tono[r.estado] || colors.ink500} />
                <Text style={[styles.itemEstado, { color: tono[r.estado] || colors.ink500 }]}>{ETIQUETA_ESTADO[r.estado] || r.estado}</Text>
              </View>
              {r.comentario ? <Text style={styles.itemComentario}>{r.comentario}</Text> : null}
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
    </View>
  );
}

const styles = crearEstilos({
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
