import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Integer, case, func, or_, try_cast
from sqlalchemy.orm import Session, aliased, joinedload

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user, require_permission

router = APIRouter(prefix="/api/vehiculos", tags=["vehículos"])


def _con_ultimo_servicio(db: Session, vehiculos: list[models.Vehiculo]) -> list[models.Vehiculo]:
    """Le pega a cada vehículo los datos de su orden más reciente — lo usa
    la vista "Por cliente" para ordenar por a quién le hicieron servicio
    hace menos tiempo. Todo se calcula en la base de datos (una fila por
    vehículo), sin traer cada orden al servidor."""
    ids = [v.id_vehiculo for v in vehiculos]
    if not ids:
        return vehiculos
    S = models.Servicio
    ultimos = {}
    conteos: dict[int, int] = {}
    # Por trozos: SQL Server admite ~2100 parámetros por consulta.
    for i in range(0, len(ids), 800):
        trozo = ids[i:i + 800]
        for id_veh, n in db.query(S.id_vehiculo, func.count(S.id_servicio)).filter(S.id_vehiculo.in_(trozo)).group_by(S.id_vehiculo).all():
            conteos[id_veh] = n
        orden = func.row_number().over(partition_by=S.id_vehiculo, order_by=S.fecha_entrada_servicio.desc()).label("orden")
        sub = (
            db.query(S.id_vehiculo.label("id_vehiculo"), S.fecha_entrada_servicio.label("fecha"), S.etapa.label("etapa"), S.status.label("status"), orden)
            .filter(S.id_vehiculo.in_(trozo)).subquery()
        )
        for f in db.query(sub.c.id_vehiculo, sub.c.fecha, sub.c.etapa, sub.c.status).filter(sub.c.orden == 1).all():
            ultimos[f.id_vehiculo] = f
    for v in vehiculos:
        s = ultimos.get(v.id_vehiculo)
        v.fecha_ultimo_servicio = s.fecha if s else None
        v.etapa_ultimo_servicio = s.etapa if s else None
        v.status_ultimo_servicio = s.status if s else None
        v.total_servicios = conteos.get(v.id_vehiculo, 0)
    return vehiculos


def _con_foto_principal(db: Session, vehiculos: list[models.Vehiculo]) -> list[models.Vehiculo]:
    """Deja en vehiculo.foto_principal la ruta de su foto más reciente (o
    None) — una sola consulta para toda la lista, para que la vista en
    cuadros pueda mostrarla sin pedir /fotos/ por cada tarjeta. La base de
    datos devuelve solo la última foto de cada vehículo (no todas)."""
    ids = [v.id_vehiculo for v in vehiculos]
    if not ids:
        return vehiculos
    F = models.Foto
    mas_reciente: dict[int, str] = {}
    for i in range(0, len(ids), 800):
        trozo = ids[i:i + 800]
        orden = func.row_number().over(partition_by=F.entidad_id, order_by=F.fecha.desc()).label("orden")
        sub = (
            db.query(F.entidad_id.label("entidad_id"), F.ruta_archivo.label("ruta"), orden)
            .filter(F.entidad_tipo == "vehiculo", F.entidad_id.in_(trozo)).subquery()
        )
        for f in db.query(sub.c.entidad_id, sub.c.ruta).filter(sub.c.orden == 1).all():
            mas_reciente[f.entidad_id] = f.ruta
    for v in vehiculos:
        v.foto_principal = f"/uploads/{mas_reciente[v.id_vehiculo]}" if v.id_vehiculo in mas_reciente else None
    return vehiculos


class CatalogosVehiculoOut(BaseModel):
    marcas: list[schemas.VehiculoMarcaOut]
    modelos: list[schemas.VehiculoModeloOut]
    colores: list[schemas.ColorVehiculoOut]


