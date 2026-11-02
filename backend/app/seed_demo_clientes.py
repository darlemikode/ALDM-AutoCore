"""
Datos de prueba: clientes con varios vehículos para ver cómo se comporta la app.

Uso (desde la carpeta backend, con el entorno activado):

    python -m app.seed_demo_clientes                 # lista los talleres
    python -m app.seed_demo_clientes --taller 1      # crea 300 clientes en el taller 1
    python -m app.seed_demo_clientes --taller 1 --n 500
    python -m app.seed_demo_clientes --taller 1 --borrar   # quita los datos demo

Todo lo creado lleva la marca «[DEMO]» en comentarios, así se puede borrar
sin tocar datos reales. Se puede ejecutar varias veces (cada corrida agrega
más). Usa la base de DATABASE_URL de tu .env: si apunta a una base remota
(Azure) pide la bandera --si-remota.
"""
import argparse
import random
import string
import sys

from sqlalchemy import func

from . import models
from .database import DATABASE_URL, SessionLocal, es_sqlite
from .tenancy import MODO_SUPERADMIN, MODO_TALLER, fijar_tenant

MARCA = "[DEMO]"

NOMBRES_H = ["José", "Juan", "Luis", "Carlos", "Miguel", "Jorge", "Francisco", "Alejandro", "Ricardo", "Fernando", "Roberto", "Eduardo", "Daniel", "Javier", "Raúl", "Sergio", "Arturo", "Héctor", "Manuel", "Óscar", "Pedro", "Andrés", "Gustavo", "Rafael", "Iván"]
NOMBRES_M = ["María", "Guadalupe", "Ana", "Laura", "Patricia", "Claudia", "Rosa", "Verónica", "Leticia", "Elizabeth", "Fernanda", "Gabriela", "Alejandra", "Mariana", "Karla", "Daniela", "Sandra", "Lucía", "Paola", "Diana", "Adriana", "Teresa", "Martha", "Silvia", "Ximena"]
APELLIDOS = ["Hernández", "García", "Martínez", "López", "González", "Rodríguez", "Pérez", "Sánchez", "Ramírez", "Flores", "Gómez", "Díaz", "Cruz", "Morales", "Reyes", "Gutiérrez", "Ortiz", "Jiménez", "Mendoza", "Ruiz", "Aguilar", "Castillo", "Vázquez", "Romero", "Torres", "Medina", "Vargas", "Castro", "Ramos", "Herrera", "Rojas", "Salazar", "Navarro", "Delgado", "Ríos", "Fuentes", "Estrada", "Cortés", "Luna", "Ibarra"]
CALLES = ["Av. Juárez", "Calle Hidalgo", "Av. Reforma", "Calle Morelos", "Av. Universidad", "Calle Allende", "Blvd. Díaz Ordaz", "Calle 5 de Mayo", "Av. Insurgentes", "Calle Madero", "Calle Zaragoza", "Av. Revolución", "Calle Guerrero", "Av. Hidalgo", "Calle Independencia"]
COLONIAS = ["Centro", "Del Valle", "Providencia", "Las Palmas", "Jardines del Sur", "San Rafael", "Lomas Verdes", "Industrial", "Reforma", "Villa Hermosa", "Los Pinos", "Americana", "Santa Fe", "La Paz", "El Mirador"]
EMPRESAS = ["Transportes", "Distribuidora", "Constructora", "Comercial", "Servicios", "Logística", "Abarrotes", "Refaccionaria", "Taller", "Agroindustrias"]
GIROS = ["del Norte", "del Bajío", "Pacífico", "Central", "Azteca", "Mexicana", "del Centro", "Peninsular", "Sureste", "Occidente"]
CILINDRAJES = ["1.0", "1.4", "1.5", "1.6", "1.8", "2.0", "2.4", "2.5", "3.0", "3.5", "5.0"]
LETRAS_PLACA = "ABCDEFGHJKLMNPRSTUVXYZ"
VIN_CHARS = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789"


def telefono(rng):
    return "".join([rng.choice(["55", "81", "33", "44", "22", "66", "99"]), *(str(rng.randint(0, 9)) for _ in range(8))])


def placa(rng):
    return f"{''.join(rng.choice(LETRAS_PLACA) for _ in range(3))}-{rng.randint(100, 999)}-{rng.choice(LETRAS_PLACA)}"


