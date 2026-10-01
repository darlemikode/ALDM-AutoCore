"""Catálogos precargados (compartidos por todos los talleres). Es idempotente:
en cada arranque solo agrega lo que falta (por nombre), nunca borra ni
modifica lo que un administrador ya editó."""
from . import models

COLORES = [
    "Blanco", "Negro", "Gris", "Plata", "Rojo", "Azul", "Verde", "Amarillo", "Café", "Dorado",
    "Naranja", "Vino", "Beige", "Champagne", "Morado", "Rosa", "Turquesa", "Azul marino",
    "Gris Oxford", "Blanco perla", "Bronce", "Arena", "Grafito", "Azul cielo", "Verde oscuro",
]

TIPOS_SERVICIO = [
    "Cambio de aceite", "Afinación", "Frenos", "Suspensión", "Diagnóstico eléctrico",
    "Alineación y balanceo", "Transmisión", "Otro",
    "Afinación mayor", "Afinación menor", "Diagnóstico con escáner", "Cambio de filtros",
    "Cambio de batería", "Cambio de llantas", "Rotación de llantas", "Clutch / embrague",
    "Sistema de enfriamiento", "Cambio de anticongelante", "Aire acondicionado", "Sistema de escape",
    "Dirección hidráulica", "Cambio de banda de distribución", "Cambio de bomba de agua",
    "Cambio de balatas", "Rectificación de discos", "Amortiguadores", "Rótulas y terminales",
    "Inyectores / limpieza", "Sistema de combustible", "Sistema eléctrico", "Luces y faros",
    "Hojalatería y pintura", "Revisión pre-verificación", "Mantenimiento preventivo", "Revisión de viaje",
    "Cambio de aceite de transmisión", "Motor / reparación mayor", "Lavado de motor",
]

CATEGORIAS_REFACCION = {
    "Frenos": ["Balatas delanteras", "Balatas traseras", "Discos", "Líquido de frenos", "Tambores", "Cilindros y mangueras", "Pastillas de freno de mano"],
    "Motor": ["Filtro de aceite", "Bujías", "Banda de distribución", "Aceite de motor", "Filtro de aire", "Filtro de gasolina", "Bomba de agua", "Empaques y juntas", "Bobinas", "Cables de bujía", "Sensores", "Bandas y poleas", "Inyectores"],
    "Suspensión": ["Amortiguadores delanteros", "Amortiguadores traseros", "Rótulas", "Terminales", "Bujes", "Barras estabilizadoras", "Resortes", "Soportes de amortiguador"],
    "Dirección": ["Cremallera", "Bomba de dirección", "Terminales de dirección", "Líquido de dirección"],
    "Eléctrico": ["Batería", "Alternador", "Marcha", "Fusibles", "Focos", "Relevadores", "Sensores eléctricos"],
    "Transmisión": ["Aceite de transmisión", "Embrague", "Bandas", "Flechas y juntas", "Filtro de transmisión"],
    "Refrigeración": ["Radiador", "Anticongelante", "Termostato", "Mangueras", "Ventilador", "Tapón de radiador"],
    "Aire acondicionado": ["Compresor", "Filtro de cabina", "Gas refrigerante", "Condensador"],
    "Llantas": ["Llantas", "Válvulas", "Balanceo", "Rines"],
    "Escape": ["Silenciador", "Catalizador", "Tubo de escape", "Sensor de oxígeno"],
    "Carrocería": ["Limpiaparabrisas", "Espejos", "Faros", "Molduras", "Calaveras", "Parabrisas"],
    "Lubricantes y químicos": ["Aceite de motor", "Grasa", "Limpiadores", "Aditivos", "Líquido limpiaparabrisas"],
}

