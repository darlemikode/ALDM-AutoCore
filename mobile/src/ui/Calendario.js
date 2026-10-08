import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "../theme";
import { crearEstilos } from "./estilos";

// Calendario táctil (sin dependencias nativas). valor/onElegir usan "AAAA-MM-DD".
// Toca el mes o el año del encabezado para saltar directo a otro mes/año.
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS = ["L", "M", "M", "J", "V", "S", "D"];
const DIAS_LARGO = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const pad = (n) => String(n).padStart(2, "0");
const fmt = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const hoyStr = () => { const d = new Date(); return fmt(d.getFullYear(), d.getMonth(), d.getDate()); };
const FILA_ANIO = 58;

export default function Calendario({ visible, valor, titulo = "Elige una fecha", onElegir, onCerrar }) {
  const valido = /^\d{4}-\d{2}-\d{2}/.test(valor || "");
  const base = valido ? String(valor).slice(0, 10) : hoyStr();
  const [vista, setVista] = useState({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 });
  const [modo, setModo] = useState("dias"); // dias | meses | anios
  const [abiertoAntes, setAbiertoAntes] = useState(false);
  const scrollAnios = useRef(null);
  if (visible && !abiertoAntes) {
    setAbiertoAntes(true);
    setVista({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 });
    setModo("dias");
  } else if (!visible && abiertoAntes) setAbiertoAntes(false);

  const anioActual = new Date().getFullYear();
  const anios = Array.from({ length: anioActual + 11 - 1940 }, (_, i) => anioActual + 10 - i);
  useEffect(() => {
    if (modo === "anios") {
      const idx = Math.max(0, anios.indexOf(vista.y));
      setTimeout(() => scrollAnios.current?.scrollTo({ y: Math.max(0, Math.floor(idx / 4) * FILA_ANIO - FILA_ANIO), animated: false }), 30);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo]);

  const primero = (new Date(vista.y, vista.m, 1).getDay() + 6) % 7; // lunes = 0
  const total = new Date(vista.y, vista.m + 1, 0).getDate();
  const celdas = [...Array(primero).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  while (celdas.length % 7) celdas.push(null);
  const sel = valido ? base : "";
  const hoy = hoyStr();
  const mover = (n) => setVista((v) => { const d = new Date(v.y, v.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  const refSel = sel ? new Date(`${sel}T00:00:00`) : null;
  const titularFecha = refSel ? `${DIAS_LARGO[refSel.getDay()]}, ${refSel.getDate()} de ${MESES[refSel.getMonth()].toLowerCase()}` : "Sin fecha";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar}>
        <Pressable style={styles.caja} onPress={() => {}}>
          {/* Banner con la fecha elegida */}
          <View style={styles.banner}>
            <Text style={styles.bannerTitulo}>{titulo}</Text>
            <Text style={styles.bannerFecha}>{titularFecha}</Text>
            <Text style={styles.bannerAnio}>{refSel ? refSel.getFullYear() : ""}</Text>
          </View>

          {/* Selectores de mes y año */}
          <View style={styles.nav}>
            <TouchableOpacity onPress={() => (modo === "dias" ? mover(-1) : setVista((v) => ({ ...v, y: v.y - 1 })))} hitSlop={8} style={styles.flecha}>
              <Ionicons name="chevron-back" size={22} color={colors.ink900} />
            </TouchableOpacity>
            <View style={styles.selectores}>
              <TouchableOpacity onPress={() => setModo(modo === "meses" ? "dias" : "meses")} style={[styles.pildora, modo === "meses" && styles.pildoraActiva]}>
                <Text style={styles.pildoraTexto}>{MESES[vista.m]}</Text>
                <Ionicons name={modo === "meses" ? "chevron-up" : "chevron-down"} size={16} color={colors.petrol500} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setModo(modo === "anios" ? "dias" : "anios")} style={[styles.pildora, modo === "anios" && styles.pildoraActiva]}>
                <Text style={styles.pildoraTexto}>{vista.y}</Text>
                <Ionicons name={modo === "anios" ? "chevron-up" : "chevron-down"} size={16} color={colors.petrol500} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => (modo === "dias" ? mover(1) : setVista((v) => ({ ...v, y: v.y + 1 })))} hitSlop={8} style={styles.flecha}>
              <Ionicons name="chevron-forward" size={22} color={colors.ink900} />
            </TouchableOpacity>
          </View>

          <View style={styles.cuerpo}>
            {modo === "dias" && (
              <>
                <View style={styles.fila}>
                  {DIAS.map((d, i) => <Text key={i} style={[styles.diaSemana, i >= 5 && { opacity: 0.6 }]}>{d}</Text>)}
                </View>
                {Array.from({ length: celdas.length / 7 }, (_, r) => (
                  <View key={r} style={styles.fila}>
                    {celdas.slice(r * 7, r * 7 + 7).map((d, i) => {
                      if (!d) return <View key={i} style={styles.celda} />;
                      const f = fmt(vista.y, vista.m, d);
                      const activo = f === sel;
                      return (
                        <TouchableOpacity key={i} style={styles.celda} onPress={() => onElegir(f)} activeOpacity={0.7}>
                          <View style={[styles.dia, f === hoy && styles.diaHoy, activo && styles.diaActivo]}>
                            <Text style={[styles.diaTexto, i >= 5 && !activo && { color: colors.ink500 }, activo && styles.diaTextoActivo]}>{d}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </>
            )}

            {modo === "meses" && (
              <View style={styles.rejilla}>
                {MESES.map((nombre, i) => {
                  const activo = i === vista.m;
                  return (
                    <TouchableOpacity key={nombre} style={styles.celdaMes} onPress={() => { setVista((v) => ({ ...v, m: i })); setModo("dias"); }}>
                      <View style={[styles.bloque, activo && styles.bloqueActivo]}>
                        <Text style={[styles.bloqueTexto, activo && styles.diaTextoActivo]}>{nombre.slice(0, 3)}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {modo === "anios" && (
              <ScrollView ref={scrollAnios} style={{ height: FILA_ANIO * 5 }} showsVerticalScrollIndicator={false}>
                <View style={styles.rejilla}>
                  {anios.map((a) => {
                    const activo = a === vista.y;
                    return (
                      <TouchableOpacity key={a} style={styles.celdaAnio} onPress={() => { setVista((v) => ({ ...v, y: a })); setModo("dias"); }}>
                        <View style={[styles.bloque, activo && styles.bloqueActivo, a === anioActual && !activo && styles.diaHoy]}>
                          <Text style={[styles.bloqueTexto, activo && styles.diaTextoActivo]}>{a}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>

          <View style={styles.pie}>
            <TouchableOpacity style={styles.botonHoy} onPress={() => onElegir(hoy)}>
              <Ionicons name="today-outline" size={18} color={colors.petrol500} />
              <Text style={styles.accion}>Hoy</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onCerrar}><Text style={[styles.accion, { color: colors.ink500 }]}>Cancelar</Text></TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = crearEstilos({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  caja: { width: "100%", maxWidth: 400, backgroundColor: colors.paper100, borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: colors.ink300 },
  banner: { backgroundColor: `${colors.petrol500}33`, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: `${colors.petrol500}55` },
  bannerTitulo: { fontSize: 12, fontWeight: "800", color: colors.petrol500, textTransform: "uppercase", letterSpacing: 0.8 },
  bannerFecha: { fontSize: 24, fontWeight: "800", color: colors.ink900, marginTop: 4 },
  bannerAnio: { fontSize: 15, fontWeight: "700", color: colors.ink500, marginTop: 1 },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingTop: 14, paddingBottom: 6, gap: 6 },
  flecha: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper0 },
  selectores: { flexDirection: "row", gap: 8, flex: 1, justifyContent: "center" },
  pildora: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 100, backgroundColor: colors.paper0, borderWidth: 1.5, borderColor: colors.ink300 },
  pildoraActiva: { borderColor: colors.petrol500, backgroundColor: `${colors.petrol500}22` },
  pildoraTexto: { fontSize: 16, fontWeight: "800", color: colors.ink900 },
  cuerpo: { paddingHorizontal: 12, paddingTop: 6, minHeight: 6 * 50 + 34 },
  fila: { flexDirection: "row" },
  diaSemana: { flex: 1, textAlign: "center", fontSize: 13, fontWeight: "800", color: colors.petrol500, paddingVertical: 8 },
  celda: { flex: 1, height: 48, alignItems: "center", justifyContent: "center" },
  dia: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  diaHoy: { borderWidth: 1.5, borderColor: colors.petrol500 },
  diaActivo: { backgroundColor: colors.petrol500, shadowColor: colors.petrol500, shadowOpacity: 0.55, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 6 },
  diaTexto: { fontSize: 17, fontWeight: "600", color: colors.ink900 },
  diaTextoActivo: { color: colors.paper0, fontWeight: "800" },
  rejilla: { flexDirection: "row", flexWrap: "wrap" },
  celdaMes: { width: "33.33%", height: 72, padding: 5 },
  celdaAnio: { width: "25%", height: FILA_ANIO, padding: 4 },
  bloque: { flex: 1, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300 },
  bloqueActivo: { backgroundColor: colors.petrol500, borderColor: colors.petrol500 },
  bloqueTexto: { fontSize: 16, fontWeight: "700", color: colors.ink900 },
  pie: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10 },
  botonHoy: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 100, backgroundColor: `${colors.petrol500}22` },
  accion: { fontSize: 16, fontWeight: "800", color: colors.petrol500 },
});