@router.get("/catalogos", response_model=CatalogosVehiculoOut)
def catalogos(db: Session = Depends(get_db), user=Depends(require_permission("vehiculos.ver"))):
    """Marcas, modelos y colores en UNA petición (la pantalla los pedía en
    tres, y cada petición paga su validación de sesión)."""
    return {
        "marcas": db.query(models.VehiculoMarca).order_by(models.VehiculoMarca.id_marca_vehiculo).all(),
        "modelos": db.query(models.VehiculoModelo).order_by(models.VehiculoModelo.id_modelo_vehiculo).all(),
        "colores": db.query(models.ColorVehiculo).order_by(models.ColorVehiculo.id_color).all(),
    }


# ---------------------------------------------------------------------------
# Lista paginada con filtros en el servidor (la pantalla ya no baja todos los vehículos)
# ---------------------------------------------------------------------------
DIAS_PROXIMO = 150  # mismo criterio que la pantalla: días sin visita para "le toca servicio"


class FiltrosVeh:
    """Filtros de la pantalla de vehículos (parámetros de la URL; listas separadas por coma)."""

    def __init__(
        self,
        id_cliente: Optional[int] = None,
        q: Optional[str] = None,
        marcas: str = "",
        modelos: str = "",
        colores: str = "",
        anio_desde: Optional[int] = None,
        anio_hasta: Optional[int] = None,
        estado: str = "",
        servicio: str = "",
        orden: str = "",
    ):
        self.id_cliente = id_cliente
        self.q = (q or "").strip()
        self.marcas = _ids(marcas)
        self.modelos = _ids(modelos)
        self.colores = _ids(colores)
        self.anio_desde = anio_desde
        self.anio_hasta = anio_hasta
        self.estado = estado if estado in ("activo", "vendido") else ""
        self.servicio = servicio if servicio in ("abierto", "reciente", "toca", "sin") else ""
        self.orden = orden


def _ids(texto: str) -> list[int]:
    return [int(x) for x in (texto or "").split(",") if x.strip().isdigit()][:200]


def _subconsultas(db: Session):
    """Última orden de cada vehículo y total de órdenes, como subconsultas para filtrar/ordenar en SQL."""
    S = models.Servicio
    orden = func.row_number().over(partition_by=S.id_vehiculo, order_by=S.fecha_entrada_servicio.desc()).label("orden")
    sub = db.query(S.id_vehiculo.label("id_vehiculo"), S.fecha_entrada_servicio.label("fecha"), S.status.label("status"), orden).subquery()
    ult = db.query(sub.c.id_vehiculo, sub.c.fecha, sub.c.status).filter(sub.c.orden == 1).subquery()
    cnt = db.query(S.id_vehiculo.label("id_vehiculo"), func.count(S.id_servicio).label("n")).group_by(S.id_vehiculo).subquery()
    return ult, cnt


def _anio():
    return try_cast(models.Vehiculo.id_year_vehiculo, Integer)


def _condiciones(f: FiltrosVeh, ult, cnt, cli, marca, modelo) -> list:
    V = models.Vehiculo
    c = []
    if f.id_cliente:
        c.append(V.id_cliente == f.id_cliente)
    if f.marcas:
        c.append(V.id_marca_vehiculo.in_(f.marcas))
    if f.modelos:
        c.append(V.id_modelo_vehiculo.in_(f.modelos))
    if f.colores:
        c.append(V.id_color.in_(f.colores))
    if f.estado:
        c.append(V.estado_vehiculo == f.estado)
    if f.anio_desde or f.anio_hasta:
        y = _anio()
        c.append(y > 0)
        if f.anio_desde:
            c.append(y >= f.anio_desde)
        if f.anio_hasta:
            c.append(y <= f.anio_hasta)
    ahora = datetime.utcnow()
    if f.servicio == "abierto":
        c.append(ult.c.status == "abierto")
    elif f.servicio == "sin":
        c.append(ult.c.fecha.is_(None))
        c.append(cnt.c.n.is_(None))
    elif f.servicio == "reciente":
        c.append(ult.c.fecha >= ahora - timedelta(days=90))
    elif f.servicio == "toca":
        c.append(ult.c.fecha <= ahora - timedelta(days=DIAS_PROXIMO))
        c.append(or_(ult.c.status.is_(None), ult.c.status != "abierto"))
        c.append(V.estado_vehiculo == "activo")
    if f.q:
        cond = [
            V.placas_vehiculo.icontains(f.q, autoescape=True),
            V.numero_cuenta.icontains(f.q, autoescape=True),
            marca.nombre_marca.icontains(f.q, autoescape=True),
            modelo.nombre_modelo.icontains(f.q, autoescape=True),
            (cli.nombre_cliente + " " + func.coalesce(cli.paterno_cliente, "")).icontains(f.q, autoescape=True),
        ]
        digitos = "".join(ch for ch in f.q if ch.isdigit())
        if digitos:
            tel = cli.telefono1
            for ch in ("-", " ", "(", ")", "+", "."):
                tel = func.replace(tel, ch, "")
            cond.append(tel.contains(digitos, autoescape=True))
        c.append(or_(*cond))
    return c