def vin(rng, usados):
    while True:
        v = "".join(rng.choice(VIN_CHARS) for _ in range(17))
        if v not in usados:
            usados.add(v)
            return v


def rfc(rng, nombre, paterno, materno):
    ini = (paterno[:1] + (materno[:1] or "X") + nombre[:1]).upper()
    ini += rng.choice(string.ascii_uppercase)
    fecha = f"{rng.randint(60, 99):02d}{rng.randint(1, 12):02d}{rng.randint(1, 28):02d}"
    return ini + fecha + "".join(rng.choice(string.ascii_uppercase + string.digits) for _ in range(3))


def sin_acentos(t):
    return t.lower().translate(str.maketrans("áéíóúüñ", "aeiouun")).replace(" ", "")


def listar_talleres(db):
    print("Talleres disponibles:")
    for t in db.query(models.Taller).order_by(models.Taller.id_taller).all():
        print(f"  --taller {t.id_taller}   {t.nombre_comercial}  ({t.codigo})")


def borrar(db, id_taller):
    fijar_tenant(db, MODO_TALLER, id_taller)
    clientes = db.query(models.Cliente).filter(models.Cliente.comentarios.like(f"{MARCA}%")).all()
    ids = [c.id_cliente for c in clientes]
    if not ids:
        print("No hay datos demo en ese taller.")
        return
    con_ordenes = {r[0] for r in db.query(models.Servicio.id_cliente).filter(models.Servicio.id_cliente.in_(ids)).distinct().all()}
    con_cotiz = {r[0] for r in db.query(models.Cotizacion.id_cliente).filter(models.Cotizacion.id_cliente.in_(ids)).distinct().all()}
    protegidos = con_ordenes | con_cotiz
    borrables = [i for i in ids if i not in protegidos]
    if borrables:
        db.query(models.Vehiculo).filter(models.Vehiculo.id_cliente.in_(borrables)).delete(synchronize_session=False)
        db.query(models.Cliente).filter(models.Cliente.id_cliente.in_(borrables)).delete(synchronize_session=False)
    db.commit()
    print(f"Clientes demo borrados: {len(borrables)}")
    if protegidos:
        print(f"Se conservaron {len(protegidos)} clientes demo porque ya tienen órdenes o cotizaciones.")


