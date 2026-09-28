import { useCallback, useState } from "react";
import { View, Text, Image, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { api, urlArchivo, archivoParaForm } from "../api";
import { useAuth } from "../context/AuthContext";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { alerta } from "../ui/Dialogo";


/**
 * Galería de fotos reutilizable (vehículo o servicio). Permite tomar foto
 * con la cámara o elegir de la galería del teléfono.
 */
export default function FotoGaleria({ entidadTipo, entidadId }) {
  const { hasPermission } = useAuth();
  const [fotos, setFotos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);

  const permisoModulo = entidadTipo === "vehiculo" ? "vehiculos.editar" : "servicios.editar";
  const puedeEditar = hasPermission(permisoModulo);

  async function cargar() {
    setCargando(true);
    try {
      const data = await api.get(`/fotos/?entidad_tipo=${entidadTipo}&entidad_id=${entidadId}`);
      setFotos(Array.isArray(data) ? data : []);
    } finally {
      setCargando(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      cargar();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entidadTipo, entidadId])
  );

  async function subirDesde(origen) {
    const permisoDispositivo = origen === "camara"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permisoDispositivo.granted) {
      alerta("Falta permiso", origen === "camara" ? "Activa el permiso de cámara para tomar fotos." : "Activa el permiso de fotos para elegir una imagen.");
      return;
    }

    const resultado = origen === "camara"
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    if (resultado.canceled) return;

    const asset = resultado.assets[0];
    const nombreArchivo = asset.fileName || `foto_${Date.now()}.jpg`;
    const tipoMime = asset.mimeType || "image/jpeg";

    const formData = new FormData();
    formData.append("entidad_tipo", entidadTipo);
    formData.append("entidad_id", String(entidadId));
    formData.append("archivo", await archivoParaForm(asset.uri), nombreArchivo);

    setSubiendo(true);
    try {
      await api.postForm("/fotos/", formData);
      await cargar();
    } catch (err) {
      alerta("Error al subir", err.message);
    } finally {
      setSubiendo(false);
    }
  }

  function elegirOrigen() {
    alerta("Agregar foto", "¿De dónde la tomamos?", [
      { text: "Cámara", onPress: () => subirDesde("camara") },
      { text: "Galería del teléfono", onPress: () => subirDesde("galeria") },
      { text: "Cancelar", style: "cancel" },
    ]);
  }

  function eliminar(foto) {
    alerta("Eliminar foto", "¿Seguro? No se puede deshacer.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar", style: "destructive", onPress: async () => {
          try {
            await api.del(`/fotos/${foto.id_foto}`);
            setFotos((prev) => prev.filter((f) => f.id_foto !== foto.id_foto));
          } catch (err) {
            alerta("Error", err.message);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.contenedor}>
      <View style={styles.encabezado}>
        <Text style={styles.titulo}>Fotos {fotos.length > 0 ? `(${fotos.length})` : ""}</Text>
        {puedeEditar && (
          <TouchableOpacity style={styles.botonAgregar} onPress={elegirOrigen} disabled={subiendo}>
            <Text style={styles.botonAgregarTexto}>{subiendo ? "Subiendo…" : "+ Agregar"}</Text>
          </TouchableOpacity>
        )}
      </View>

      {cargando ? (
        <ActivityIndicator color={colors.petrol500} />
      ) : fotos.length === 0 ? (
        <Text style={styles.vacio}>Sin fotos todavía.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {fotos.map((foto) => (
            <View key={foto.id_foto} style={styles.miniatura}>
              <Image source={{ uri: urlArchivo(foto.ruta_archivo) }} style={styles.imagen} />
              {puedeEditar && (
                <TouchableOpacity style={styles.botonBorrar} onPress={() => eliminar(foto)}>
                  <Text style={styles.botonBorrarTexto}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = crearEstilos({
  contenedor: { marginVertical: spacing.sm },
  encabezado: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  titulo: { fontSize: 12, fontWeight: "800", color: colors.ink700, textTransform: "uppercase" },
  botonAgregar: { backgroundColor: colors.petrol500, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  botonAgregarTexto: { color: "#fff", fontWeight: "700", fontSize: 12 },
  vacio: { fontSize: 12, color: colors.ink500 },
  miniatura: { marginRight: spacing.sm, position: "relative" },
  imagen: { width: 100, height: 100, borderRadius: 8, backgroundColor: colors.paper100 },
  botonBorrar: { position: "absolute", top: 4, right: 4, backgroundColor: "rgba(20,24,28,0.7)", borderRadius: 100, width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  botonBorrarTexto: { color: "#fff", fontSize: 11, fontWeight: "800" },
});