MARCAS_REFACCION = [
    "Bosch", "Brembo", "NGK", "Denso", "ACDelco", "Motorcraft", "Mobil", "Castrol", "Valvoline", "Shell",
    "Fram", "Mann", "Mahle", "Gates", "Dayco", "Monroe", "KYB", "Moog", "Sachs", "TRW", "Fritec", "Wagner",
    "Raybestos", "Champion", "Delphi", "Valeo", "Continental", "Michelin", "Bridgestone", "Goodyear", "Pirelli",
    "Hankook", "Firestone", "LTH", "Bosch Baterías", "Optima", "Interstate", "Epsilon", "Tekno", "Nakata",
    "TYC", "Depo", "Luk", "Exedy", "Aisin", "Hella", "Philips", "Osram", "Prestone", "Liqui Moly", "Genérica / otra",
]

MARCAS_HERRAMIENTA = [
    "Urrea", "Truper", "Stanley", "Snap-on", "Craftsman", "Dewalt", "Makita", "Milwaukee", "Bosch",
    "Pretul", "Foy", "Surtek", "Mac Tools", "Matco", "Gedore", "Facom", "Bahco", "Klein Tools",
    "Lincoln", "Hilti", "Black & Decker", "Ingersoll Rand", "Proto", "Hamilton", "Genérica / otra",
]

CIUDADES = {
    "Aguascalientes": ["Aguascalientes", "Jesús María", "Calvillo", "Rincón de Romos"],
    "Baja California": ["Tijuana", "Mexicali", "Ensenada", "Tecate", "Rosarito"],
    "Baja California Sur": ["La Paz", "Los Cabos", "Cabo San Lucas", "San José del Cabo", "Comondú"],
    "Campeche": ["Campeche", "Ciudad del Carmen", "Champotón", "Escárcega"],
    "Chiapas": ["Tuxtla Gutiérrez", "Tapachula", "San Cristóbal de las Casas", "Comitán", "Palenque"],
    "Chihuahua": ["Chihuahua", "Ciudad Juárez", "Cuauhtémoc", "Delicias", "Parral"],
    "Ciudad de México": ["Ciudad de México", "Iztapalapa", "Gustavo A. Madero", "Coyoacán", "Tlalpan", "Álvaro Obregón", "Benito Juárez"],
    "Coahuila": ["Saltillo", "Torreón", "Monclova", "Piedras Negras", "Ramos Arizpe", "Acuña"],
    "Colima": ["Colima", "Manzanillo", "Tecomán", "Villa de Álvarez"],
    "Durango": ["Durango", "Gómez Palacio", "Lerdo", "Santiago Papasquiaro"],
    "Estado de México": ["Toluca", "Ecatepec", "Naucalpan", "Nezahualcóyotl", "Tlalnepantla", "Chimalhuacán", "Cuautitlán Izcalli", "Texcoco", "Metepec"],
    "Guanajuato": ["León", "Guanajuato", "Irapuato", "Celaya", "Salamanca", "Silao", "San Miguel de Allende", "San Francisco del Rincón", "Purísima del Rincón", "Dolores Hidalgo"],
    "Guerrero": ["Acapulco", "Chilpancingo", "Iguala", "Taxco", "Zihuatanejo"],
    "Hidalgo": ["Pachuca", "Tulancingo", "Tula de Allende", "Huejutla"],
    "Jalisco": ["Guadalajara", "Zapopan", "Tlaquepaque", "Tonalá", "Tlajomulco", "Puerto Vallarta", "Lagos de Moreno", "Tepatitlán"],
    "Michoacán": ["Morelia", "Uruapan", "Zamora", "Lázaro Cárdenas", "Apatzingán", "Pátzcuaro"],
    "Morelos": ["Cuernavaca", "Cuautla", "Jiutepec", "Temixco"],
    "Nayarit": ["Tepic", "Bahía de Banderas", "Xalisco", "Santiago Ixcuintla"],
    "Nuevo León": ["Monterrey", "San Nicolás de los Garza", "Guadalupe", "Apodaca", "Escobedo", "San Pedro Garza García", "Santa Catarina", "Juárez"],
    "Oaxaca": ["Oaxaca de Juárez", "Salina Cruz", "Juchitán", "Tuxtepec", "Huatulco"],
    "Puebla": ["Puebla", "Tehuacán", "San Martín Texmelucan", "Atlixco", "Cholula"],
    "Querétaro": ["Querétaro", "San Juan del Río", "Corregidora", "El Marqués"],
    "Quintana Roo": ["Cancún", "Playa del Carmen", "Chetumal", "Cozumel", "Tulum"],
    "San Luis Potosí": ["San Luis Potosí", "Soledad de Graciano Sánchez", "Ciudad Valles", "Matehuala"],
    "Sinaloa": ["Culiacán", "Mazatlán", "Los Mochis", "Guasave", "Navolato"],
    "Sonora": ["Hermosillo", "Ciudad Obregón", "Nogales", "San Luis Río Colorado", "Guaymas", "Navojoa"],
    "Tabasco": ["Villahermosa", "Cárdenas", "Comalcalco", "Paraíso"],
    "Tamaulipas": ["Reynosa", "Matamoros", "Nuevo Laredo", "Tampico", "Ciudad Victoria", "Ciudad Madero"],
    "Tlaxcala": ["Tlaxcala", "Apizaco", "Huamantla", "Chiautempan"],
    "Veracruz": ["Veracruz", "Xalapa", "Coatzacoalcos", "Córdoba", "Orizaba", "Poza Rica", "Boca del Río", "Minatitlán"],
    "Yucatán": ["Mérida", "Valladolid", "Progreso", "Tizimín", "Kanasín"],
    "Zacatecas": ["Zacatecas", "Fresnillo", "Guadalupe", "Jerez"],
}