def crear(db, id_taller, n, semilla):
    fijar_tenant(db, MODO_TALLER, id_taller)
    rng = random.Random(semilla)
    marcas = db.query(models.VehiculoMarca).all()
    modelos_por_marca = {}
    for mo in db.query(models.VehiculoModelo).all():
        modelos_por_marca.setdefault(mo.id_marca_vehiculo, []).append(mo)
    marcas = [m for m in marcas if modelos_por_marca.get(m.id_marca_vehiculo)]
    colores = db.query(models.ColorVehiculo).all()
    ciudades = db.query(models.Ciudad).limit(200).all()
    if not marcas:
        print("No hay marcas con modelos en el catálogo. Arranca el backend una vez para que el seed los cree.")
        return
    # Las marcas más comunes pesan más
    pesos = [3 if m.nombre_marca.upper() in ("NISSAN", "VOLKSWAGEN", "CHEVROLET", "TOYOTA", "FORD", "HONDA", "KIA", "MAZDA", "HYUNDAI", "SEAT") else 1 for m in marcas]
    usados_vin = {r[0] for r in db.query(models.Vehiculo.numserie_vehiculo).filter(models.Vehiculo.numserie_vehiculo.isnot(None)).all()}
    total_veh = 0
    lote = 50
    for ini in range(0, n, lote):
        clientes = []
        for _ in range(min(lote, n - ini)):
            mujer = rng.random() < 0.45
            nombre = rng.choice(NOMBRES_M if mujer else NOMBRES_H)
            pat, mat = rng.sample(APELLIDOS, 2)
            es_empresa = rng.random() < 0.12
            ciudad = rng.choice(ciudades) if ciudades else None
            c = models.Cliente(
                numero_cuenta=f"TMP-{rng.getrandbits(48):012x}",
                nombre_cliente=nombre, paterno_cliente=pat, materno_cliente=mat,
                calle_cliente=rng.choice(CALLES), numexterior_cliente=str(rng.randint(1, 999)),
                colonia_cliente=rng.choice(COLONIAS), cp_cliente=f"{rng.randint(1000, 99999):05d}",
                telefono1=telefono(rng), telefono2=telefono(rng) if rng.random() < 0.3 else None,
                id_ciudad=ciudad.id_ciudad if ciudad else None, id_estado=ciudad.id_estado if ciudad else None,
                correo_cliente=f"{sin_acentos(nombre)}.{sin_acentos(pat)}{rng.randint(1, 99)}@example.com" if rng.random() < 0.8 else None,
                empresa_cliente=f"{rng.choice(EMPRESAS)} {rng.choice(GIROS)}" if es_empresa else None,
                rfc_cliente=rfc(rng, nombre, pat, mat) if es_empresa or rng.random() < 0.25 else None,
                comentarios=f"{MARCA} cliente de prueba",
                status_cliente=1,
            )
            clientes.append(c)
        db.add_all(clientes)
        db.flush()
        for c in clientes:
            c.numero_cuenta = f"CTE-{c.id_cliente:06d}"
        db.flush()
        for c in clientes:
            # 1 a 4 vehículos por cliente (más probable 1–2); las empresas tienen flotilla
            k = rng.choices([1, 2, 3, 4], weights=[40, 33, 18, 9])[0] if not c.empresa_cliente else rng.randint(3, 8)
            for i in range(1, k + 1):
                marca = rng.choices(marcas, weights=pesos)[0]
                modelo = rng.choice(modelos_por_marca[marca.id_marca_vehiculo])
                db.add(models.Vehiculo(
                    numero_cuenta=f"{c.numero_cuenta}-{i:02d}",
                    id_marca_vehiculo=marca.id_marca_vehiculo, id_modelo_vehiculo=modelo.id_modelo_vehiculo,
                    id_cliente=c.id_cliente, numserie_vehiculo=vin(rng, usados_vin), placas_vehiculo=placa(rng),
                    id_color=rng.choice(colores).id_color if colores else None,
                    cilindraje_vehiculo=rng.choice(CILINDRAJES), id_year_vehiculo=str(rng.randint(2004, 2025)),
                    km_vehiculo=str(rng.randint(5, 280) * 1000), comentarios=f"{MARCA} vehículo de prueba",
                    estado_vehiculo="vendido" if rng.random() < 0.04 else "activo",
                ))
                total_veh += 1
        db.commit()
        print(f"  {min(ini + lote, n)}/{n} clientes…")
    print(f"Listo: {n} clientes y {total_veh} vehículos creados en el taller {id_taller}.")


def main():
    ap = argparse.ArgumentParser(description="Crea clientes y vehículos de prueba.")
    ap.add_argument("--taller", type=int, help="id del taller donde crear los datos")
    ap.add_argument("--n", type=int, default=300, help="cuántos clientes (por defecto 300)")
    ap.add_argument("--semilla", type=int, default=None, help="semilla aleatoria (por defecto cambia cada vez)")
    ap.add_argument("--borrar", action="store_true", help="borra los datos demo del taller")
    ap.add_argument("--si-remota", action="store_true", help="confirma que quieres escribir en una base que no es local")
    a = ap.parse_args()

    local = es_sqlite or any(h in DATABASE_URL for h in ("localhost", "127.0.0.1", "::1"))
    db = SessionLocal()
    try:
        fijar_tenant(db, MODO_SUPERADMIN)
        if a.taller is None:
            listar_talleres(db)
            print("\nEjemplo: python -m app.seed_demo_clientes --taller 1")
            return
        t = db.query(models.Taller).filter(models.Taller.id_taller == a.taller).first()
        if not t:
            print("Ese taller no existe.")
            listar_talleres(db)
            sys.exit(1)
        if not local and not a.si_remota:
            print("La base de datos NO es local. Si de verdad quieres escribir ahí, agrega --si-remota.")
            sys.exit(1)
        print(f"Taller: {t.nombre_comercial} (id {t.id_taller}) · Base: {'local' if local else 'remota'}")
        if a.borrar:
            borrar(db, a.taller)
        else:
            crear(db, a.taller, a.n, a.semilla if a.semilla is not None else random.randrange(10**9))
    finally:
        db.close()


if __name__ == "__main__":
    main()
