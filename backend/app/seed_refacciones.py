"""Catálogo base de refacciones (afinación, suspensión, frenos, dirección, etc.).

Se siembra UNA vez por taller y por versión (ver seed.sembrar_refacciones_base):
solo agrega lo que falta (por nombre + categoría), nunca toca precios ni stock
ni borra nada, y si el taller borra una refacción no se vuelve a crear.
Sin precios a propósito: cada taller captura los suyos.

Para agregar más refacciones a futuro: súmalas aquí y sube VERSION_CATALOGO_REFACCIONES.
"""

VERSION_CATALOGO_REFACCIONES = 1

REFACCIONES_BASE = {
    "Motor": [
        "Juego de empaques de motor (completo)", "Junta de cabeza", "Empaque de tapa de punterías", "Empaque de cárter",
        "Empaque de múltiple de admisión", "Empaque de múltiple de escape", "Sello de cigüeñal delantero",
        "Sello de cigüeñal trasero", "Sello de árbol de levas", "Retenes de válvula", "Tapa de punterías", "Cárter de aceite",
        "Tapón de cárter", "Rondana de tapón de cárter", "Bomba de aceite", "Cadena de distribución",
        "Kit de distribución con bomba de agua", "Kit de banda de distribución", "Tensor de banda de distribución",
        "Polea tensora", "Polea loca", "Polea del cigüeñal (damper)", "Banda de accesorios (serpentina)",
        "Tensor de banda de accesorios", "Tapa de distribución", "Soporte de motor", "Soporte de transmisión (taco)",
        "Juego de pistones", "Juego de anillos de pistón", "Biela", "Metales de biela", "Metales de bancada",
        "Cigüeñal", "Árbol de levas", "Balancines", "Punterías hidráulicas", "Válvula de admisión", "Válvula de escape",
        "Cabeza de motor (culata)", "Cuerpo de aceleración", "Válvula EGR", "Válvula PCV", "Manguera PCV",
        "Varilla medidora de aceite", "Tapón de aceite", "Turbocompresor", "Intercooler", "Manguera de turbo",
        "Filtro de aire deportivo", "Colector de admisión", "Kit de reparación de motor (overhaul)", "Cubierta de motor",
    ],
    "Encendido": [
        "Bujía de cobre", "Bujía de platino", "Bujía de iridio", "Juego de cables de bujía", "Bobina de ignición",
        "Bobina individual", "Distribuidor", "Tapa de distribuidor", "Rotor de distribuidor", "Módulo de encendido",
        "Sensor de posición de cigüeñal (CKP)", "Sensor de posición de árbol de levas (CMP)", "Sensor de detonación (knock)",
        "Sensor MAP", "Sensor MAF", "Sensor de temperatura del motor (ECT)", "Sensor de temperatura del aire (IAT)",
        "Sensor de posición del acelerador (TPS)", "Sensor de presión de aceite", "Sensor de oxígeno delantero (upstream)",
        "Sensor de oxígeno trasero (downstream)", "Computadora del motor (ECU)", "Módulo BCM",
    ],
    "Combustible": [
        "Bomba de gasolina", "Módulo de bomba de gasolina", "Filtro de gasolina en línea", "Inyector de combustible",
        "Juego de inyectores", "Riel de inyectores", "Regulador de presión de combustible", "Tapón de tanque de gasolina",
        "Manguera de combustible", "Flotador de tanque", "Tanque de gasolina", "Filtro de diésel",
        "Filtro separador de agua (diésel)", "Bomba de inyección diésel", "Inyector diésel", "Bujía de precalentamiento",
        "Kit de limpieza de cuerpo de aceleración",
    ],
    "Suspensión": [
        "Amortiguador delantero", "Amortiguador trasero", "Cartucho de amortiguador delantero",
        "Base de amortiguador delantero (soporte)", "Cojinete de base de amortiguador delantero",
        "Kit guardapolvo y tope de amortiguador delantero", "Kit guardapolvo y tope de amortiguador trasero",
        "Resorte helicoidal delantero", "Resorte helicoidal trasero", "Rótula superior", "Rótula inferior",
        "Terminal exterior de dirección", "Brazo de control inferior delantero", "Brazo de control superior delantero",
        "Brazo de control trasero", "Buje de brazo de control delantero", "Buje de brazo de control trasero",
        "Buje de barra estabilizadora delantera", "Buje de barra estabilizadora trasera", "Barra estabilizadora delantera",
        "Barra estabilizadora trasera", "Tornillo estabilizador delantero (bieleta)", "Tornillo estabilizador trasero (bieleta)",
        "Maza de rueda delantera", "Maza de rueda trasera", "Balero de rueda delantero", "Balero de rueda trasero",
        "Muñón (mangueta) delantero", "Barra de tracción", "Barra Panhard", "Hojas de muelle (muelle)",
        "Soporte de muelle", "Buje de muelle", "Horquilla (tijera) delantera", "Tope de rebote delantero",
        "Tope de rebote trasero", "Kit de suspensión completa delantera", "Kit de suspensión completa trasera",
        "Barra de torsión", "Calzas de alineación", "Perno de camber", "Cubrepolvo de rótula",
    ],
    "Frenos": [
        "Balatas delanteras cerámicas", "Balatas delanteras semimetálicas", "Balatas traseras (disco)",
        "Zapatas traseras (tambor)", "Discos de freno delanteros", "Discos de freno traseros", "Tambores traseros",
        "Cilindro maestro de frenos", "Cilindro de rueda trasero", "Caliper delantero", "Caliper trasero",
        "Pistón de caliper", "Kit de reparación de caliper", "Manguera de freno delantera", "Manguera de freno trasera",
        "Línea de freno (tubo)", "Servofreno (booster)", "Sensor ABS delantero", "Sensor ABS trasero",
        "Cable de freno de mano", "Kit de herrajes de balatas", "Líquido de frenos DOT 3", "Líquido de frenos DOT 4",
        "Sensor de desgaste de balatas", "Interruptor de luz de freno", "Limpiador de frenos (spray)", "Grasa para frenos",
        "Bomba de ABS (modulador)",
    ],
    "Dirección": [
        "Cremallera hidráulica", "Cremallera eléctrica", "Bomba de dirección hidráulica", "Depósito de dirección hidráulica",
        "Manguera de alta presión de dirección", "Manguera de retorno de dirección", "Terminal interior de dirección",
        "Fuelle de cremallera (guardapolvo)", "Columna de dirección", "Cruceta de dirección", "Volante",
        "Motor de dirección eléctrica", "Banda de bomba de dirección", "Amortiguador de dirección",
    ],
    "Transmisión": [
        "Kit de clutch (disco, plato y collarín)", "Disco de clutch", "Plato de presión (prensa)", "Collarín de clutch",
        "Volante de motor (volante inercia)", "Bomba de clutch (cilindro maestro)", "Cilindro esclavo de clutch",
        "Cable de clutch", "Aceite de transmisión manual", "Aceite ATF (transmisión automática)", "Aceite de diferencial",
        "Filtro y empaque de transmisión automática", "Junta homocinética exterior", "Junta homocinética interior",
        "Flecha homocinética izquierda", "Flecha homocinética derecha", "Fuelle (cubrepolvo) de flecha homocinética",
        "Flecha cardán", "Cruceta de cardán", "Soporte central de cardán", "Sello de flecha", "Sensor de velocidad (VSS)",
        "Solenoide de transmisión", "Convertidor de par", "Kit de reparación de transmisión",
    ],
    "Refrigeración": [
        "Anticongelante concentrado", "Anticongelante 50/50 premezclado", "Carcasa de termostato", "Junta de termostato",
        "Manguera superior de radiador", "Manguera inferior de radiador", "Manguera de calefacción",
        "Depósito de recuperación (anticongelante)", "Electroventilador", "Aspa de ventilador", "Motor de ventilador",
        "Relevador de ventilador", "Sensor de temperatura del ventilador", "Kit de bomba de agua",
        "Radiador de calefacción (heater core)", "Enfriador de aceite", "Sellador de radiador", "Limpiador de sistema de enfriamiento",
        "Agua destilada",
    ],
    "Eléctrico": [
        "Batería 12V (grupo 24)", "Batería 12V (grupo 35)", "Batería 12V (grupo 65)", "Bornes de batería", "Cables de batería",
        "Regulador de voltaje", "Solenoide de marcha", "Bendix de marcha", "Escobillas de alternador", "Polea de alternador",
        "Caja de fusibles", "Interruptor de encendido (switch)", "Interruptor de luces", "Interruptor de ventana",
        "Motor de elevador de vidrio", "Regulador de vidrio", "Motor de limpiaparabrisas", "Motor de ventilador de calefacción (blower)",
        "Resistencia de blower", "Claxon (bocina)", "Arnés eléctrico", "Palanca de direccionales", "Actuador de seguro eléctrico",
        "Cerradura de puerta", "Pila de control remoto", "Control remoto de alarma",
    ],
    "Aire acondicionado": [
        "Gas refrigerante R134a", "Gas refrigerante R1234yf", "Evaporador", "Válvula de expansión", "Filtro deshidratador",
        "Aceite PAG para compresor", "Clutch (embrague) de compresor", "Mangueras de A/C", "Kit de limpieza de A/C",
        "Sensor de presión de A/C", "Motor de ventilador del condensador", "Tubo de orificio", "Detector de fugas UV",
        "Filtro de cabina con carbón activado",
    ],
    "Escape": [
        "Múltiple de escape", "Tubo flexible de escape", "Soporte de escape (hule)", "Abrazadera de escape", "Junta de escape",
        "Resonador", "Tubo de salida de escape", "Sensor de temperatura de escape",
    ],
    "Llantas": [
        "Llanta 175/70 R13", "Llanta 185/65 R15", "Llanta 195/55 R15", "Llanta 195/65 R15", "Llanta 205/55 R16",
        "Llanta 205/60 R16", "Llanta 215/60 R16", "Llanta 225/65 R17", "Llanta 235/60 R18", "Llanta 265/70 R16 (camioneta)",
        "Sensor TPMS", "Tapón de válvula", "Contrapesos de balanceo", "Parche vulcanizador", "Sellador de llanta",
        "Birlos de rueda", "Tuercas de rueda", "Rin de acero", "Rin de aluminio", "Llanta de refacción", "Taza de rin",
    ],
    "Carrocería": [
        "Pluma limpiaparabrisas delantera", "Pluma limpiaparabrisas trasera", "Brazo de limpiaparabrisas", "Bomba de lavaparabrisas",
        "Espejo retrovisor izquierdo", "Espejo retrovisor derecho", "Cristal de espejo", "Cofre", "Defensa delantera",
        "Defensa trasera", "Salpicadera izquierda", "Salpicadera derecha", "Parrilla", "Moldura", "Manija de puerta",
        "Bisagra de cofre", "Amortiguador de cofre", "Amortiguador de cajuela", "Cristal de puerta", "Goma (sello) de puerta",
        "Tolva (guardalodo)", "Cubre polvo de motor",
    ],
    "Iluminación": [
        "Faro delantero izquierdo", "Faro delantero derecho", "Calavera trasera izquierda", "Calavera trasera derecha",
        "Faro de niebla", "Direccional lateral", "Luz de placa", "Tercera luz de freno", "Foco H4", "Foco H7", "Foco H11",
        "Foco 9005", "Foco 9006", "Foco T10 (cuña)", "Foco 1157", "Kit de focos LED",
    ],
    "Lubricantes y químicos": [
        "Aceite 0W-20 sintético (litro)", "Aceite 5W-20 sintético (litro)", "Aceite 5W-30 sintético (litro)",
        "Aceite 5W-30 sintético (4 litros)", "Aceite 5W-40 sintético (litro)", "Aceite 10W-30 semisintético (litro)",
        "Aceite 10W-40 semisintético (litro)", "Aceite 20W-50 mineral (litro)", "Aceite 15W-40 diésel (litro)",
        "Grasa de chasis (cartucho)", "Grasa de litio", "Grasa multiusos", "Limpiador de carburador", "Limpiador de inyectores (aditivo)",
        "Desengrasante", "Silicón RTV (sellador)", "Pegamento para empaques", "Aditivo de gasolina", "Aditivo de aceite",
        "Sellador de fugas (stop leak)", "Lubricante en aerosol", "Líquido ATF Dexron", "Aceite hidráulico",
    ],
}


def total_refacciones_base() -> int:
    return sum(len(v) for v in REFACCIONES_BASE.values())
