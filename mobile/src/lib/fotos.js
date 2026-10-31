import * as ImagePicker from "expo-image-picker";
import { archivoParaForm, urlArchivo } from "../api";
import { alerta } from "../ui/Dialogo";

/** URL completa de una foto: acepta "/uploads/x.jpg", "x.jpg" o una URL ya completa. */
export function urlFoto(u) {
  if (!u) return null;
  if (/^(data:|https?:|file:)/.test(u)) return u;
  return urlArchivo(u.replace(/^\/?uploads\//, ""));
}

/** Pregunta si la foto viene de la cámara o de la galería (útil en tablets). Devuelve "camara" | "galeria" | null. */
export function elegirOrigenFoto() {
  return new Promise((resolve) => {
    alerta("Agregar foto", "¿De dónde la tomamos?", [
      { text: "Cámara", onPress: () => resolve("camara") },
      { text: "Galería del teléfono", onPress: () => resolve("galeria") },
      { text: "Cancelar", style: "cancel", onPress: () => resolve(null) },
    ]);
  });
}

/** Abre la cámara o la galería y devuelve { blob, nombre } listo para un FormData, o null si se cancela. */
export async function capturarFoto(origen) {
  const permiso = origen === "camara" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permiso.granted) {
    alerta("Falta permiso", origen === "camara" ? "Activa el permiso de cámara para tomar fotos." : "Activa el permiso de fotos para elegir una imagen.");
    return null;
  }
  const r = origen === "camara" ? await ImagePicker.launchCameraAsync({ quality: 0.6 }) : await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
  if (r.canceled) return null;
  const asset = r.assets[0];
  return { blob: await archivoParaForm(asset.uri), nombre: asset.fileName || `foto_${Date.now()}.jpg`, uri: asset.uri };
}

/** Sube una foto a /fotos/ (entidad_tipo + entidad_id [+ descripcion]). */
export async function subirFoto(api, { entidadTipo, entidadId, descripcion = null, foto }) {
  const fd = new FormData();
  fd.append("entidad_tipo", entidadTipo);
  fd.append("entidad_id", String(entidadId));
  if (descripcion !== null && descripcion !== undefined) fd.append("descripcion", String(descripcion));
  fd.append("archivo", foto.blob, foto.nombre);
  return api.postForm("/fotos/", fd);
}