def _agregar_simples(db, modelo, campo, nombres):
    existentes = {(getattr(x, campo) or "").strip().lower() for x in db.query(modelo).all()}
    for n in nombres:
        if n.strip().lower() not in existentes:
            db.add(modelo(**{campo: n}))
    db.flush()


def asegurar_catalogos_base(db):
    _agregar_simples(db, models.ColorVehiculo, "nombre_color", COLORES)
    _agregar_simples(db, models.TipoServicio, "nombre_tipo", TIPOS_SERVICIO)
    _agregar_simples(db, models.RefaccionMarca, "nombre_marca", MARCAS_REFACCION)
    _agregar_simples(db, models.HerramientaMarca, "nombre_marca", MARCAS_HERRAMIENTA)

    # Categorías y subcategorías de refacción
    categorias = {c.nombre_categoria.strip().lower(): c for c in db.query(models.RefaccionCategoria).all()}
    for nombre, subs in CATEGORIAS_REFACCION.items():
        cat = categorias.get(nombre.lower())
        if not cat:
            cat = models.RefaccionCategoria(nombre_categoria=nombre)
            db.add(cat)
            db.flush()
            categorias[nombre.lower()] = cat
        existentes = {s.nombre_subcategoria.strip().lower() for s in db.query(models.RefaccionSubcategoria).filter(
            models.RefaccionSubcategoria.id_categoria_refaccion == cat.id_categoria_refaccion)}
        for s in subs:
            if s.lower() not in existentes:
                db.add(models.RefaccionSubcategoria(nombre_subcategoria=s, id_categoria_refaccion=cat.id_categoria_refaccion))
    db.flush()

    # Ciudades por estado
    estados = {e.nombre_estado: e for e in db.query(models.Estado).all()}
    for nombre_estado, ciudades in CIUDADES.items():
        estado = estados.get(nombre_estado)
        if not estado:
            continue
        existentes = {c.nombre_ciudad.strip().lower() for c in db.query(models.Ciudad).filter(models.Ciudad.id_estado == estado.id_estado)}
        for c in ciudades:
            if c.lower() not in existentes:
                db.add(models.Ciudad(nombre_ciudad=c, id_estado=estado.id_estado))
    db.commit()