def _orden(f: FiltrosVeh, ult, cnt, marca, modelo) -> list:
    V = models.Vehiculo
    y = _anio()
    desempate = V.id_vehiculo.desc()
    if f.orden == "marca":
        return [marca.nombre_marca, modelo.nombre_modelo, desempate]
    if f.orden == "anio_desc":
        return [func.coalesce(y, 0).desc(), desempate]
    if f.orden == "anio_asc":
        return [func.coalesce(case((y > 0, y), else_=None), 9999), desempate]
    if f.orden == "km_desc":
        return [func.coalesce(try_cast(V.km_vehiculo, Integer), 0).desc(), desempate]
    if f.orden == "km_asc":
        return [func.coalesce(try_cast(V.km_vehiculo, Integer), 0), desempate]
    if f.orden == "servicio":
        return [case((ult.c.fecha.is_(None), 1), else_=0), ult.c.fecha.desc(), desempate]
    if f.orden == "mas_servicios":
        return [func.coalesce(cnt.c.n, 0).desc(), desempate]
    return [desempate]  # "" y "reciente"


class PaginaVehiculos(BaseModel):
    items: list[schemas.VehiculoConClienteOut]
    total: int


@router.get("/pagina", response_model=PaginaVehiculos)
def pagina(
    f: FiltrosVeh = Depends(),
    limite: int = Query(40, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user=Depends(require_permission("vehiculos.ver")),
):
    """Una página de vehículos ya filtrada y ordenada en la base de datos, más el total que coincide."""
    V = models.Vehiculo
    ult, cnt = _subconsultas(db)
    cli, marca, modelo = aliased(models.Cliente), aliased(models.VehiculoMarca), aliased(models.VehiculoModelo)
    base = (
        db.query(V)
        .outerjoin(cli, cli.id_cliente == V.id_cliente)
        .outerjoin(marca, marca.id_marca_vehiculo == V.id_marca_vehiculo)
        .outerjoin(modelo, modelo.id_modelo_vehiculo == V.id_modelo_vehiculo)
        .outerjoin(ult, ult.c.id_vehiculo == V.id_vehiculo)
        .outerjoin(cnt, cnt.c.id_vehiculo == V.id_vehiculo)
        .filter(*_condiciones(f, ult, cnt, cli, marca, modelo))
    )
    total = base.with_entities(func.count(V.id_vehiculo)).order_by(None).scalar() or 0
    filas = (
        base.options(joinedload(V.cliente)).order_by(*_orden(f, ult, cnt, marca, modelo))
        .offset(offset).limit(limite).all()
    )
    filas = _con_ultimo_servicio(db, filas)
    return {"items": _con_foto_principal(db, filas), "total": int(total)}


@router.get("/resumen")
def resumen(id_cliente: Optional[int] = None, db: Session = Depends(get_db), user=Depends(require_permission("vehiculos.ver"))):
    """Tarjetas de arriba y conteos de los filtros (marca, modelo, color, años) en una sola respuesta pequeña."""
    V = models.Vehiculo
    ult, cnt = _subconsultas(db)
    limite = datetime.utcnow() - timedelta(days=DIAS_PROXIMO)
    activo = V.estado_vehiculo == "activo"
    def contar(*cond):
        q = db.query(func.count(V.id_vehiculo)).select_from(V)
        if id_cliente:
            q = q.filter(V.id_cliente == id_cliente)
        q = q.outerjoin(ult, ult.c.id_vehiculo == V.id_vehiculo).outerjoin(cnt, cnt.c.id_vehiculo == V.id_vehiculo)
        if cond:
            q = q.filter(*cond)
        return int(q.order_by(None).scalar() or 0)

    errores: list[str] = []

    def seguro(nombre, f, defecto):
        """Cada parte se calcula por separado: si una falla no se pierden las demás (y el error se informa)."""
        try:
            return f()
        except Exception as e:  # noqa: BLE001
            db.rollback()
            logging.getLogger(__name__).exception("vehiculos/resumen: fallo en %s", nombre)
            errores.append(f"{nombre}: {type(e).__name__}: {str(e)[:300]}")
            return defecto

    fila = (
        seguro("total", lambda: contar(), 0),
        seguro("activos", lambda: contar(activo), 0),
        seguro("abiertos", lambda: contar(activo, ult.c.status == "abierto"), 0),
        seguro("toca", lambda: contar(activo, ult.c.fecha <= limite, or_(ult.c.status.is_(None), ult.c.status != "abierto")), 0),
        seguro("sin", lambda: contar(activo, ult.c.fecha.is_(None), cnt.c.n.is_(None)), 0),
    )

    def agrupar(col):
        q = db.query(col, func.count(V.id_vehiculo)).filter(col.isnot(None))
        if id_cliente:
            q = q.filter(V.id_cliente == id_cliente)
        return {int(k): int(n) for k, n in q.group_by(col).all()}

    def rango():
        y = _anio()
        qa = db.query(func.min(y), func.max(y)).filter(y > 0)
        if id_cliente:
            qa = qa.filter(V.id_cliente == id_cliente)
        return qa.one()

    amin, amax = seguro("anios", rango, (None, None))
    return {
        "total": fila[0], "activos": fila[1], "abiertos": fila[2], "toca": fila[3], "sin": fila[4],
        "marcas": seguro("marcas", lambda: agrupar(V.id_marca_vehiculo), {}),
        "modelos": seguro("modelos", lambda: agrupar(V.id_modelo_vehiculo), {}),
        "colores": seguro("colores", lambda: agrupar(V.id_color), {}),
        "anio_min": int(amin) if amin else None, "anio_max": int(amax) if amax else None,
        "errores": errores,
    }


@router.get("/", response_model=list[schemas.VehiculoConClienteOut])
def listar(
    id_cliente: Optional[int] = None,
    q: Optional[str] = None,
    limite: Optional[int] = Query(None, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user=Depends(require_permission("vehiculos.ver")),
):
    query = db.query(models.Vehiculo).options(joinedload(models.Vehiculo.cliente))
    if id_cliente:
        query = query.filter(models.Vehiculo.id_cliente == id_cliente)
    if q:
        query = query.filter(models.Vehiculo.placas_vehiculo.ilike(f"%{q}%"))
    query = query.order_by(models.Vehiculo.id_vehiculo.desc())
    if limite:
        query = query.offset(offset).limit(limite)
    vehiculos = query.all()
    vehiculos = _con_ultimo_servicio(db, vehiculos)
    return _con_foto_principal(db, vehiculos)


@router.get("/{vehiculo_id}", response_model=schemas.VehiculoConClienteOut)
def obtener(vehiculo_id: int, db: Session = Depends(get_db), user=Depends(require_permission("vehiculos.ver"))):
    vehiculo = (
        db.query(models.Vehiculo)
        .options(joinedload(models.Vehiculo.cliente))
        .filter(models.Vehiculo.id_vehiculo == vehiculo_id)
        .first()
    )
    if not vehiculo:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")
    _con_foto_principal(db, [vehiculo])
    return vehiculo


def _generar_numero_cuenta_vehiculo(db: Session, cliente: models.Cliente | None) -> str:
    """Cuenta del vehículo, casada 1 a 1 con la cuenta del cliente:
    <cuenta-del-cliente>-<consecutivo de 2 dígitos>, ej. CTE-000001-01.
    Sin cliente (vehículo de cotización): SIN-CLIENTE-<consecutivo>."""
    if cliente:
        total_previos = db.query(models.Vehiculo).filter(models.Vehiculo.id_cliente == cliente.id_cliente).count()
        sub_indice = total_previos + 1
        numero_cuenta = f"{cliente.numero_cuenta}-{sub_indice:02d}"
    else:
        total_previos = db.query(models.Vehiculo).filter(models.Vehiculo.id_cliente.is_(None)).count()
        sub_indice = total_previos + 1
        numero_cuenta = f"SIN-CLIENTE-{sub_indice:04d}"
    # Salvaguarda ante huecos por vehículos eliminados previamente
    while db.query(models.Vehiculo).filter(models.Vehiculo.numero_cuenta == numero_cuenta).first():
        sub_indice += 1
        numero_cuenta = f"{cliente.numero_cuenta}-{sub_indice:02d}" if cliente else f"SIN-CLIENTE-{sub_indice:04d}"
    return numero_cuenta


@router.post("/", response_model=schemas.VehiculoOut, status_code=201)
def crear(payload: schemas.VehiculoIn, db: Session = Depends(get_db), user=Depends(require_permission("vehiculos.crear"))):
    cliente = None
    if payload.id_cliente:
        cliente = db.query(models.Cliente).filter(models.Cliente.id_cliente == payload.id_cliente).first()
        if not cliente:
            raise HTTPException(status_code=400, detail="El cliente indicado no existe")
    numero_cuenta = _generar_numero_cuenta_vehiculo(db, cliente)
    vehiculo = models.Vehiculo(numero_cuenta=numero_cuenta, **payload.model_dump())
    db.add(vehiculo)
    db.commit()
    db.refresh(vehiculo)
    return vehiculo


@router.put("/{vehiculo_id}", response_model=schemas.VehiculoOut)
def actualizar(vehiculo_id: int, payload: schemas.VehiculoIn, db: Session = Depends(get_db), user=Depends(require_permission("vehiculos.editar"))):
    vehiculo = db.query(models.Vehiculo).filter(models.Vehiculo.id_vehiculo == vehiculo_id).first()
    if not vehiculo:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")
    if payload.id_cliente != vehiculo.id_cliente:
        raise HTTPException(
            status_code=400,
            detail="No se puede reasignar el vehículo a otro cliente: su cuenta única quedaría inconsistente. Da de baja este vehículo y créalo de nuevo bajo el otro cliente.",
        )
    for key, value in payload.model_dump().items():
        setattr(vehiculo, key, value)
    db.commit()
    db.refresh(vehiculo)
    return vehiculo


@router.delete("/{vehiculo_id}", status_code=204)
def eliminar(vehiculo_id: int, db: Session = Depends(get_db), user=Depends(require_permission("vehiculos.eliminar"))):
    vehiculo = db.query(models.Vehiculo).filter(models.Vehiculo.id_vehiculo == vehiculo_id).first()
    if not vehiculo:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")
    tiene_servicios = db.query(models.Servicio).filter(models.Servicio.id_vehiculo == vehiculo_id).first()
    if tiene_servicios:
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar: el vehículo tiene órdenes de servicio en su historial.",
        )
    db.delete(vehiculo)
    db.commit()
    return None
