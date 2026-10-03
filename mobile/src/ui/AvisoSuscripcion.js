// Aviso de la suscripción del taller (por vencer, periodo de gracia /
// solo consulta). Si está bloqueada, App.js muestra PantallaBloqueo.
import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Modal, Linking, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { colors } from "../theme";
import { crearEstilos } from "./estilos";

export function AvisoSuscripcion() {
  const { estadoSuscripcion, hasPermission } = useAuth();
  const [pagando, setPagando] = useState(false);
  if (!estadoSuscripcion?.mensaje || estadoSuscripcion.bloqueado) return null;
  const grave = estadoSuscripcion.solo_lectura;
  return (
    <View style={[styles.barra, { backgroundColor: grave ? colors.red100 : colors.warn100 }]}>
      <Ionicons name={grave ? "lock-closed-outline" : "time-outline"} size={14} color={grave ? colors.red600 : colors.warn600} />
      <Text style={[styles.texto, { color: grave ? colors.red600 : colors.warn600 }]}>{estadoSuscripcion.mensaje}</Text>
      {hasPermission?.("configuracion.editar") ? (
        <TouchableOpacity style={styles.pagarChico} onPress={() => setPagando(true)}>
          <Text style={styles.pagarChicoTexto}>Pagar</Text>
        </TouchableOpacity>
      ) : null}
      <PagarSuscripcion visible={pagando} onCerrar={() => setPagando(false)} />
    </View>
  );
}

export function PantallaBloqueo() {
  const { estadoSuscripcion, talleres, logout } = useAuth();
  const [pagando, setPagando] = useState(false);
  return (
    <View style={styles.bloqueo}>
      <Ionicons name="lock-closed" size={44} color={colors.red600} />
      <Text style={styles.bloqueoTitulo}>Acceso suspendido</Text>
      <Text style={styles.bloqueoTexto}>{estadoSuscripcion?.mensaje}</Text>
      <TouchableOpacity style={styles.boton} onPress={() => setPagando(true)}>
        <Text style={styles.botonTexto}>Pagar suscripción</Text>
      </TouchableOpacity>
      <PagarSuscripcion visible={pagando} onCerrar={() => setPagando(false)} />
      {talleres.length > 1 ? (
        <TouchableOpacity style={styles.boton} onPress={() => SelectorEstado.abrirSelector && SelectorEstado.abrirSelector()}>
          <Text style={styles.botonTexto}>Entrar a otro taller</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity style={[styles.boton, styles.botonSecundario]} onPress={logout}>
        <Text style={[styles.botonTexto, { color: colors.ink900 }]}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

// Pago en línea con Mercado Pago: se elige el tipo de cobro y se abre la
// página de pago en el navegador. Al aprobarse, el backend renueva solo.
export function PagarSuscripcion({ visible, onCerrar }) {
  const [datos, setDatos] = useState(null);
  const [elegido, setElegido] = useState(null);
  const [error, setError] = useState("");
  const [abriendo, setAbriendo] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setError("");
    api.get("/pagos-en-linea/opciones")
      .then((d) => { setDatos(d); setElegido(d.id_tipo_cobro_actual || d.opciones[0]?.id_tipo_cobro); })
      .catch((e) => setError(e.message));
  }, [visible]);

  async function pagar() {
    setAbriendo(true);
    setError("");
    try {
      const { url } = await api.post("/pagos-en-linea/checkout", { id_tipo_cobro: elegido });
      await Linking.openURL(url);
      onCerrar();
    } catch (e) {
      setError(e.message);
    } finally {
      setAbriendo(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCerrar}>
      <View style={styles.hojaFondo}>
        <View style={styles.hoja}>
          <Text style={styles.hojaTitulo}>Pagar suscripción</Text>
          {!datos && !error ? <ActivityIndicator color={colors.petrol600} /> : null}
          {datos && !datos.disponible ? <Text style={styles.bloqueoTexto}>El pago en línea aún no está disponible. Contacta a ALDM para pagar por transferencia.</Text> : null}
          {datos?.disponible ? (
            <>
              <Text style={styles.hojaSub}>Plan {datos.paquete}. Tarjeta, OXXO o SPEI; al aprobarse se renueva sola.</Text>
              {datos.opciones.map((o) => {
                const activo = elegido === o.id_tipo_cobro;
                return (
                  <TouchableOpacity key={o.id_tipo_cobro} style={[styles.opcion, activo && styles.opcionActiva]} onPress={() => setElegido(o.id_tipo_cobro)}>
                    <Text style={[styles.opcionTexto, activo && { color: colors.paper100 }]}>{o.nombre} ({o.meses} mes{o.meses > 1 ? "es" : ""})</Text>
                    <Text style={[styles.opcionTexto, { fontWeight: "800" }, activo && { color: colors.paper100 }]}>{fmt(o.monto)}</Text>
                  </TouchableOpacity>
                );
              })}
            </>
          ) : null}
          {error ? <Text style={{ color: colors.red600, marginTop: 8 }}>{error}</Text> : null}
          {datos?.disponible ? (
            <TouchableOpacity style={[styles.boton, { marginTop: 12, opacity: !elegido || abriendo ? 0.6 : 1 }]} disabled={!elegido || abriendo} onPress={pagar}>
              <Text style={styles.botonTexto}>{abriendo ? "Abriendo…" : "Ir a pagar"}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={[styles.boton, styles.botonSecundario, { marginTop: 8 }]} onPress={onCerrar}>
            <Text style={[styles.botonTexto, { color: colors.ink900 }]}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// Lo llena SelectorTaller al montarse, para poder abrirlo desde aquí.
export const SelectorEstado = { abrirSelector: null };

const styles = crearEstilos({
  barra: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 12 },
  texto: { flex: 1, fontSize: 12, fontWeight: "600" },
  bloqueo: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: colors.paper0, gap: 10 },
  bloqueoTitulo: { fontFamily: "BarlowCondensed_700Bold", fontSize: 28, color: colors.red600 },
  bloqueoTexto: { fontSize: 14, color: colors.ink700, textAlign: "center", marginBottom: 10 },
  boton: { backgroundColor: colors.petrol600, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 22, alignSelf: "stretch", alignItems: "center" },
  botonSecundario: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300 },
  botonTexto: { color: colors.paper100, fontWeight: "700", fontSize: 15 },
  pagarChico: { backgroundColor: colors.petrol600, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  pagarChicoTexto: { color: colors.paper100, fontWeight: "700", fontSize: 12 },
  hojaFondo: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  hoja: { backgroundColor: colors.paper0, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, paddingBottom: 32, gap: 8 },
  hojaTitulo: { fontFamily: "BarlowCondensed_700Bold", fontSize: 24, color: colors.ink900 },
  hojaSub: { fontSize: 13, color: colors.ink700, marginBottom: 4 },
  opcion: { flexDirection: "row", justifyContent: "space-between", borderWidth: 1, borderColor: colors.ink300, borderRadius: 12, padding: 13, backgroundColor: colors.paper100 },
  opcionActiva: { backgroundColor: colors.petrol600, borderColor: colors.petrol600 },
  opcionTexto: { fontSize: 14, color: colors.ink900 },
});
