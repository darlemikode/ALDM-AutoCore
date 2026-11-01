// Recorridos de ayuda por módulo (web). Revisados contra el código de cada pantalla (oct 2026).
// S = ilumina un elemento DENTRO del contenido principal (.main) y se brinca si no existe;
// C = explicación centrada, sin señalar nada. Documentación: proyecto → claude/tutoriales_listado.md
const C = (titulo, texto) => ({ centro: true, titulo, texto });
const FUERA_DE_MAIN = [".campana", ".ayuda-flotante", "aside", ".topbar", ".hero-orden"];
const enMain = (s) => (FUERA_DE_MAIN.some((f) => s.startsWith(f)) ? s : `.main ${s}`);
const S = (selectores, titulo, texto) => ({ selectores: [].concat(selectores).map(enMain), titulo, texto });

const ENC = [".page-header-titulo", ".page-header h1"];
const NUEVO = [".btn-nuevo", ".page-header .btn-primary"];
const BUSCAR = [".search-input"];
const VISTA = [".vista-toggle"];
const TABLA = [".ordenes-lista", "table", ".veh-tarjeta", ".emp-card"];

export const T = {
  // ---------- Primeros pasos ----------
  "config-taller": () => [
    C("Datos del taller", "Aquí dejas listo el taller: identidad, ubicación, horario y datos fiscales. Es lo primero que conviene llenar."),
    S([".cfg-logo-row"], "Logo", "Sube o cambia tu logo: aparece en notas de remisión, cotizaciones y en la app de tus clientes."),
    S([".cfg-card:nth-child(1)"], "Identidad y contacto", "Nombre comercial, teléfonos y correos. Salen en el encabezado de tus documentos."),
    S([".cfg-card-fiscal"], "Datos fiscales", "RFC, régimen y código postal: los necesitas para facturar."),
    S([".page-header .subtitle"], "Se guarda solo", "No hay botón de guardar: cada cambio se guarda automáticamente y aquí aparece la confirmación."),
  ],
  "usuarios-alta": () => [
    S(ENC, "Usuarios", "Cuentas de acceso al panel, a la app del taller y a la app de clientes."),
    S(BUSCAR, "Buscar", "Encuentra a alguien por nombre, teléfono o correo."),
    S(NUEVO, "Nuevo usuario", "Da de alta a una persona con su correo y su rol; el rol define lo que puede ver y hacer."),
    C("Contraseña temporal", "Al crear o recuperar un usuario puedes generar una contraseña temporal; la persona la cambia al entrar."),
    C("Tu propia contraseña", "Cámbiala desde tu perfil en el menú lateral. Si alguien olvida la suya, te llega un aviso en la campana."),
  ],
  suscripcion: () => [
    S([".susc-hero"], "Tu paquete", "Aquí ves tu paquete y hasta cuándo está vigente."),
    C("Módulos", "Más abajo ves los módulos incluidos y puedes agregar módulos adicionales a tu paquete."),
    C("Pagar o renovar", "Usa «Pagar / renovar» para pagar en línea; al confirmarse, tu vigencia se actualiza sola y queda en el historial de pagos."),
  ],

  // ---------- Órdenes ----------
  "orden-nueva": () => [
    S([".hero-orden", ".btn-nuevo"], "Nueva orden", "Desde el panel o desde Órdenes de servicio abres una orden en segundos."),
    S(BUSCAR, "Buscar órdenes", "Busca por número de orden, cliente, vehículo o placas."),
    S(VISTA, "Lista o tablero", "Alterna entre la lista y el tablero Kanban por estatus."),
    C("Cliente y vehículo", "Eliges (o das de alta ahí mismo) al cliente y su vehículo. Al crear, entras al detalle para agregar refacciones, mano de obra, fotos y cobrar."),
  ],
  "orden-refacciones": () => [
    S(TABLA, "Abre una orden", "Entra a cualquier orden para trabajar en ella."),
    C("Agregar refacciones", "En el detalle toca «Agregar refacciones»: marca varias a la vez, ajusta cantidades y filtra por categoría o zona del vehículo."),
    C("Mano de obra", "«Agregar mano de obra» ya trae la descripción «Mano de Obra»; solo captura el precio (puedes cambiar el texto)."),
    C("Stock", "Si el vehículo tiene inventario propio se usa su stock y precio real; el sistema avisa si falta."),
  ],
  "orden-editar": () => [
    C("Editar precios y cantidades", "En el detalle de la orden toca el precio o la cantidad, escribe y presiona Enter para guardar."),
    C("Quitar una refacción", "Usa el botón de quitar al final de la fila; el total y el saldo se recalculan solos."),
  ],
  "orden-fechas": () => [
    C("Fechas y datos del vehículo", "En el encabezado de la orden puedes editar la entrada, la salida, el kilometraje y otros datos del vehículo."),
    C("Salida", "La fecha de salida se llena al finalizar la orden, pero puedes ajustarla. Los cambios de fecha quedan registrados en Auditoría."),
  ],
  "orden-abonos": () => [
    C("Abonos y saldo", "Registra los pagos del cliente conforme llegan (efectivo, tarjeta, transferencia)."),
    C("Pago mixto", "Puedes partir un abono en varias formas de pago."),
    C("Saldo", "El saldo pendiente se ve en la orden y en la lista. Si te equivocas, borra el abono y regístralo de nuevo."),
  ],
  "orden-estatus": () => [
    C("Estatus", "La orden avanza por etapas. El cliente ve el avance en su app o en el enlace de seguimiento con QR."),
    C("Inspección digital", "Registra fotos y marca daños sobre el auto en 3D al recibirlo; queda como evidencia."),
    C("Chat", "El chat de la orden te comunica con el cliente sin salir del sistema."),
  ],
  "orden-finalizar": () => [
    C("Finalizar y cobrar", "Al terminar el trabajo, toca «Finalizar»: se muestra el total, registras el cobro y se calcula el cambio."),
    C("Aviso al cliente", "Puedes avisarle por WhatsApp o por la app que su vehículo está listo."),
    C("Nota y comisión", "Se genera la nota de remisión y se estima la comisión de cada empleado."),
  ],
  "orden-nota": () => [
    C("Nota de remisión", "Vista previa con tus datos, el detalle y el total."),
    C("Imprimir o enviar", "Imprímela, descárgala o envíala por WhatsApp al cliente."),
  ],

  // ---------- Cotizaciones y citas ----------
  cotizaciones: () => [
    S(ENC, "Cotizaciones", "Presupuestos para cuando solo preguntan cuánto costaría algo. El cliente y el vehículo son opcionales."),
    S(NUEVO, "Nueva cotización", "Agrega refacciones y mano de obra; si no hay cliente registrado, captura marca, modelo y placas solo para esa cotización."),
    C("Convertir en orden", "Cuando el cliente acepta, conviertes la cotización en orden de servicio."),
  ],
  citas: () => [
    S(ENC, "Citas solicitadas", "Lo que tus clientes piden desde su app: tú decides si se confirma."),
    S(VISTA, "Lista o calendario", "Alterna entre la lista y el calendario; en el calendario toca un día para agendar una cita."),
    C("Generar la orden", "Al abrir una cita puedes generar la orden de servicio directo. El calendario marca los días que el taller no atiende."),
  ],

  // ---------- Clientes y vehículos ----------
  "cliente-alta": () => [
    S(ENC, "Clientes", "Tu cartera de clientes con sus vehículos."),
    S(BUSCAR, "Buscar", "Por nombre, cuenta, empresa, teléfono o correo."),
    S(NUEVO, "Nuevo cliente", "Los campos obligatorios van marcados con *. Al escribir el código postal se llenan colonia, ciudad y estado."),
    C("Acciones por cliente", "En cada cliente: ver sus vehículos, crear una nueva orden, escribirle por WhatsApp, invitarlo a la app, editar o eliminar."),
  ],
  "vehiculo-alta": () => [
    S(ENC, "Vehículos", "Todos los vehículos registrados, con su dueño."),
    S(BUSCAR, "Buscar", "Por placa, marca, modelo, cuenta o cliente."),
    S(VISTA, "Vista", "Lista o tarjetas; también puedes agrupar por cliente."),
    S(NUEVO, "Nuevo vehículo", "Elige marca (con su logo) y modelo, y captura kilometraje y placas. Las marcas y modelos los administra ALDM; si falta alguno, pídelo a soporte."),
    C("Fotos", "Cada vehículo guarda sus fotos y su historial de órdenes."),
  ],
  "cliente-app": () => [
    S(TABLA, "Invitar al cliente", "En la fila o tarjeta del cliente está «Invitar a la app»."),
    C("Código de activación", "Genera su código y compártelo por WhatsApp; con él activa su cuenta y ve sus órdenes, pide citas y chatea con el taller."),
  ],

  // ---------- Refacciones e inventario ----------
  refacciones: () => [
    S(ENC, "Refacciones", "Inventario de partes del taller."),
    S(BUSCAR, "Buscar", "Por nombre o número de parte."),
    S(VISTA, "Vista", "Lista o cuadros."),
    S(NUEVO, "Nueva refacción", "Alta rápida de una pieza. El sistema avisa si ya existe una parecida para evitar duplicados."),
    C("Editar todo", "Con «Editar todo» cambias varios renglones a la vez directamente en la tabla."),
  ],
  inventario: () => [
    S(ENC, "Inventario", "Existencias, ubicación, códigos de barras, etiquetas y venta de mostrador."),
    S(BUSCAR, "Buscar", "Por refacción, marca, código de barras o ubicación."),
    S(VISTA, "Vista", "Lista o cuadros."),
    S(NUEVO, "Nuevo registro", "Registra existencias con ubicación en el almacén, código de barras y costo de compra."),
    C("Etiquetas y fotos", "Imprime etiquetas con código de barras y agrega fotos a cada registro."),
  ],
  proveedores: () => [
    S(ENC, "Proveedores", "Contactos, lo que surten y lo que les debes."),
    S(NUEVO, "Nuevo proveedor", "Registra sus datos y teléfono."),
    C("Deudas y pagos", "Entra al proveedor para ver sus compras, su deuda pendiente y registrar pagos."),
  ],
  herramientas: () => [
    S(ENC, "Herramientas", "Inventario de herramientas del taller."),
    S(NUEVO, "Nueva herramienta", "Registra marca, estado y fotos de cada herramienta."),
  ],

  // ---------- Personal ----------
  empleados: () => [
    S(ENC, "Empleados", "Catálogo del personal del taller. Solo el Administrador General lo administra."),
    C("Confirma tu identidad", "Por seguridad, al entrar te pide tu contraseña antes de mostrar sueldos y datos del personal."),
    S(NUEVO, "Nuevo empleado", "Datos, puesto, sueldo y si puede ser responsable de órdenes."),
    S([".emp-card"], "Tarjeta", "Toca cualquier tarjeta para editar al empleado; el botón verde abre su WhatsApp."),
  ],
  nomina: () => [
    S(ENC, "Nómina", "Qué toca pagar, a quién y cuánto."),
    C("Primer uso", "La primera vez te pregunta cada cuándo pagas a tus empleados (semanal, quincenal, mensual) y crea el periodo."),
    S(NUEVO, "Nuevo periodo", "Crea un periodo; con «Generar varios» creas de una vez los del mes, trimestre o año."),
    C("Por empleado", "Entra a un periodo para ver el desglose de cada quien (sueldo, comisiones, descuentos), pagarlo y generar su recibo."),
  ],
  comisiones: () => [
    S(ENC, "Comisiones", "Porcentaje por tipo de pago; se usa para mostrar la comisión estimada en cada nota o recibo finalizado."),
    S([".panel .field"], "Porcentajes", "Captura el porcentaje de cada tipo de pago y toca «Guardar»."),
  ],
  roles: () => [
    S(ENC, "Roles y permisos", "Administrador General, Jefe de Taller, Asesor de Servicio, Técnico y los roles adicionales que necesites."),
    S(NUEVO, "Nuevo rol", "Crea un rol y marca qué módulos y permisos tiene."),
    S(BUSCAR, "Buscar permiso", "Busca un módulo o permiso para encontrarlo rápido."),
    C("Asignación", "En Usuarios asignas el rol a cada persona. Los cambios aplican la próxima vez que inicie sesión."),
  ],

  // ---------- Administración ----------
  facturacion: () => [
    S(ENC, "Facturación CFDI", "Facturas CFDI 4.0 de ingreso."),
    S(BUSCAR, "Buscar", "Por receptor, RFC, UUID o folio."),
    C("Facturar una orden", "Elige una orden finalizada: los datos del receptor y los conceptos vienen de la orden. Revisa y timbra."),
    C("Configuración fiscal", "En la pestaña de configuración capturas emisor, proveedor de timbrado (PAC) y serie/folio por defecto. También puedes cancelar facturas."),
  ],
  catalogos: () => [
    C("Catálogos generales", "Países, estados, ciudades, colores y marcas y modelos de vehículos y refacciones los administra ALDM."),
    C("Para los talleres", "Los usas al dar de alta clientes, vehículos y refacciones. Si falta una marca o modelo, pídelo a soporte."),
  ],
  promociones: () => [
    S(ENC, "Promociones", "Aparecen en el inicio de la app de tus clientes."),
    S(NUEVO, "Nueva promoción", "Título, descripción, vigencia y, si quieres, imagen."),
    C("Activar o desactivar", "Toca una promoción para activarla o desactivarla manualmente sin borrarla."),
  ],
  integraciones: () => [
    S(ENC, "Integraciones", "Conecta el agente de WhatsApp (n8n) con tu taller."),
    S([".integ-card"], "Llaves de API", "Ponle un nombre (por ejemplo «n8n WhatsApp») y genera la llave. El agente solo ve los datos de este taller."),
    C("Copia tu llave", "La llave se muestra una sola vez al crearla; cópiala y guárdala. No la compartas con nadie."),
  ],
  auditoria: () => [
    S(ENC, "Auditoría", "Cambios de fechas, cierres, cancelaciones y citas retroactivas. La bitácora no se puede editar ni borrar."),
    S([".aud-filtros"], "Filtros", "Filtra los movimientos."),
    S([".aud-tabla"], "Movimientos", "Quién hizo qué y cuándo."),
    S([".aud-alerta"], "Alertas", "Marca movimientos que conviene revisar."),
  ],
  errores: () => [
    S(ENC, "Errores del sistema", "Bitácora de errores de tu taller."),
    S([".panel input"], "Buscar", "Pega el código que ve el usuario (ERR-…) o busca por ruta o mensaje."),
  ],
  "mi-dashboard": () => [
    S([".kpi-grid"], "Mi dashboard", "Tus indicadores personales."),
    C("Tus servicios", "Abajo ves tus servicios recientes."),
  ],

  // ---------- Consulta ----------
  panel: () => [
    S([".kpi-grid .kpi-card"], "Indicadores", "Resumen del taller en tiempo real. Toca una tarjeta para ver el detalle."),
    S([".hero-orden"], "Nueva orden", "Acceso directo para abrir una orden de servicio."),
    C("Gráficas", "Más abajo: órdenes por mes, dinero que entró por mes, estado de las órdenes y refacciones que se están acabando."),
    S([".campana-flotante"], "Avisos", "Mensajes de clientes, citas nuevas y solicitudes de contraseña."),
  ],
  asistente: () => [
    S(ENC, "Asistente", "Consultas rápidas de uso interno: clientes, servicios por estatus y reportes."),
    C("Cómo usarlo", "Escribe tu pregunta (por ejemplo «órdenes en proceso») y responde con los datos de tu taller. «Limpiar» reinicia la conversación."),
    C("Manuales", "Puedes subir manuales en PDF y consultarlos; también adjuntar una imagen a tu pregunta."),
  ],
  busqueda: () => [
    S(BUSCAR, "Búsqueda", "Busca sin importar acentos ni mayúsculas, por varios campos a la vez."),
    S([".cat-chips"], "Filtros", "Los chips filtran por categoría o estatus y se combinan con la búsqueda."),
    C("Atajos de teclado", "Actívalos y consulta la lista completa en Configuración → Preferencias."),
  ],
};
