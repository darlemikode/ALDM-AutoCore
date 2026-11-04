// Recorridos de ayuda por módulo (app del taller). Mismo contenido que la ayuda web,
// pero con los gestos y botones de la app. Cada paso es una explicación en pantalla;
// los que traen `objetivo` iluminan un elemento y se brincan solos si no está visible.
const C = (titulo, texto) => ({ centro: true, titulo, texto });
const O = (objetivo, titulo, texto) => ({ objetivo, titulo, texto });

export const T = {
  // ---------- Primeros pasos ----------
  "config-taller": () => [
    C("Datos del taller", "Aquí dejas listo el taller: nombre, ubicación, teléfonos, correos y datos fiscales. Es lo primero que conviene llenar."),
    C("Identidad y contacto", "El nombre, teléfonos y correos salen en el membrete de tus notas, cotizaciones y recibos."),
    C("Datos fiscales", "RFC, régimen y código postal: los necesitas para facturar."),
    C("Se guarda solo", "No hay botón de guardar: cada cambio se guarda automáticamente al salir del campo."),
  ],
  "usuarios-alta": () => [
    C("Usuarios", "Cuentas de acceso a la app del taller y al panel web. Usa el buscador para encontrar a alguien por nombre, teléfono o correo."),
    C("Nuevo usuario", "Toca + para dar de alta a una persona con su correo y su rol; el rol define lo que puede ver y hacer."),
    C("Contraseña temporal", "Al crear o recuperar un usuario puedes generar una contraseña temporal; la persona la cambia al entrar."),
    C("Tu propia contraseña", "Cámbiala desde el menú ☰ → Cambiar contraseña. Si alguien olvida la suya, te llega un aviso en la campana."),
  ],
  suscripcion: () => [
    C("Suscripción", "Tu paquete y su vigencia se administran desde el panel web, en Configuración → Suscripción."),
    C("Pagar o renovar", "Ahí pagas en línea; al confirmarse, la vigencia se actualiza sola y queda en el historial de pagos."),
    C("Módulos adicionales", "También puedes agregar módulos extra a tu paquete."),
  ],

  // ---------- Órdenes ----------
  "orden-nueva": () => [
    O("nueva-orden", "Nueva orden", "El botón grande de la barra abre una orden en segundos, desde cualquier pantalla."),
    C("Cliente y vehículo", "Eliges (o das de alta ahí mismo) al cliente y su vehículo. Al crear, entras al detalle para agregar refacciones, mano de obra, fotos y cobrar."),
    C("Buscar y filtrar", "En la lista de órdenes usa el buscador (número, cliente, vehículo o placas) y los filtros por estatus."),
  ],
  "orden-refacciones": () => [
    C("Agregar refacciones", "En el detalle de la orden toca «Agregar»: elige varias a la vez del catálogo (tarjetas con foto), ajusta cantidades y filtra por categoría."),
    C("Por voz", "Toca el micrófono y di las refacciones («filtro de aceite y balatas»): se agregan todas; si repites una, solo se cuenta una vez."),
    C("Paquetes", "En la pestaña Paquetes aplicas de golpe un conjunto de refacciones y mano de obra, como «Afinación mayor». También puedes crear uno nuevo eligiendo refacciones."),
    C("Mano de obra", "La mano de obra ya trae la descripción «Mano de Obra»; solo captura el precio (puedes cambiar el texto)."),
    C("Stock", "Si hay inventario propio se usa su stock y precio real; la app avisa si falta."),
  ],
  "orden-editar": () => [
    C("Editar cantidades", "Cada refacción muestra su cantidad en una pastilla con «PZAS»: tócala y escribe la cantidad."),
    C("Editar precios", "Toca el precio para cambiarlo. El subtotal, el total y el saldo se recalculan solos."),
    C("Quitar una refacción", "Desliza la tarjeta hacia un lado para eliminarla."),
  ],
  "orden-fechas": () => [
    C("Fechas y datos del vehículo", "En la pestaña Datos de la orden editas la entrada, la salida, el kilometraje y otros datos del vehículo."),
    C("Tipo de orden", "Es un texto libre (por ejemplo «Afinación» o «Frenos»); se guarda al salir del campo."),
    C("Salida", "La fecha de salida se llena al finalizar la orden, pero puedes ajustarla. Los cambios de fecha quedan en Auditoría."),
  ],
  "orden-abonos": () => [
    C("Abonos y saldo", "Registra los pagos del cliente conforme llegan (efectivo, tarjeta, transferencia)."),
    C("Pago mixto", "Puedes partir un abono en varias formas de pago."),
    C("Saldo", "El saldo pendiente se ve en la orden y en la lista. Si te equivocas, borra el abono y regístralo de nuevo."),
  ],
  "orden-estatus": () => [
    C("Estatus", "La orden avanza por etapas. El cliente ve el avance en su app o en el enlace de seguimiento con QR."),
    C("Inspección digital", "Registra fotos y marca daños sobre el auto en 3D al recibirlo. Hay un buscador para encontrar rápido un punto de la inspección."),
    C("Chat", "El chat de la orden te comunica con el cliente sin salir de la app."),
  ],
  "orden-finalizar": () => [
    C("Finalizar y cobrar", "Al terminar el trabajo, toca «Finalizar»: se muestra el total, registras el cobro y se calcula el cambio."),
    C("Aviso al cliente", "Puedes avisarle por WhatsApp o por la app que su vehículo está listo."),
    C("Nota y comisión", "Se genera la nota de remisión y se estima la comisión de cada empleado."),
  ],
  "orden-nota": () => [
    C("Nota de remisión", "Vista previa con tus datos, el detalle y el total."),
    C("Enviar por WhatsApp", "Compártela como PDF directo a WhatsApp o a cualquier otra app desde el botón de compartir."),
  ],

  // ---------- Cotizaciones y citas ----------
  cotizaciones: () => [
    C("Cotizaciones", "Presupuestos para cuando solo preguntan cuánto costaría algo. El cliente y el vehículo son opcionales."),
    C("Nueva cotización", "Toca + y arma el presupuesto: mano de obra y refacciones, con IVA opcional. Puedes cambiar su nombre y la fecha de servicio."),
    C("Cliente y vehículo", "Una tarjeta compacta arriba te deja elegir o cambiar el cliente y su vehículo."),
    C("Enviar por WhatsApp", "El botón verde manda la cotización en PDF por WhatsApp, y desde ahí puedes convertirla en orden cuando el cliente acepta."),
  ],
  citas: () => [
    C("Citas solicitadas", "Lo que tus clientes piden desde su app: tú decides si se confirma."),
    C("Confirmar", "Abre una cita para confirmarla, reprogramarla o cancelarla."),
    C("Generar la orden", "Al abrir una cita puedes generar la orden de servicio directo."),
  ],

  // ---------- Clientes y vehículos ----------
  "cliente-alta": () => [
    C("Clientes", "Tu cartera de clientes con sus vehículos. Busca por nombre, cuenta, empresa, teléfono o correo."),
    C("Nuevo cliente", "Toca + para dar de alta. Los campos obligatorios van marcados con *; al escribir el código postal se llenan colonia, ciudad y estado."),
    C("Acciones por cliente", "Al abrir un cliente: ver sus vehículos, crear una nueva orden, escribirle por WhatsApp, invitarlo a la app, editar o eliminar."),
  ],
  "vehiculo-alta": () => [
    C("Vehículos", "Todos los vehículos registrados, con su dueño. Busca por placa, marca, modelo o cliente."),
    C("Nuevo vehículo", "Toca + y elige marca (con su logo) y modelo; captura kilometraje y placas. Si falta una marca o modelo, pídelo a soporte."),
    C("Fotos e historial", "Cada vehículo guarda sus fotos y su historial de órdenes."),
  ],
  "cliente-app": () => [
    C("Invitar al cliente", "Abre al cliente y toca «Invitar a la app»."),
    C("Código de activación", "Genera su código y compártelo por WhatsApp; con él activa su cuenta y ve sus órdenes, pide citas y chatea con el taller."),
  ],

  // ---------- Refacciones e inventario ----------
  refacciones: () => [
    C("Refacciones", "Catálogo de partes del taller. Busca por nombre o número de parte."),
    C("Nueva refacción", "Toca + para el alta rápida. La app avisa si ya existe una parecida para evitar duplicados."),
    C("Categorías", "Filtra por categoría para encontrar las piezas más rápido."),
  ],
  inventario: () => [
    C("Inventario", "Existencias, ubicación, códigos de barras y proveedor de cada refacción."),
    C("Nuevo registro", "Toca + para registrar existencias con su ubicación en el almacén y costo de compra."),
    C("Stock con color", "Los colores del stock avisan cuándo una pieza se está acabando."),
  ],
  proveedores: () => [
    C("Proveedores", "Contactos, lo que surten y lo que les debes."),
    C("Nuevo proveedor", "Toca + y registra sus datos y teléfono."),
    C("Deudas y pagos", "Abre al proveedor para ver sus compras, su deuda pendiente y registrar pagos."),
  ],
  herramientas: () => [
    C("Herramientas", "Inventario de herramientas del taller."),
    C("Nueva herramienta", "Toca + para registrar marca, estado y fotos."),
  ],

  // ---------- Personal ----------
  empleados: () => [
    C("Empleados", "Catálogo del personal del taller. Solo quien tiene el permiso de ver sueldos los ve."),
    C("Nuevo empleado", "Toca + y captura datos y puesto. Elige cada cuándo se le paga (semanal, quincenal o mensual) y captura el sueldo de ese periodo: el mes se reparte en 4 pagos semanales, 2 quincenales o 1 mensual."),
    C("Responsable de órdenes", "Marca si puede ser responsable de órdenes; con eso se le calculan comisiones."),
  ],
  nomina: () => [
    C("Nómina", "Qué toca pagar, a quién y cuánto. Arriba ves los periodos abiertos, lo que falta pagar y lo ya pagado."),
    C("Nuevo periodo", "Toca + para crear un periodo semanal, quincenal o mensual; puede repetirse solo cada periodo."),
    C("Por empleado", "Entra a un periodo para ver el desglose de cada quien: sueldo, comisiones, descuentos y total a pagar."),
    C("Ajustar y pagar", "«Ajustar» cambia el sueldo de ese recibo, faltas, horas extra, bonos y descuentos; «Pagar» lo marca como pagado."),
    C("Recibo por WhatsApp", "«Enviar recibo» manda el recibo en PDF por WhatsApp. Para eliminar o corregir un periodo se pide un motivo, que queda en Auditoría."),
  ],
  comisiones: () => [
    C("Comisiones", "Porcentaje por tipo de pago; se usa para mostrar la comisión estimada en cada orden finalizada."),
    C("Guardar", "Captura el porcentaje de cada tipo de pago y toca «Guardar»."),
  ],
  roles: () => [
    C("Roles y permisos", "Administrador General, Jefe de Taller, Asesor de Servicio, Técnico y los roles adicionales que necesites."),
    C("Nuevo rol", "Toca + y marca qué módulos y permisos tiene."),
    C("Asignación", "En Usuarios asignas el rol a cada persona. Los cambios aplican la próxima vez que inicie sesión."),
  ],

  // ---------- Administración ----------
  catalogos: () => [
    C("Catálogos generales", "Países, estados, ciudades, colores y marcas y modelos los administra ALDM."),
    C("Para los talleres", "Los usas al dar de alta clientes, vehículos y refacciones. Si falta una marca o modelo, pídelo a soporte."),
  ],
  promociones: () => [
    C("Promociones", "Aparecen en el inicio de la app de tus clientes."),
    C("Nueva promoción", "Toca + y captura título, descripción, vigencia y, si quieres, imagen."),
    C("Activar o desactivar", "Edita una promoción para activarla o desactivarla sin borrarla."),
  ],

  // ---------- Consulta ----------
  panel: () => [
    C("Indicadores", "Resumen del taller en tiempo real. Toca una tarjeta para ver el detalle."),
    O("nueva-orden", "Nueva orden", "Acceso directo para abrir una orden de servicio."),
    O("campana", "Avisos", "Mensajes de clientes, citas nuevas y solicitudes de contraseña."),
    C("Gráficas", "Más abajo: órdenes por mes, dinero que entró, estado de las órdenes y refacciones que se están acabando."),
  ],
  "mi-dashboard": () => [
    C("Mi dashboard", "Tus indicadores personales: órdenes, comisiones y avance."),
    C("Tus servicios", "Abajo ves tus servicios recientes."),
  ],
  asistente: () => [
    C("Asistente", "Consultas rápidas de uso interno: clientes, servicios por estatus y reportes."),
    C("Cómo usarlo", "Escribe tu pregunta (por ejemplo «órdenes en proceso») y responde con los datos de tu taller."),
    C("Manuales", "Consulta códigos de falla y manuales cargados."),
  ],
  busqueda: () => [
    C("Búsqueda", "Busca sin importar acentos ni mayúsculas, por varios campos a la vez."),
    C("Filtros", "Los chips filtran por categoría o estatus y se combinan con la búsqueda."),
    C("Lista alfabética", "En listas largas (clientes, refacciones, marcas) usa la barra de letras A–Z a la derecha para saltar rápido."),
  ],

  // ---------- Solo en la app ----------
  "sin-conexion": () => [
    C("Trabajar sin conexión", "Si te quedas sin internet, la app sigue funcionando: puedes crear y editar órdenes, clientes y vehículos."),
    C("Se sincroniza solo", "Lo que hiciste sin conexión se guarda en el celular y se sube automáticamente cuando vuelve el internet."),
    C("Sin conexión con el servidor", "Si ves ese aviso, revisa tu internet y vuelve a intentar; no se pierde lo capturado."),
  ],
  biometria: () => [
    C("Entrar con huella", "Activa el desbloqueo con huella o rostro desde Más → Seguridad."),
    C("Cómo funciona", "Al abrir la app te pide tu huella en lugar de la contraseña; tu sesión sigue protegida."),
  ],
  fotos: () => [
    C("Fotos con la cámara", "En la orden y en la inspección toca el ícono de cámara para tomar fotos directo."),
    C("Galería", "También puedes elegir fotos que ya tengas guardadas en el celular."),
  ],
};
