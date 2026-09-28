import { useCallback, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { Picker } from "../ui/Picker";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import FormScroll from "../ui/FormScroll";
import { alerta } from "../ui/Dialogo";

const ZONAS_ABC = [
  { valor: "A", etiqueta: "A — rota mucho" },
  { valor: "B", etiqueta: "B — rota normal" },
  { valor: "C", etiqueta: "C — rota poco" },
];

export default function InventarioDetalleScreen({ route }) {
  const { id } = route.params;
  const [refaccion, setRefaccion] = useState(null);
  const [marcasRefaccion, setMarcasRefaccion] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [marcasVehiculo, setMarcasVehiculo] = useState([]);
  const [modelosVehiculo, setModelosVehiculo] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  // Campos editables de Inventario (aparte del alta básica)
  const [idMarcaRefaccion, setIdMarcaRefaccion] = useState("");
  const [idProveedor, setIdProveedor] = useState("");
  const [posicion, setPosicion] = useState("");
  const [idMarcaVeh, setIdMarcaVeh] = useState("");
  const [idModeloVeh, setIdModeloVeh] = useState("");
  const [skuInterno, setSkuInterno] = useState("");
  const [codigoBarras, setCodigoBarras] = useState("");
  const [costoCompra, setCostoCompra] = useState("");
  const [precioVenta, setPrecioVenta] = useState("");
  const [ubicacionFisica, setUbicacionFisica] = useState("");
  const [zonaAbc, setZonaAbc] = useState("");

  useFocusEffect(
    useCallback(() => {
      setCargando(true);
      Promise.all([
        api.get(`/refacciones/${id}`),
        api.get("/refacciones-marcas/"),
        api.get("/proveedores/"),
        api.get("/vehiculos-marcas/"),
        api.get("/vehiculos-modelos/"),
      ])
        .then(([ref, marcasRef, provs, marcasVeh, modelosVeh]) => {
          setRefaccion(ref);
          setMarcasRefaccion(marcasRef);
          setProveedores(provs);
          setMarcasVehiculo(marcasVeh);
          setModelosVehiculo(modelosVeh);
          setIdMarcaRefaccion(ref.id_marca_refaccion || "");
          setIdProveedor(ref.id_proveedor || "");
          setPosicion(ref.posicion || "");
          setIdMarcaVeh(ref.id_marca_vehiculo_compatible || "");
          setIdModeloVeh(ref.id_modelo_vehiculo_compatible || "");
          setSkuInterno(ref.sku_interno || "");
          setCodigoBarras(ref.codigo_barras || "");
          setCostoCompra(String(ref.preciopropio_refaccion ?? ""));
          setPrecioVenta(String(ref.preciocliente_refaccion ?? ""));
          setUbicacionFisica(ref.ubicacion_fisica || "");
          setZonaAbc(ref.zona_abc || "");
        })
        .catch((err) => alerta("Error", err.message))
        .finally(() => setCargando(false));
    }, [id])
  );

  const modelosFiltrados = modelosVehiculo.filter((m) => m.id_marca_vehiculo === Number(idMarcaVeh));

  function alCambiarMarcaVeh(valor) {
    setIdMarcaVeh(valor);
    setIdModeloVeh(""); // el modelo depende de la marca — se limpia al cambiarla
  }

  async function guardar() {
    setGuardando(true);
    try {
      await api.put(`/refacciones/${id}`, {
        ...refaccion,
        id_marca_refaccion: idMarcaRefaccion || null,
        id_proveedor: idProveedor || null,
        posicion: posicion.trim() || null,
        id_marca_vehiculo_compatible: idMarcaVeh || null,
        id_modelo_vehiculo_compatible: idModeloVeh || null,
        sku_interno: skuInterno.trim() || null,
        codigo_barras: codigoBarras.trim() || null,
        preciopropio_refaccion: parseFloat(costoCompra) || 0,
        preciocliente_refaccion: parseFloat(precioVenta) || 0,
        ubicacion_fisica: ubicacionFisica.trim() || null,
        zona_abc: zonaAbc || null,
      });
      alerta("Listo", "Los datos de inventario se guardaron.");
    } catch (err) {
      alerta("Error", err.message);
    } finally {
      setGuardando(false);
    }
  }

  if (cargando || !refaccion) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colors.petrol500} size="large" />
      </View>
    );
  }

  return (
    <FormScroll style={styles.screen} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
      <Text style={styles.titulo}>{refaccion.nombre_refaccion}</Text>
      <Text style={styles.subtitulo}>{refaccion.numero_refaccion || "sin número de parte"} · Inventario</Text>

      <Campo label="Marca del repuesto">
        <View style={styles.pickerWrap}>
          <Picker titulo="Marca del repuesto" style={{ color: colors.ink900 }} dropdownIconColor={colors.ink500} selectedValue={idMarcaRefaccion} onValueChange={setIdMarcaRefaccion}>
            <Picker.Item label="-- Sin marca --" value="" />
            {marcasRefaccion.map((m) => (
              <Picker.Item key={m.id_marca_refaccion} label={m.nombre_marca} value={m.id_marca_refaccion} />
            ))}
          </Picker>
        </View>
      </Campo>

      <Campo label="Posición">
        <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={posicion} onChangeText={setPosicion} placeholder="Ej. Delantero derecho" />
      </Campo>

      <Campo label="Compatibilidad — Marca del vehículo">
        <View style={styles.pickerWrap}>
          <Picker titulo="Compatibilidad — Marca del vehículo" style={{ color: colors.ink900 }} dropdownIconColor={colors.ink500} selectedValue={idMarcaVeh} onValueChange={alCambiarMarcaVeh}>
            <Picker.Item label="-- Cualquier marca --" value="" />
            {marcasVehiculo.map((m) => (
              <Picker.Item key={m.id_marca_vehiculo} label={m.nombre_marca} value={m.id_marca_vehiculo} />
            ))}
          </Picker>
        </View>
      </Campo>

      {idMarcaVeh ? (
        <Campo label="Compatibilidad — Modelo del vehículo">
          <View style={styles.pickerWrap}>
            <Picker titulo="Compatibilidad — Modelo del vehículo" style={{ color: colors.ink900 }} dropdownIconColor={colors.ink500} selectedValue={idModeloVeh} onValueChange={setIdModeloVeh}>
              <Picker.Item label="-- Cualquier modelo de esta marca --" value="" />
              {modelosFiltrados.map((m) => (
                <Picker.Item key={m.id_modelo_vehiculo} label={m.nombre_modelo} value={m.id_modelo_vehiculo} />
              ))}
            </Picker>
          </View>
        </Campo>
      ) : null}

      <Campo label="Proveedor">
        <View style={styles.pickerWrap}>
          <Picker titulo="Proveedor" style={{ color: colors.ink900 }} dropdownIconColor={colors.ink500} selectedValue={idProveedor} onValueChange={setIdProveedor}>
            <Picker.Item label="-- Sin proveedor --" value="" />
            {proveedores.map((p) => (
              <Picker.Item key={p.id_proveedor} label={p.nombre_proveedor} value={p.id_proveedor} />
            ))}
          </Picker>
        </View>
      </Campo>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Campo label="SKU / código interno" style={{ flex: 1 }}>
          <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={skuInterno} onChangeText={setSkuInterno} placeholder="Ej. REF-0231" />
        </Campo>
        <Campo label="Código de barras (UPC)" style={{ flex: 1 }}>
          <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={codigoBarras} onChangeText={setCodigoBarras} placeholder="750..." keyboardType="numeric" />
        </Campo>
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Campo label="Costo de compra" style={{ flex: 1 }}>
          <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={costoCompra} onChangeText={setCostoCompra} keyboardType="numeric" placeholder="0.00" />
        </Campo>
        <Campo label="Precio de venta" style={{ flex: 1 }}>
          <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={precioVenta} onChangeText={setPrecioVenta} keyboardType="numeric" placeholder="0.00" />
        </Campo>
      </View>

      <Campo label="Ubicación física">
        <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={ubicacionFisica} onChangeText={setUbicacionFisica} placeholder="Ej. Pasillo 3 - Estante B - Nivel 2" />
      </Campo>

      <Campo label="Zona de rotación (ABC)">
        <View style={styles.pickerWrap}>
          <Picker titulo="Zona de rotación (ABC)" ordenar={false} style={{ color: colors.ink900 }} dropdownIconColor={colors.ink500} selectedValue={zonaAbc} onValueChange={setZonaAbc}>
            <Picker.Item label="-- Sin definir --" value="" />
            {ZONAS_ABC.map((z) => (
              <Picker.Item key={z.valor} label={z.etiqueta} value={z.valor} />
            ))}
          </Picker>
        </View>
      </Campo>

      <TouchableOpacity style={styles.boton} onPress={guardar} disabled={guardando}>
        <Text style={styles.botonTexto}>{guardando ? "Guardando…" : "Guardar inventario"}</Text>
      </TouchableOpacity>
    </FormScroll>
  );
}

function Campo({ label, children, style }) {
  return (
    <View style={[{ marginBottom: spacing.md }, style]}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  centrado: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper0 },
  titulo: { fontSize: 20, fontWeight: "800", color: colors.ink900 },
  subtitulo: { fontSize: 13, color: colors.ink500, marginBottom: spacing.lg },
  label: { fontSize: 11, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 },
  input: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, padding: 10, fontSize: 14, color: colors.ink900 },
  pickerWrap: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, overflow: "hidden" },
  boton: { backgroundColor: colors.petrol500, borderRadius: 8, padding: 14, alignItems: "center", marginTop: spacing.md },
  botonTexto: { color: "#fff", fontWeight: "800", fontSize: 14, textTransform: "uppercase" },
});
