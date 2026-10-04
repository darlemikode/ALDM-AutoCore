"""Códigos OBD-II adicionales. Formato: 'COD|significado|causa1;causa2|revisión1;revisión2'."""
_RAW = """
P0010|Actuador VVT admisión (banco 1) – falla de circuito|Válvula OCV/VVT;Aceite sucio;Cableado|Revisar conector de la válvula;Cambiar aceite y filtro
P0012|Árbol de levas (admisión) retrasado|Aceite sucio;Válvula VVT;Cadena estirada|Cambiar aceite;Revisar válvula VVT y distribución
P0013|Actuador VVT escape (banco 1) – falla de circuito|Válvula OCV;Cableado|Revisar conector;Probar válvula
P0014|Árbol de levas (escape) adelantado|Aceite sucio;Válvula VVT|Cambiar aceite;Revisar válvula VVT
P0017|Correlación cigüeñal–árbol de levas B1 (escape)|Distribución desfasada;Sensor CMP|Verificar marcas de distribución;Revisar sensores
P0030|Calefactor sensor O2 B1S1 – falla de circuito|Sensor O2;Fusible;Cableado|Revisar fusible;Cambiar sensor
P0036|Calefactor sensor O2 B1S2 – falla de circuito|Sensor O2;Fusible|Revisar fusible y conector;Cambiar sensor
P0053|Resistencia del calefactor O2 B1S1 alta|Sensor O2;Cableado|Medir resistencia;Cambiar sensor
P0068|Presión MAP/MAF vs. acelerador incoherente|Fuga de vacío;MAP/MAF;Cuerpo de aceleración|Buscar fugas;Limpiar cuerpo de aceleración
P0089|Regulador de presión de combustible – rendimiento|Regulador;Filtro tapado;Bomba|Medir presión;Cambiar filtro
P0100|Falla del circuito del sensor MAF|MAF;Cableado|Revisar conector;Limpiar o cambiar MAF
P0103|Sensor MAF señal alta|MAF sucio o dañado;Cableado|Limpiar MAF;Revisar conector
P0105|Falla del circuito del sensor MAP|Sensor MAP;Manguera de vacío|Revisar manguera;Cambiar sensor
P0106|Sensor MAP fuera de rango|Fuga de vacío;Sensor MAP|Buscar fugas;Probar sensor
P0107|Sensor MAP señal baja|Sensor MAP;Cableado|Revisar conector;Cambiar sensor
P0108|Sensor MAP señal alta|Sensor MAP;Manguera obstruida|Revisar manguera;Cambiar sensor
P0112|Sensor IAT señal baja|Sensor IAT;Corto a tierra|Revisar cableado;Cambiar sensor
P0115|Falla del circuito del sensor de temperatura (ECT)|Sensor ECT;Cableado|Revisar conector;Cambiar sensor
P0116|Sensor ECT fuera de rango|Termostato;Sensor ECT;Refrigerante bajo|Revisar nivel de refrigerante;Cambiar termostato
P0117|Sensor ECT señal baja|Sensor ECT;Corto a tierra|Revisar cableado;Cambiar sensor
P0118|Sensor ECT señal alta|Sensor ECT;Circuito abierto|Revisar conector;Cambiar sensor
P0119|Sensor ECT intermitente|Sensor ECT;Conector flojo|Revisar conector;Cambiar sensor
P0120|Falla del circuito TPS/pedal A|Sensor TPS;Cableado|Revisar conector;Cambiar sensor
P0122|Sensor TPS señal baja|Sensor TPS;Cableado|Revisar conector;Cambiar sensor
P0123|Sensor TPS señal alta|Sensor TPS;Corto a voltaje|Revisar cableado;Cambiar sensor
P0125|Temperatura insuficiente para lazo cerrado|Termostato abierto;Sensor ECT|Cambiar termostato;Probar sensor
P0130|Falla del circuito sensor O2 B1S1|Sensor O2;Cableado|Revisar conector;Cambiar sensor
P0132|Sensor O2 B1S1 voltaje alto|Sensor O2;Mezcla rica|Revisar mezcla;Cambiar sensor
P0133|Sensor O2 B1S1 respuesta lenta|Sensor O2 envejecido;Fuga de escape|Cambiar sensor;Revisar fugas
P0134|Sensor O2 B1S1 sin actividad|Sensor O2;Cableado|Revisar conector;Cambiar sensor
P0136|Falla del circuito sensor O2 B1S2|Sensor O2;Cableado|Revisar conector;Cambiar sensor
P0137|Sensor O2 B1S2 voltaje bajo|Sensor O2;Fuga de escape|Revisar fugas;Cambiar sensor
P0138|Sensor O2 B1S2 voltaje alto|Sensor O2;Corto a voltaje|Revisar cableado;Cambiar sensor
P0140|Sensor O2 B1S2 sin actividad|Sensor O2;Cableado|Revisar conector;Cambiar sensor
P0150|Falla del circuito sensor O2 B2S1|Sensor O2;Cableado|Revisar conector;Cambiar sensor
P0155|Calefactor sensor O2 B2S1|Sensor O2;Fusible|Revisar fusible;Cambiar sensor
P0161|Calefactor sensor O2 B2S2|Sensor O2;Fusible|Revisar fusible;Cambiar sensor
P0170|Falla de ajuste de combustible (banco 1)|Inyectores;MAF;Fuga de vacío|Revisar fugas;Limpiar MAF
P0173|Falla de ajuste de combustible (banco 2)|Inyectores;MAF;Fuga de vacío|Revisar fugas;Limpiar MAF
P0175|Mezcla rica (banco 2)|Inyectores con goteo;MAF;Filtro de aire|Revisar filtro de aire;Probar inyectores
P0190|Sensor de presión del riel – falla de circuito|Sensor de riel;Cableado|Revisar conector;Cambiar sensor
P0200|Falla del circuito de inyectores|Inyector;Cableado;ECM|Revisar conectores;Medir resistencia de inyectores
P0201|Inyector cilindro 1 – falla de circuito|Inyector;Conector|Medir resistencia;Cambiar inyector
P0202|Inyector cilindro 2 – falla de circuito|Inyector;Conector|Medir resistencia;Cambiar inyector
P0203|Inyector cilindro 3 – falla de circuito|Inyector;Conector|Medir resistencia;Cambiar inyector
P0204|Inyector cilindro 4 – falla de circuito|Inyector;Conector|Medir resistencia;Cambiar inyector
P0220|Falla del circuito TPS/pedal B|Sensor TPS;Cableado|Revisar conector;Cambiar sensor
P0230|Falla del circuito de la bomba de combustible|Relevador;Fusible;Bomba|Revisar fusible y relevador;Medir voltaje en bomba
P0234|Sobrepresión del turbo|Wastegate;Solenoide de turbo;Fuga|Revisar actuador;Revisar mangueras
P0299|Turbo con presión insuficiente|Fuga en mangueras;Wastegate;Turbo desgastado|Revisar mangueras e intercooler;Probar actuador
P0303|Falla de encendido cilindro 3|Bujía o bobina;Inyector|Intercambiar bobina;Revisar bujía
P0305|Falla de encendido cilindro 5|Bujía o bobina;Inyector|Intercambiar bobina;Revisar bujía
P0306|Falla de encendido cilindro 6|Bujía o bobina;Inyector|Intercambiar bobina;Revisar bujía
P0325|Sensor de detonación (knock) – falla de circuito|Sensor KS;Cableado|Revisar conector;Cambiar sensor
P0336|Sensor CKP fuera de rango|Sensor CKP;Rueda dentada|Revisar sensor;Revisar rueda
P0341|Sensor CMP fuera de rango|Sensor CMP;Distribución|Revisar sensor;Verificar distribución
P0352|Bobina de encendido B – falla|Bobina;Conector|Cambiar bobina
P0353|Bobina de encendido C – falla|Bobina;Conector|Cambiar bobina
P0354|Bobina de encendido D – falla|Bobina;Conector|Cambiar bobina
P0403|Circuito EGR – falla|Solenoide EGR;Cableado|Revisar conector;Cambiar válvula
P0404|EGR fuera de rango|Válvula EGR carbonizada;Sensor de posición|Limpiar EGR
P0405|Sensor posición EGR señal baja|Sensor EGR;Cableado|Revisar conector;Cambiar válvula
P0410|Sistema de aire secundario – falla|Bomba de aire;Válvula;Mangueras|Revisar mangueras y válvula
P0441|Flujo de purga EVAP incorrecto|Válvula de purga;Mangueras|Probar válvula de purga
P0446|Circuito de ventilación EVAP|Válvula de ventilación;Manguera tapada|Revisar válvula y mangueras
P0456|Fuga muy pequeña en EVAP|Tapón;Manguera|Cambiar tapón;Prueba de humo
P0480|Circuito ventilador de enfriamiento 1|Relevador;Fusible;Ventilador|Revisar relevador y fusible
P0481|Circuito ventilador de enfriamiento 2|Relevador;Fusible;Ventilador|Revisar relevador y fusible
P0501|Sensor VSS fuera de rango|Sensor VSS;Cableado|Revisar sensor
P0506|Ralentí más bajo de lo esperado|Cuerpo de aceleración sucio;Fuga de aire|Limpiar cuerpo;Reaprender ralentí
P0508|Circuito de control de ralentí bajo|Válvula IAC;Cableado|Revisar válvula IAC
P0509|Circuito de control de ralentí alto|Válvula IAC;Cableado|Revisar válvula IAC
P0510|Interruptor de posición de acelerador cerrado|Interruptor;Cuerpo de aceleración|Revisar interruptor
P0520|Sensor de presión de aceite – circuito|Sensor;Cableado;Nivel de aceite|Revisar nivel de aceite;Probar sensor
P0521|Presión de aceite fuera de rango|Aceite bajo;Bomba;Sensor|Medir presión real;Revisar nivel
P0524|Presión de aceite muy baja|Aceite bajo;Bomba de aceite;Desgaste|Detener el motor;Medir presión real
P0560|Voltaje del sistema – falla|Batería;Alternador|Probar batería y alternador
P0563|Voltaje del sistema alto|Regulador del alternador|Medir carga del alternador
P0571|Interruptor de freno – circuito|Interruptor de luz de freno;Cableado|Revisar interruptor
P0601|Memoria del ECM – error|ECM;Batería baja|Revisar voltaje;Reprogramar o reemplazar ECM
P0605|Error de ROM del ECM|ECM|Reprogramar o reemplazar ECM
P0606|Falla del procesador del ECM|ECM;Alimentación|Revisar alimentación y tierras;Reemplazar ECM
P0620|Circuito del generador/alternador|Alternador;Cableado|Probar alternador
P0627|Circuito de bomba de combustible A|Relevador;Cableado|Revisar relevador
P0650|Luz MIL – falla de circuito|Foco;Cableado|Revisar tablero
P0700|Falla del sistema de control de transmisión|TCM;Solenoides;ATF|Leer códigos del TCM
P0705|Sensor de rango de transmisión|Interruptor de rango;Ajuste|Revisar/ajustar interruptor
P0710|Sensor de temperatura de ATF – circuito|Sensor;Cableado|Revisar conector
P0716|Velocidad de entrada de transmisión fuera de rango|Sensor;ATF contaminado|Revisar ATF y sensor
P0720|Sensor de velocidad de salida – falla|Sensor;Cableado|Revisar sensor
P0730|Relación de engranes incorrecta|ATF bajo o degradado;Solenoides;Embragues|Revisar ATF;Diagnóstico de transmisión
P0731|Relación incorrecta 1ª velocidad|ATF;Solenoide;Embragues|Revisar ATF;Diagnóstico de transmisión
P0732|Relación incorrecta 2ª velocidad|ATF;Solenoide|Revisar ATF;Diagnóstico de transmisión
P0733|Relación incorrecta 3ª velocidad|ATF;Solenoide|Revisar ATF;Diagnóstico de transmisión
P0740|Circuito del embrague del convertidor|Solenoide TCC;Cableado|Revisar solenoide
P0750|Solenoide de cambio A – falla|Solenoide;Cableado|Revisar solenoide
P0755|Solenoide de cambio B – falla|Solenoide;Cableado|Revisar solenoide
P0841|Sensor de presión ATF fuera de rango|Sensor;ATF|Revisar ATF
P1000|Sistema OBD no completó ciclo de prueba|Batería desconectada recientemente|Completar ciclo de manejo
P1101|Sensor MAF fuera de rango (Ford)|MAF;Fuga de aire|Limpiar MAF;Buscar fugas
P1131|Mezcla pobre B1 (Ford)|Fuga de vacío;MAF|Buscar fugas
P1450|Vacío del tanque de combustible excesivo|Válvula de ventilación EVAP|Revisar válvula de ventilación
P2004|Control de admisión atorado abierto|Actuador de múltiple;Carbonilla|Limpiar múltiple
P2101|Control del motor del acelerador – rendimiento|Cuerpo de aceleración;Cableado|Limpiar y reaprender
P2106|Control del acelerador – fuerza limitada|Cuerpo de aceleración|Limpiar y reaprender;Revisar conector
P2110|Control del acelerador – potencia limitada|Cuerpo de aceleración|Limpiar y reaprender
P2119|Cuerpo de aceleración – rango de operación|Cuerpo de aceleración sucio|Limpiar y reaprender
P2135|Sensores TPS A/B no correlacionan|Cuerpo de aceleración;Conector|Revisar conector;Cambiar cuerpo
P2138|Sensores de pedal D/E no correlacionan|Pedal de acelerador;Conector|Revisar pedal y conector
P2187|Sistema muy pobre en ralentí B1|Fuga de vacío;Inyectores|Buscar fugas
P2270|Sensor O2 B1S2 atorado en pobre|Sensor O2;Fuga de escape|Revisar fugas;Cambiar sensor
P2302|Bobina de encendido A – cortocircuito|Bobina|Cambiar bobina
P2412|Sensor EVAP – falla|Sensor;Manguera|Revisar mangueras
P2440|Aire secundario atorado abierto|Válvula|Revisar válvula
P2610|Temporizador del ECM – falla|ECM|Reemplazar ECM
C0035|Sensor de velocidad rueda delantera izquierda|Sensor ABS;Cableado;Balero|Revisar sensor y conector;Limpiar anillo reluctor
C0040|Sensor de velocidad rueda delantera derecha|Sensor ABS;Cableado;Balero|Revisar sensor y conector;Limpiar anillo reluctor
C0045|Sensor de velocidad rueda trasera izquierda|Sensor ABS;Cableado|Revisar sensor y conector
C0050|Sensor de velocidad rueda trasera derecha|Sensor ABS;Cableado|Revisar sensor y conector
C0110|Bomba del ABS – falla de circuito|Bomba;Fusible;Relevador|Revisar fusible y relevador
C0121|Válvula del ABS – falla|Módulo ABS;Cableado|Diagnóstico del módulo
C0265|Relevador del ABS – falla|Relevador;Fusible|Revisar fusible y relevador
B1000|Falla interna del módulo (airbag/carrocería)|Módulo;Alimentación|Revisar voltaje y conectores
B0001|Circuito del airbag del conductor|Resorte de reloj;Conector;Inflador|Revisar conectores (con batería desconectada)
B0020|Circuito del airbag del pasajero|Conector;Inflador|Revisar conectores (con batería desconectada)
U0001|Falla en la red CAN de alta velocidad|Cableado CAN;Módulo;Resistencias|Medir resistencia entre CAN H y CAN L (≈60 Ω)
U0100|Pérdida de comunicación con el ECM|ECM sin alimentación;Red CAN|Revisar fusibles, tierras y alimentación del ECM
U0101|Pérdida de comunicación con el TCM|TCM;Red CAN|Revisar alimentación y red
U0121|Pérdida de comunicación con el módulo ABS|Módulo ABS;Red CAN|Revisar alimentación y red
U0140|Pérdida de comunicación con el módulo de carrocería|BCM;Red CAN|Revisar alimentación y red
U0155|Pérdida de comunicación con el tablero|Tablero;Red CAN|Revisar conectores y red
"""
def cargar():
    out = {}
    for linea in _RAW.strip().splitlines():
        cod, sig, causas, rev = linea.split("|")
        out[cod] = (sig, causas.split(";"), rev.split(";"))
    return out
