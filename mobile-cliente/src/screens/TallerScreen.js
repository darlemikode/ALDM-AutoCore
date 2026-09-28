// Primer paso de la app: ¿de qué taller eres? Se escanea el QR que da el
// taller (con la cámara de la app o la del teléfono) o se escribe su código.
import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Modal, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { API_URL, urlArchivo } from "../api";
import { extraerCodigo, setTallerCodigo } from "../taller";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";

export async function consultarTaller(codigo) {
  const res = await fetch(`${API_URL}/portal-cliente/taller`, { headers: { "X-Taller": codigo } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.detail || "No encontramos ese taller.");
  return data;
}

export default function TallerScreen({ onListo, codigoInicial }) {
  const [codigo, setCodigo] = useState(codigoInicial || "");
  const [taller, setTaller] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [escaneando, setEscaneando] = useState(false);
  const [permiso, pedirPermiso] = useCameraPermissions();

  // Si se abrió desde el QR (enlace aldmcliente://taller/CODIGO), se busca solo
  useEffect(() => {
    if (codigoInicial) buscar(codigoInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoInicial]);

  async function buscar(valor) {
    const limpio = extraerCodigo(valor);
    setError("");
    if (!limpio) return setError("Escribe el código de tu taller (al menos 3 letras o números).");
    setCargando(true);
    try {
      const datos = await consultarTaller(limpio);
      if (!datos.app_habilitada) throw new Error("Este taller todavía no tiene activa la app para clientes.");
      setCodigo(limpio);
      setTaller(datos);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  async function abrirCamara() {
    setError("");
    const actual = permiso?.granted ? permiso : await pedirPermiso();
    if (!actual?.granted) return setError("Sin permiso de cámara. Puedes escribir el código del taller.");
    setEscaneando(true);
  }

  async function confirmar() {
    await setTallerCodigo(codigo);
    onListo(taller);
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.brand}>ALDM <Text style={{ color: colors.petrol500 }}>AutoCore</Text></Text>
          {taller ? (
            <>
              <Text style={styles.tagline}>Este es tu taller:</Text>
              <View style={styles.tallerBox}>
                {taller.ruta_logo ? <Image source={{ uri: urlArchivo(taller.ruta_logo) }} style={styles.logo} /> : <Ionicons name="business" size={40} color={colors.petrol500} />}
                <Text style={styles.tallerNombre}>{taller.nombre}</Text>
                {taller.direccion ? <Text style={styles.tallerDato}>{taller.direccion}</Text> : null}
                {taller.telefono ? <Text style={styles.tallerDato}>{taller.telefono}</Text> : null}
              </View>
              {!taller.disponible ? <Text style={styles.error}>El servicio de este taller está suspendido por ahora.</Text> : null}
              <TouchableOpacity style={styles.boton} onPress={confirmar}>
                <Text style={styles.botonTexto}>Continuar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setTaller(null)} style={{ marginTop: 14, alignItems: "center" }}>
                <Text style={styles.link}>No es mi taller</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.tagline}>Para empezar, escanea el código QR que te dio tu taller.</Text>
              <TouchableOpacity style={styles.botonQr} onPress={abrirCamara}>
                <Ionicons name="qr-code-outline" size={26} color={colors.paper100} />
                <Text style={styles.botonTexto}>Escanear QR del taller</Text>
              </TouchableOpacity>
              <Text style={styles.separador}>o escribe el código</Text>
              <View style={styles.campo}>
                <Ionicons name="business-outline" size={18} color={colors.ink500} />
                <TextInput style={styles.input} value={codigo} onChangeText={(v) => setCodigo(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false}
                  placeholder="Ej. TALLERLEON" placeholderTextColor={colors.ink500} onSubmitEditing={() => buscar(codigo)} returnKeyType="go" />
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <TouchableOpacity style={[styles.boton, cargando && { opacity: 0.7 }]} onPress={() => buscar(codigo)} disabled={cargando}>
                {cargando ? <ActivityIndicator color={colors.paper100} /> : <Text style={styles.botonTexto}>Buscar mi taller</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>

      <Modal visible={escaneando} animationType="slide" onRequestClose={() => setEscaneando(false)}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={escaneando ? ({ data }) => { setEscaneando(false); buscar(data); } : undefined}
          />
          <View style={styles.marcoQr} pointerEvents="none" />
          <TouchableOpacity style={styles.cerrarCamara} onPress={() => setEscaneando(false)}>
            <Ionicons name="close" size={26} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "700" }}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.ink900 },
  scroll: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  card: {
    backgroundColor: colors.paper100, borderRadius: 8, paddingVertical: 32, paddingHorizontal: 26, width: "100%", maxWidth: 380,
    shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 30, shadowOffset: { width: 0, height: 20 }, elevation: 12,
  },
  brand: { fontFamily: "BarlowCondensed_700Bold", fontSize: 30, color: colors.ink900 },
  tagline: { fontSize: 13.5, color: colors.ink700, marginTop: 6, marginBottom: 20 },
  botonQr: { flexDirection: "row", gap: 10, backgroundColor: colors.petrol500, borderRadius: 12, height: 58, alignItems: "center", justifyContent: "center" },
  separador: { textAlign: "center", color: colors.ink500, fontSize: 12.5, marginVertical: 16 },
  campo: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.paper100, borderWidth: 1.5, borderColor: colors.petrol300, borderRadius: 10, paddingHorizontal: 13, height: 46, marginBottom: 12 },
  input: { flex: 1, fontSize: 15, color: colors.ink900, height: "100%", letterSpacing: 1 },
  error: { fontSize: 13, color: colors.red600, marginBottom: 8 },
  boton: { backgroundColor: colors.petrol500, borderRadius: 10, height: 46, alignItems: "center", justifyContent: "center", marginTop: 4 },
  botonTexto: { fontSize: 15, fontWeight: "600", color: colors.paper100 },
  link: { color: colors.petrol600, fontWeight: "600", fontSize: 13.5 },
  tallerBox: { alignItems: "center", gap: 6, backgroundColor: colors.paper0, borderRadius: 12, padding: 18, marginBottom: 16 },
  logo: { width: 72, height: 72, borderRadius: 12 },
  tallerNombre: { fontFamily: "BarlowCondensed_700Bold", fontSize: 24, color: colors.ink900, textAlign: "center" },
  tallerDato: { fontSize: 13, color: colors.ink700, textAlign: "center" },
  marcoQr: { position: "absolute", top: "30%", left: "15%", width: "70%", aspectRatio: 1, borderWidth: 3, borderColor: "#2fd3c4", borderRadius: 18 },
  cerrarCamara: { position: "absolute", bottom: 50, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 30 },
});
