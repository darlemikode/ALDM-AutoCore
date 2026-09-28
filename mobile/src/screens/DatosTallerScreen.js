import { useCallback, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Image, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { api, urlArchivo, archivoParaForm } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import FormScroll from "../ui/FormScroll";
import { Picker } from "../ui/Picker";
import { alerta } from "../ui/Dialogo";
import { useAuth } from "../context/AuthContext";
import QrVista from "../ui/QrVista";
import { soloDigitos, telefonoValido, MENSAJE_TELEFONO_INVALIDO } from "../validaciones";

export default function DatosTallerScreen() {
  const { user } = useAuth();
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [nombreTaller, setNombreTaller] = useState("");
  const [direccion, setDireccion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [rfc, setRfc] = useState("");
  const [rutaLogo, setRutaLogo] = useState(null);
  // Dirección desglosada (igual que Configuración del taller en la web)
  const [cp, setCp] = useState("");
  const [calle, setCalle] = useState("");
  const [numeroTaller, setNumeroTaller] = useState("");
  const [idEstado, setIdEstado] = useState("");
  const [idCiudad, setIdCiudad] = useState("");
  const [estados, setEstados] = useState([]);
  const [ciudades, setCiudades] = useState([]);
  const [buscandoCp, setBuscandoCp] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setCargando(true);
      api.get("/estados/").then(setEstados).catch(() => setEstados([]));
      api.get("/configuracion-taller/")
        .then((c) => {
          setNombreTaller(c.nombre_taller || "");
          setDireccion(c.direccion || "");
          setTelefono(c.telefono || "");
          setCorreo(c.correo || "");
          setRfc(c.rfc || "");
          setRutaLogo(c.ruta_logo || null);
          setCp(c.cp || ""); setCalle(c.calle || ""); setNumeroTaller(c.numero_taller || "");
          setIdEstado(c.id_estado || ""); setIdCiudad(c.id_ciudad || "");
          if (c.id_estado) api.get(`/ciudades/?id_estado=${c.id_estado}`).then(setCiudades).catch(() => {});
        })
        .catch((err) => alerta("Error", err.message))
        .finally(() => setCargando(false));
    }, [])
  );

  async function guardar() {
    if (!nombreTaller.trim()) {
      alerta("Falta información", "Escribe el nombre del taller.");
      return;
    }
    if (!telefonoValido(telefono, { opcional: true })) {
      alerta("Teléfono inválido", MENSAJE_TELEFONO_INVALIDO);
      return;
    }
    setGuardando(true);
    try {
      await api.put("/configuracion-taller/", {
        nombre_taller: nombreTaller.trim(),
        direccion: direccion.trim() || null,
        telefono: telefono.trim() || null,
        correo: correo.trim() || null,
        rfc: rfc.trim() || null,
        cp: cp || null,
        calle: calle.trim() || null,
        numero_taller: numeroTaller.trim() || null,
        id_estado: idEstado ? Number(idEstado) : null,
        id_ciudad: idCiudad ? Number(idCiudad) : null,
      });
      alerta("Listo", "Los datos del taller se guardaron — ya aparecerán en el membrete de las notas.");
    } catch (err) {
      alerta("Error", err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function elegirEstado(id) {
    setIdEstado(id); setIdCiudad("");
    setCiudades(id ? await api.get(`/ciudades/?id_estado=${id}`).catch(() => []) : []);
  }

  // Al escribir un CP conocido se autocompletan estado y municipio (igual que la web)
  async function alCambiarCp(valor) {
    setCp(valor);
    if (valor.length !== 5) return;
    setBuscandoCp(true);
    try {
      const info = await api.get(`/codigos-postales/${valor}`);
      const est = estados.find((e) => e.nombre_estado === info.estado);
      if (est) {
        const lista = await api.get(`/ciudades/?id_estado=${est.id_estado}`);
        setCiudades(lista);
        setIdEstado(est.id_estado);
        const ciu = lista.find((c) => c.nombre_ciudad === info.ciudad || c.nombre_ciudad === info.municipio);
        if (ciu) setIdCiudad(ciu.id_ciudad);
      }
    } catch {
      // CP fuera del catálogo: se sigue a mano
    } finally {
      setBuscandoCp(false);
    }
  }

  async function elegirLogo() {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      alerta("Falta permiso", "Activa el permiso de fotos para elegir el logo.");
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (resultado.canceled) return;

    const asset = resultado.assets[0];
    const nombreArchivo = asset.fileName || `logo_${Date.now()}.jpg`;
    const tipoMime = asset.mimeType || "image/jpeg";

    const formData = new FormData();
    formData.append("archivo", await archivoParaForm(asset.uri), nombreArchivo);

    setSubiendoLogo(true);
    try {
      const actualizado = await api.postForm("/configuracion-taller/logo", formData);
      setRutaLogo(actualizado.ruta_logo || null);
    } catch (err) {
      alerta("Error al subir el logo", err.message);
    } finally {
      setSubiendoLogo(false);
    }
  }

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colors.petrol500} size="large" />
      </View>
    );
  }

  // ruta_logo puede ser una URL del servidor real, o un data-URI base64 en
  // modo local (ver apiLocal.js) — <Image> acepta ambos igual.
  const uriLogo = urlArchivo(rutaLogo);

  return (
    <FormScroll style={styles.screen} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
      <Text style={styles.subtitulo}>Aparecen en el membrete de las notas y recibos que se le entregan al cliente.</Text>

      <View style={styles.logoBox}>
        {uriLogo ? (
          <Image source={{ uri: uriLogo }} style={styles.logoImg} resizeMode="contain" />
        ) : (
          <Text style={styles.logoVacio}>Sin logo</Text>
        )}
        <TouchableOpacity style={styles.botonLogo} onPress={elegirLogo} disabled={subiendoLogo}>
          <Text style={styles.botonLogoTexto}>{subiendoLogo ? "Subiendo…" : "Cambiar logo"}</Text>
        </TouchableOpacity>
      </View>

      <Campo label="Nombre del taller">
        <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={nombreTaller} onChangeText={setNombreTaller} placeholder="Ej. Taller Mecánico García" />
      </Campo>
      <Campo label="Dirección">
        <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={direccion} onChangeText={setDireccion} placeholder="Calle, número, colonia, ciudad" />
      </Campo>
      <Campo label="Código postal">
        <TextInput style={styles.input} value={cp} onChangeText={alCambiarCp} keyboardType="number-pad" maxLength={5} placeholder="37000" placeholderTextColor={colors.ink500} />
        {buscandoCp ? <Text style={styles.subtitulo}>Buscando…</Text> : null}
      </Campo>
      <Campo label="Estado">
        <View style={styles.pickerWrap}>
          <Picker titulo="Estado" style={{ color: colors.ink900 }} dropdownIconColor={colors.ink500} selectedValue={idEstado} onValueChange={elegirEstado}>
            <Picker.Item label="-- Selecciona --" value="" />
            {estados.map((e) => <Picker.Item key={e.id_estado} label={e.nombre_estado} value={e.id_estado} />)}
          </Picker>
        </View>
      </Campo>
      <Campo label="Municipio / ciudad">
        <View style={styles.pickerWrap}>
          <Picker titulo="Municipio / ciudad" style={{ color: colors.ink900 }} dropdownIconColor={colors.ink500} enabled={!!idEstado} selectedValue={idCiudad} onValueChange={setIdCiudad}>
            <Picker.Item label={idEstado ? "-- Selecciona --" : "Elige el estado primero"} value="" />
            {ciudades.map((c) => <Picker.Item key={c.id_ciudad} label={c.nombre_ciudad} value={c.id_ciudad} />)}
          </Picker>
        </View>
      </Campo>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 2 }}>
          <Campo label="Calle">
            <TextInput style={styles.input} value={calle} onChangeText={setCalle} placeholder="Av. Siempre Viva" placeholderTextColor={colors.ink500} />
          </Campo>
        </View>
        <View style={{ flex: 1 }}>
          <Campo label="Número">
            <TextInput style={styles.input} value={numeroTaller} onChangeText={setNumeroTaller} placeholder="123" placeholderTextColor={colors.ink500} />
          </Campo>
        </View>
      </View>
      <Campo label="Teléfono">
        <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={telefono} onChangeText={(v) => setTelefono(soloDigitos(v))} placeholder="33 1234 5678" keyboardType="phone-pad" maxLength={10} />
      </Campo>
      <Campo label="Correo">
        <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={correo} onChangeText={setCorreo} placeholder="contacto@mitaller.com" keyboardType="email-address" autoCapitalize="none" />
      </Campo>
      <Campo label="RFC">
        <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={rfc} onChangeText={setRfc} placeholder="XAXX010101000" autoCapitalize="characters" />
      </Campo>

      <TouchableOpacity style={styles.boton} onPress={guardar} disabled={guardando}>
        <Text style={styles.botonTexto}>{guardando ? "Guardando…" : "Guardar cambios"}</Text>
      </TouchableOpacity>

      {user?.qr_taller ? (
        <View style={styles.qrBox}>
          <Text style={styles.qrTitulo}>QR para tus clientes</Text>
          <Text style={styles.qrTexto}>Tus clientes lo escanean para entrar a la app de tu taller. Muéstralo en pantalla o pídele a ALDM la versión para imprimir.</Text>
          <QrVista contenido={user.qr_taller} tamano={210} />
          <Text style={styles.qrCodigo}>{user.codigo_taller}</Text>
        </View>
      ) : null}
    </FormScroll>
  );
}

function Campo({ label, children }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  qrBox: { alignItems: "center", backgroundColor: colors.paper100, borderRadius: 12, padding: spacing.lg, marginTop: spacing.lg, gap: 10 },
  qrTitulo: { fontFamily: "BarlowCondensed_700Bold", fontSize: 20, color: colors.ink900 },
  qrTexto: { fontSize: 12.5, color: colors.ink700, textAlign: "center" },
  qrCodigo: { fontSize: 20, fontWeight: "800", letterSpacing: 2, color: colors.ink900 },
  centrado: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper0 },
  titulo: { fontSize: 20, fontWeight: "800", color: colors.ink900 },
  subtitulo: { fontSize: 12.5, color: colors.ink500, marginTop: 4, marginBottom: spacing.lg },
  logoBox: { alignItems: "center", backgroundColor: colors.paper100, borderRadius: 10, padding: spacing.lg, marginBottom: spacing.lg },
  logoImg: { width: 120, height: 120, marginBottom: spacing.sm },
  logoVacio: { color: colors.ink500, fontSize: 13, marginBottom: spacing.sm, width: 120, height: 120, textAlign: "center", textAlignVertical: "center" },
  botonLogo: { backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  botonLogoTexto: { fontSize: 12.5, fontWeight: "700", color: colors.ink700 },
  label: { fontSize: 11, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 },
  pickerWrap: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, overflow: "hidden" },
  input: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, padding: 10, fontSize: 14, color: colors.ink900 },
  boton: { backgroundColor: colors.petrol500, borderRadius: 8, padding: 14, alignItems: "center", marginTop: spacing.md },
  botonTexto: { color: "#fff", fontWeight: "800", fontSize: 14, textTransform: "uppercase" },
});
