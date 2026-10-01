"""
Súper administración de ALDM AutoCore (lo consume la app "ALDM Súper Admin").

No administra datos de UN taller, sino el negocio en sí: qué talleres usan
el sistema, su suscripción (una por taller, que se renueva con cada pago),
paquetes y módulos, tipos de cobro, reglas de días (prueba, gracia,
conservación) y qué usuarios pueden entrar a qué talleres.

Todo aquí trabaja con una sesión SIN filtro de taller (get_db_global) y
exige es_superadmin.
"""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, object_session

from .. import models, schemas
from ..database import get_db_global
from ..security import hash_password, require_superadmin
from ..seed import _generar_codigo, rol_admin_de, sembrar_taller
from ..suscripciones import (
    registrar_renovacion,
    ESTADOS_MANUALES, calcular_estado, contenido_qr, invalidar, obtener_config, precio_periodo, sumar_meses,
)

router = APIRouter(prefix="/api/superadmin", tags=["superadmin"])


# --- Configuración (días capturables) --------------------------------------
@router.get("/configuracion", response_model=schemas.ConfiguracionSaaSOut)
def ver_configuracion(db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    return obtener_config(db)


@router.put("/configuracion", response_model=schemas.ConfiguracionSaaSOut)
def guardar_configuracion(payload: schemas.ConfiguracionSaaSIn, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    config = obtener_config(db)
    if payload.id_paquete_prueba and not db.get(models.Paquete, payload.id_paquete_prueba):
        raise HTTPException(status_code=400, detail="El paquete de prueba indicado no existe")
    for k, v in payload.model_dump().items():
        setattr(config, k, v)
    db.commit()
    invalidar()
    db.refresh(config)
    return config


# --- Tipos de cobro ----------------------------------------------------------
@router.get("/tipos-cobro", response_model=list[schemas.TipoCobroOut])
def listar_tipos_cobro(db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    return db.query(models.TipoCobro).order_by(models.TipoCobro.orden, models.TipoCobro.meses).all()


@router.post("/tipos-cobro", response_model=schemas.TipoCobroOut, status_code=201)
def crear_tipo_cobro(payload: schemas.TipoCobroIn, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    if db.query(models.TipoCobro).filter(func.lower(models.TipoCobro.nombre) == payload.nombre.strip().lower()).first():
        raise HTTPException(status_code=400, detail="Ya existe un tipo de cobro con ese nombre")
    tipo = models.TipoCobro(**payload.model_dump())
    db.add(tipo)
    db.commit()
    db.refresh(tipo)
    return tipo


@router.put("/tipos-cobro/{tipo_id}", response_model=schemas.TipoCobroOut)
def actualizar_tipo_cobro(tipo_id: int, payload: schemas.TipoCobroIn, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    tipo = db.get(models.TipoCobro, tipo_id)
    if not tipo:
        raise HTTPException(status_code=404, detail="Tipo de cobro no encontrado")
    for k, v in payload.model_dump().items():
        setattr(tipo, k, v)
    db.commit()
    db.refresh(tipo)
    return tipo


@router.delete("/tipos-cobro/{tipo_id}", status_code=204)
def eliminar_tipo_cobro(tipo_id: int, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    tipo = db.get(models.TipoCobro, tipo_id)
    if not tipo:
        raise HTTPException(status_code=404, detail="Tipo de cobro no encontrado")
    en_uso = (
        db.query(models.Suscripcion).filter(models.Suscripcion.id_tipo_cobro == tipo_id).first()
        or db.query(models.PagoSuscripcion).filter(models.PagoSuscripcion.id_tipo_cobro == tipo_id).first()
    )
    db.query(models.PrecioPaquete).filter(models.PrecioPaquete.id_tipo_cobro == tipo_id).delete() if not en_uso else None
    if en_uso:
        raise HTTPException(status_code=400, detail="Este tipo de cobro ya se usó en suscripciones o pagos; desactívalo en lugar de eliminarlo.")
    db.delete(tipo)
    db.commit()


# --- Módulos del sistema (catálogo) -----------------------------------------
@router.get("/modulos", response_model=list[schemas.ModuloOut])
def listar_modulos(db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    return db.query(models.Modulo).order_by(models.Modulo.orden, models.Modulo.nombre).all()


@router.post("/modulos", status_code=405, include_in_schema=False)
def crear_modulo(user=Depends(require_superadmin)):
    raise HTTPException(status_code=405, detail="Los módulos los define el sistema; no se pueden agregar. Elige cuáles incluye cada paquete.")


@router.put("/modulos/{modulo_id}", response_model=schemas.ModuloOut)
def actualizar_modulo(modulo_id: int, payload: schemas.ModuloUpdate, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    modulo = db.get(models.Modulo, modulo_id)
    if not modulo:
        raise HTTPException(status_code=404, detail="Módulo no encontrado")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(modulo, key, value)
    db.commit()
    db.refresh(modulo)
    return modulo


@router.delete("/modulos/{modulo_id}", status_code=405, include_in_schema=False)
def eliminar_modulo(modulo_id: int, user=Depends(require_superadmin)):
    raise HTTPException(status_code=405, detail="Los módulos los define el sistema; no se pueden eliminar. Quítalo de los paquetes que no deban incluirlo.")


# --- Paquetes -------------------------------------------------------------------
@router.get("/paquetes", response_model=list[schemas.PaqueteOut])
def listar_paquetes(db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    return db.query(models.Paquete).options(joinedload(models.Paquete.modulos), joinedload(models.Paquete.precios)).order_by(models.Paquete.precio_mensual).all()


def _resolver_modulos(db: Session, claves: list[str]):
    return db.query(models.Modulo).filter(models.Modulo.clave.in_(claves)).all() if claves else []


def _aplicar_precios(db: Session, paquete: models.Paquete, precios):
    """Precio fijo por tipo de cobro; los que no vengan se calculan solos."""
    validos = {t.id_tipo_cobro for t in db.query(models.TipoCobro).all()}
    paquete.precios = []
    db.flush()
    for p in precios or []:
        if p.id_tipo_cobro not in validos:
            raise HTTPException(status_code=400, detail="Tipo de cobro no válido en los precios.")
        if p.precio is None or p.precio < 0:
            raise HTTPException(status_code=400, detail="Los precios no pueden ser negativos.")
        paquete.precios.append(models.PrecioPaquete(id_tipo_cobro=p.id_tipo_cobro, precio=round(p.precio, 2)))


def _con_padres(db, modulos):
    """Inventario y punto de venta depende de Refacciones (el padre)."""
    claves = {m.clave for m in modulos}
    if "inventario" in claves and "refacciones" not in claves:
        padre = db.query(models.Modulo).filter(models.Modulo.clave == "refacciones").first()
        if padre:
            modulos = list(modulos) + [padre]
    return modulos


@router.post("/paquetes", response_model=schemas.PaqueteOut, status_code=201)
def crear_paquete(payload: schemas.PaqueteCreate, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    if db.query(models.Paquete).filter(models.Paquete.nombre == payload.nombre).first():
        raise HTTPException(status_code=400, detail="Ya existe un paquete con ese nombre")
    if payload.precio_mensual is None or payload.precio_mensual < 0:
        raise HTTPException(status_code=400, detail="El precio mensual no puede ser negativo.")
    paquete = models.Paquete(**payload.model_dump(exclude={"modulos", "precios"}), modulos=_con_padres(db, _resolver_modulos(db, payload.modulos)))
    db.add(paquete)
    db.flush()
    _aplicar_precios(db, paquete, payload.precios)
    db.commit()
    db.refresh(paquete)
    return paquete


@router.put("/paquetes/{paquete_id}", response_model=schemas.PaqueteOut)
def actualizar_paquete(paquete_id: int, payload: schemas.PaqueteUpdate, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    paquete = db.get(models.Paquete, paquete_id)
    if not paquete:
        raise HTTPException(status_code=404, detail="Paquete no encontrado")
    datos = payload.model_dump(exclude_unset=True, exclude={"modulos", "precios"})
    if datos.get("nombre") and db.query(models.Paquete).filter(models.Paquete.nombre == datos["nombre"], models.Paquete.id_paquete != paquete_id).first():
        raise HTTPException(status_code=400, detail="Ya existe un paquete con ese nombre")
    if datos.get("precio_mensual") is not None and datos["precio_mensual"] < 0:
        raise HTTPException(status_code=400, detail="El precio mensual no puede ser negativo.")
    for key, value in datos.items():
        setattr(paquete, key, value)
    if payload.modulos is not None:
        paquete.modulos = _con_padres(db, _resolver_modulos(db, payload.modulos))
    if payload.precios is not None:
        _aplicar_precios(db, paquete, payload.precios)
    db.commit()
    invalidar()
    db.refresh(paquete)
    return paquete


@router.delete("/paquetes/{paquete_id}", status_code=204)
def eliminar_paquete(paquete_id: int, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    paquete = db.get(models.Paquete, paquete_id)
    if not paquete:
        raise HTTPException(status_code=404, detail="Paquete no encontrado")
    if paquete.suscripciones:
        raise HTTPException(status_code=400, detail="Hay talleres con este paquete; cámbialos de paquete antes de eliminarlo.")
    config = obtener_config(db)
    if config.id_paquete_prueba == paquete_id:
        config.id_paquete_prueba = None
    db.delete(paquete)
    db.commit()


# --- Talleres ------------------------------------------------------------------
def _uso_por_taller(db: Session) -> dict[int, dict]:
    inicio_mes = date.today().replace(day=1)
    uso: dict[int, dict] = {}

    def acumular(filas, campo):
        for tid, valor in filas:
            if tid is not None:
                uso.setdefault(tid, {})[campo] = valor

    acumular(db.query(models.UsuarioTaller.id_taller, func.count()).filter(models.UsuarioTaller.activo == True).group_by(models.UsuarioTaller.id_taller).all(), "usuarios_activos")
    acumular(db.query(models.Cliente.id_taller, func.count()).group_by(models.Cliente.id_taller).all(), "clientes")
    acumular(db.query(models.Vehiculo.id_taller, func.count()).group_by(models.Vehiculo.id_taller).all(), "vehiculos")
    acumular(db.query(models.Servicio.id_taller, func.count()).group_by(models.Servicio.id_taller).all(), "ordenes_total")
    acumular(
        db.query(models.Servicio.id_taller, func.count())
        .filter(models.Servicio.fecha_entrada_servicio >= inicio_mes).group_by(models.Servicio.id_taller).all(),
        "ordenes_mes",
    )
    acumular(db.query(models.Servicio.id_taller, func.max(models.Servicio.fecha_entrada_servicio)).group_by(models.Servicio.id_taller).all(), "ultima_actividad")
    return uso


def _taller_out(taller: models.Taller, config, uso: dict | None = None) -> schemas.TallerOut:
    salida = schemas.TallerOut.model_validate(taller)
    salida.qr = contenido_qr(taller.codigo)
    tiene_usuarios = object_session(taller).query(models.UsuarioTaller.id_usuario_taller).filter(models.UsuarioTaller.id_taller == taller.id_taller).first() is not None
    salida.pendiente_activacion = not tiene_usuarios
    salida.codigo_activacion = taller.codigo_activacion if not tiene_usuarios else None
    info = calcular_estado(taller, config)
    salida.estado = schemas.EstadoTallerOut(**{k: info[k] for k in schemas.EstadoTallerOut.model_fields})
    susc = taller.suscripcion
    salida.precio_periodo = precio_periodo(susc.paquete, susc.tipo_cobro, susc.precio_pactado) if susc else None
    if uso is not None:
        datos = uso.get(taller.id_taller, {})
        ultima = datos.get("ultima_actividad")
        if isinstance(ultima, date) and not isinstance(ultima, datetime):
            ultima = datetime.combine(ultima, datetime.min.time())
        salida.uso = schemas.UsoTallerOut(**{**datos, "ultima_actividad": ultima})
    return salida


def _consulta_talleres(db: Session):
    return db.query(models.Taller).options(
        joinedload(models.Taller.suscripcion).joinedload(models.Suscripcion.paquete).joinedload(models.Paquete.modulos),
        joinedload(models.Taller.suscripcion).joinedload(models.Suscripcion.tipo_cobro),
    )


def _obtener_taller(db: Session, taller_id: int) -> models.Taller:
    taller = _consulta_talleres(db).filter(models.Taller.id_taller == taller_id).first()
    if not taller:
        raise HTTPException(status_code=404, detail="Taller no encontrado")
    return taller


@router.get("/talleres", response_model=list[schemas.TallerOut])
def listar_talleres(db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    config = obtener_config(db)
    uso = _uso_por_taller(db)
    talleres = _consulta_talleres(db).order_by(models.Taller.nombre_comercial).all()
    return [_taller_out(t, config, uso) for t in talleres]


@router.get("/talleres/{taller_id}", response_model=schemas.TallerOut)
def ver_taller(taller_id: int, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    return _taller_out(_obtener_taller(db, taller_id), obtener_config(db), _uso_por_taller(db))


def _codigo_activacion() -> str:
    import secrets

    alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # sin 0/O ni 1/I/L
    return "".join(secrets.choice(alfabeto) for _ in range(8))


@router.post("/talleres/{taller_id}/codigo-activacion", response_model=schemas.TallerOut)
def nuevo_codigo_activacion(taller_id: int, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    """Genera otro código de activación (si el anterior se perdió). Solo
    mientras el taller no tenga usuarios."""
    taller = _obtener_taller(db, taller_id)
    if db.query(models.UsuarioTaller).filter(models.UsuarioTaller.id_taller == taller_id).first():
        raise HTTPException(status_code=400, detail="Este taller ya tiene su administrador registrado.")
    taller.codigo_activacion = _codigo_activacion()
    db.commit()
    return _taller_out(_obtener_taller(db, taller_id), obtener_config(db), _uso_por_taller(db))


def _codigo_libre(db: Session, codigo: str, id_taller: int | None = None) -> str:
    import re

    limpio = re.sub(r"[^A-Z0-9]", "", codigo.strip().upper())
    if len(limpio) < 3:
        raise HTTPException(status_code=400, detail="El código del taller debe tener al menos 3 letras o números.")
    otro = db.query(models.Taller).filter(models.Taller.codigo == limpio).first()
    if otro and otro.id_taller != id_taller:
        raise HTTPException(status_code=400, detail="Ese código ya lo usa otro taller.")
    return limpio


@router.post("/talleres", response_model=schemas.TallerOut, status_code=201)
def crear_taller(payload: schemas.TallerCreate, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    """Alta completa: taller + su código QR + suscripción (en prueba o
    activa) + roles base + su usuario Administrador General."""
    config = obtener_config(db)
    id_paquete = payload.id_paquete or config.id_paquete_prueba
    paquete = db.get(models.Paquete, id_paquete) if id_paquete else None
    if not paquete:
        raise HTTPException(status_code=400, detail="Elige el paquete del taller.")
    tipo = db.get(models.TipoCobro, payload.id_tipo_cobro) if payload.id_tipo_cobro else None

    admin_existente = None
    if payload.admin:
        admin_existente = db.query(models.Usuario).filter(func.lower(models.Usuario.username) == payload.admin.username.strip().lower()).first()
        if not admin_existente and (not payload.admin.password or len(payload.admin.password) < 6):
            raise HTTPException(status_code=400, detail="La contraseña del administrador debe tener al menos 6 caracteres.")

    datos = payload.model_dump(exclude={"admin", "id_paquete", "id_tipo_cobro", "en_prueba", "codigo"})
    codigo = _codigo_libre(db, payload.codigo) if payload.codigo else _generar_codigo(db, payload.nombre_comercial)
    taller = models.Taller(**datos, codigo=codigo, activo=True, codigo_activacion=None if payload.admin else _codigo_activacion())
    db.add(taller)
    db.flush()
    hoy = date.today()
    db.add(models.Suscripcion(
        id_taller=taller.id_taller, id_paquete=paquete.id_paquete, id_tipo_cobro=tipo.id_tipo_cobro if tipo else None,
        estado="prueba" if payload.en_prueba else "activa", fecha_inicio=hoy,
        fecha_vencimiento=hoy + timedelta(days=config.dias_prueba or 0) if payload.en_prueba else hoy,
    ))
    db.commit()

    sembrar_taller(taller.id_taller)
    if not payload.admin:
        invalidar(taller.id_taller)
        return _taller_out(_obtener_taller(db, taller.id_taller), config, _uso_por_taller(db))
    rol_admin = rol_admin_de(db, taller.id_taller)
    if admin_existente:
        admin = admin_existente
    else:
        admin = models.Usuario(
            username=payload.admin.username.strip(), hashed_password=hash_password(payload.admin.password),
            nombre_completo=payload.admin.nombre_completo, correo=payload.admin.correo, telefono=payload.admin.telefono,
            id_rol_base=rol_admin.id_rol, activo=True, id_ultimo_taller=taller.id_taller,
        )
        db.add(admin)
        db.flush()
    db.add(models.UsuarioTaller(id_usuario=admin.id_usuario, id_taller=taller.id_taller, id_rol=rol_admin.id_rol, activo=True))
    db.commit()
    invalidar(taller.id_taller)
    return _taller_out(_obtener_taller(db, taller.id_taller), config, _uso_por_taller(db))


@router.put("/talleres/{taller_id}", response_model=schemas.TallerOut)
def actualizar_taller(taller_id: int, payload: schemas.TallerUpdate, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    taller = _obtener_taller(db, taller_id)
    datos = payload.model_dump(exclude_unset=True)
    if "codigo" in datos:
        datos["codigo"] = _codigo_libre(db, datos["codigo"] or "", taller_id)
    config = obtener_config(db)
    if datos.get("activo") is False and config.id_taller_principal == taller_id:
        raise HTTPException(status_code=400, detail="El taller principal no se puede desactivar.")
    for key, value in datos.items():
        setattr(taller, key, value)
    db.commit()
    invalidar(taller_id)
    return _taller_out(_obtener_taller(db, taller_id), config, _uso_por_taller(db))


@router.put("/talleres/{taller_id}/suscripcion", response_model=schemas.TallerOut)
def actualizar_suscripcion(taller_id: int, payload: schemas.SuscripcionUpdate, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    taller = _obtener_taller(db, taller_id)
    susc = taller.suscripcion
    if not susc:
        raise HTTPException(status_code=400, detail="Este taller no tiene suscripción.")
    datos = payload.model_dump(exclude_unset=True)
    if datos.get("estado") and datos["estado"] not in ESTADOS_MANUALES:
        raise HTTPException(status_code=400, detail="Estado no válido (prueba, activa, suspendida o cancelada).")
    if datos.get("id_paquete") and not db.get(models.Paquete, datos["id_paquete"]):
        raise HTTPException(status_code=400, detail="El paquete indicado no existe")
    if datos.get("id_tipo_cobro") and not db.get(models.TipoCobro, datos["id_tipo_cobro"]):
        raise HTTPException(status_code=400, detail="El tipo de cobro indicado no existe")
    if datos.pop("quitar_precio_pactado", False):
        susc.precio_pactado = None
        datos.pop("precio_pactado", None)
    if datos.get("estado") in ("suspendida", "cancelada") and susc.estado not in ("suspendida", "cancelada"):
        susc.fecha_suspension = date.today()
    elif datos.get("estado") in ("prueba", "activa"):
        susc.fecha_suspension = None
    for key, value in datos.items():
        setattr(susc, key, value)
    db.commit()
    invalidar(taller_id)
    return _taller_out(_obtener_taller(db, taller_id), obtener_config(db), _uso_por_taller(db))


@router.post("/talleres/{taller_id}/renovar", response_model=schemas.PagoSuscripcionOut, status_code=201)
def renovar(taller_id: int, payload: schemas.RenovarIn, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    """Registra un pago y recorre el vencimiento: si todavía estaba vigente,
    el nuevo periodo empieza al terminar el actual (no se pierden días);
    si ya había vencido, empieza hoy."""
    taller = _obtener_taller(db, taller_id)
    susc = taller.suscripcion
    if not susc:
        raise HTTPException(status_code=400, detail="Este taller no tiene suscripción.")
    if payload.id_paquete:
        if not db.get(models.Paquete, payload.id_paquete):
            raise HTTPException(status_code=400, detail="El paquete indicado no existe")
        susc.id_paquete = payload.id_paquete
    tipo_id = payload.id_tipo_cobro or susc.id_tipo_cobro
    tipo = db.get(models.TipoCobro, tipo_id) if tipo_id else None
    if not tipo:
        raise HTTPException(status_code=400, detail="Elige el tipo de cobro (mensual, anual…).")
    db.flush()
    db.refresh(susc)
    pago = registrar_renovacion(db, taller, tipo, payload.monto, payload.metodo_pago, payload.referencia, payload.notas, user.username)
    return db.query(models.PagoSuscripcion).options(
        joinedload(models.PagoSuscripcion.paquete), joinedload(models.PagoSuscripcion.tipo_cobro), joinedload(models.PagoSuscripcion.taller),
    ).filter(models.PagoSuscripcion.id_pago == pago.id_pago).first()


@router.post("/talleres/{taller_id}/suspender", response_model=schemas.TallerOut)
def suspender(taller_id: int, payload: schemas.SuspenderIn, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    config = obtener_config(db)
    if config.id_taller_principal == taller_id:
        raise HTTPException(status_code=400, detail="El taller principal no se puede suspender.")
    taller = _obtener_taller(db, taller_id)
    if taller.suscripcion:
        taller.suscripcion.estado = "suspendida"
        taller.suscripcion.fecha_suspension = date.today()
        if payload.motivo:
            taller.suscripcion.notas = f"{(taller.suscripcion.notas or '').strip()}\n[{date.today():%d/%m/%Y}] Suspendido: {payload.motivo}".strip()
    db.commit()
    invalidar(taller_id)
    return _taller_out(_obtener_taller(db, taller_id), config, _uso_por_taller(db))


@router.post("/talleres/{taller_id}/reactivar", response_model=schemas.TallerOut)
def reactivar(taller_id: int, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    taller = _obtener_taller(db, taller_id)
    taller.activo = True
    if taller.suscripcion and taller.suscripcion.estado in ("suspendida", "cancelada"):
        taller.suscripcion.estado = "activa"
        taller.suscripcion.fecha_suspension = None
    db.commit()
    invalidar(taller_id)
    return _taller_out(_obtener_taller(db, taller_id), obtener_config(db), _uso_por_taller(db))


@router.get("/talleres/{taller_id}/roles", response_model=list[schemas.RolTallerOut])
def roles_del_taller(taller_id: int, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    return db.query(models.Rol).filter(models.Rol.id_taller == taller_id).order_by(models.Rol.id_rol).all()


@router.get("/talleres/{taller_id}/usuarios", response_model=list[schemas.UsuarioGlobalOut])
def usuarios_del_taller(taller_id: int, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    return (
        _consulta_usuarios(db).join(models.UsuarioTaller, models.UsuarioTaller.id_usuario == models.Usuario.id_usuario)
        .filter(models.UsuarioTaller.id_taller == taller_id).order_by(models.Usuario.username).all()
    )


# --- Pagos -----------------------------------------------------------------------
@router.get("/pagos", response_model=list[schemas.PagoSuscripcionOut])
def listar_pagos(
    id_taller: int | None = None, desde: date | None = None, hasta: date | None = None,
    db: Session = Depends(get_db_global), user=Depends(require_superadmin),
):
    q = db.query(models.PagoSuscripcion).options(
        joinedload(models.PagoSuscripcion.paquete), joinedload(models.PagoSuscripcion.tipo_cobro), joinedload(models.PagoSuscripcion.taller),
    )
    if id_taller:
        q = q.filter(models.PagoSuscripcion.id_taller == id_taller)
    if desde:
        q = q.filter(models.PagoSuscripcion.fecha_pago >= datetime.combine(desde, datetime.min.time()))
    if hasta:
        q = q.filter(models.PagoSuscripcion.fecha_pago < datetime.combine(hasta + timedelta(days=1), datetime.min.time()))
    return q.order_by(models.PagoSuscripcion.fecha_pago.desc()).limit(500).all()


@router.delete("/pagos/{pago_id}", status_code=204)
def eliminar_pago(pago_id: int, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    """Para corregir un pago capturado por error. OJO: no regresa la fecha
    de vencimiento — ajústala a mano en la suscripción si hace falta."""
    pago = db.get(models.PagoSuscripcion, pago_id)
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    db.delete(pago)
    db.commit()


# --- Usuarios y accesos a talleres ----------------------------------------------
def _consulta_usuarios(db: Session):
    return db.query(models.Usuario).options(
        joinedload(models.Usuario.membresias).joinedload(models.UsuarioTaller.taller),
        joinedload(models.Usuario.membresias).joinedload(models.UsuarioTaller.rol),
    )


def _usuario(db: Session, usuario_id: int) -> models.Usuario:
    u = _consulta_usuarios(db).filter(models.Usuario.id_usuario == usuario_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return u


def _rol_para(db: Session, id_taller: int, id_rol: int | None) -> int:
    if id_rol is None:
        rol = rol_admin_de(db, id_taller)
        if not rol:
            raise HTTPException(status_code=400, detail="Ese taller no tiene rol de Administrador General.")
        return rol.id_rol
    rol = db.get(models.Rol, id_rol)
    if not rol or rol.id_taller != id_taller:
        raise HTTPException(status_code=400, detail="El rol no pertenece a ese taller.")
    return rol.id_rol


@router.get("/usuarios", response_model=list[schemas.UsuarioGlobalOut])
def listar_usuarios(q: str | None = None, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    consulta = _consulta_usuarios(db)
    if q:
        like = f"%{q.strip()}%"
        consulta = consulta.filter(
            models.Usuario.username.ilike(like) | models.Usuario.nombre_completo.ilike(like) | models.Usuario.correo.ilike(like)
        )
    return consulta.order_by(models.Usuario.username).all()


@router.post("/usuarios", response_model=schemas.UsuarioGlobalOut, status_code=201)
def crear_usuario(payload: schemas.UsuarioGlobalCreate, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    if db.query(models.Usuario).filter(func.lower(models.Usuario.username) == payload.username.strip().lower()).first():
        raise HTTPException(status_code=400, detail="Ya existe un usuario con ese nombre de usuario.")
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres.")
    nuevo = models.Usuario(
        username=payload.username.strip(), hashed_password=hash_password(payload.password),
        nombre_completo=payload.nombre_completo, telefono=payload.telefono, correo=payload.correo,
        es_superadmin=payload.es_superadmin, activo=True,
    )
    for m in payload.membresias:
        nuevo.membresias.append(models.UsuarioTaller(id_taller=m.id_taller, id_rol=_rol_para(db, m.id_taller, m.id_rol), activo=m.activo))
    if nuevo.membresias:
        nuevo.id_ultimo_taller = nuevo.membresias[0].id_taller
        nuevo.id_rol_base = nuevo.membresias[0].id_rol
    db.add(nuevo)
    db.commit()
    return _usuario(db, nuevo.id_usuario)


@router.put("/usuarios/{usuario_id}", response_model=schemas.UsuarioGlobalOut)
def actualizar_usuario(usuario_id: int, payload: schemas.UsuarioGlobalUpdate, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    u = _usuario(db, usuario_id)
    datos = payload.model_dump(exclude_unset=True)
    password = datos.pop("password", None)
    if password is not None:
        if len(password) < 6:
            raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres.")
        u.hashed_password = hash_password(password)
    if u.id_usuario == user.id_usuario and (datos.get("es_superadmin") is False or datos.get("activo") is False):
        raise HTTPException(status_code=400, detail="No puedes quitarte tu propio acceso de súper administrador.")
    for k, v in datos.items():
        setattr(u, k, v)
    db.commit()
    return _usuario(db, usuario_id)


@router.put("/usuarios/{usuario_id}/talleres", response_model=schemas.UsuarioGlobalOut)
def asignar_talleres(usuario_id: int, payload: list[schemas.MembresiaIn], db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    """Define a qué talleres entra el usuario y con qué rol en cada uno. Los
    talleres que no vengan en la lista se le quitan."""
    u = _usuario(db, usuario_id)
    nuevos = {m.id_taller: m for m in payload}
    for m in list(u.membresias):
        if m.id_taller not in nuevos:
            db.delete(m)
    for id_taller, datos in nuevos.items():
        if not db.get(models.Taller, id_taller):
            raise HTTPException(status_code=400, detail=f"El taller {id_taller} no existe.")
        id_rol = _rol_para(db, id_taller, datos.id_rol)
        existente = next((m for m in u.membresias if m.id_taller == id_taller), None)
        if existente:
            existente.id_rol = id_rol
            existente.activo = datos.activo
        else:
            u.membresias.append(models.UsuarioTaller(id_taller=id_taller, id_rol=id_rol, activo=datos.activo))
    db.commit()
    return _usuario(db, usuario_id)


# --- Resumen / estadísticas ----------------------------------------------------------
@router.get("/resumen", response_model=schemas.ResumenSuperAdminOut)
def resumen(db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    config = obtener_config(db)
    talleres = _consulta_talleres(db).all()
    hoy = date.today()
    conteo = {"vigentes": 0, "en_prueba": 0, "en_gracia": 0, "vencidos": 0, "suspendidos": 0, "por_vencer": 0, "para_depurar": 0}
    recurrente = 0.0
    por_paquete: dict[str, int] = {}
    proximos = []
    for t in talleres:
        info = calcular_estado(t, config, hoy)
        estado = info["estado"]
        susc = t.suscripcion
        if estado in ("activa", "prueba"):
            conteo["vigentes"] += 1
            if estado == "prueba":
                conteo["en_prueba"] += 1
            if susc and susc.paquete:
                por_paquete[susc.paquete.nombre] = por_paquete.get(susc.paquete.nombre, 0) + 1
            if estado == "activa" and susc:
                meses = susc.tipo_cobro.meses if susc.tipo_cobro else 1
                recurrente += precio_periodo(susc.paquete, susc.tipo_cobro, susc.precio_pactado) / max(meses, 1)
            if info["dias_restantes"] is not None and info["dias_restantes"] <= (config.dias_aviso_vencimiento or 0):
                conteo["por_vencer"] += 1
        elif estado == "gracia":
            conteo["en_gracia"] += 1
        elif estado == "vencida":
            conteo["vencidos"] += 1
        else:
            conteo["suspendidos"] += 1
        if info["para_depurar"]:
            conteo["para_depurar"] += 1
        if susc and susc.fecha_vencimiento and estado in ("activa", "prueba", "gracia"):
            proximos.append(schemas.VencimientoOut(
                id_taller=t.id_taller, nombre_comercial=t.nombre_comercial, estado=estado,
                fecha_vencimiento=susc.fecha_vencimiento, dias_restantes=info["dias_restantes"],
                precio_periodo=precio_periodo(susc.paquete, susc.tipo_cobro, susc.precio_pactado),
            ))
    proximos.sort(key=lambda v: v.fecha_vencimiento)

    # Ingresos de los últimos 6 meses (por fecha de pago)
    inicio_mes = hoy.replace(day=1)
    meses = []
    cursor = inicio_mes
    for _ in range(6):
        meses.append(cursor)
        cursor = (cursor - timedelta(days=1)).replace(day=1)
    meses.reverse()
    pagos = db.query(models.PagoSuscripcion).filter(models.PagoSuscripcion.fecha_pago >= datetime.combine(meses[0], datetime.min.time())).all()
    nombres = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
    serie = []
    for m in meses:
        del_mes = [p for p in pagos if p.fecha_pago.year == m.year and p.fecha_pago.month == m.month]
        serie.append(schemas.SerieMesOut(mes=f"{nombres[m.month - 1]} {m.year % 100:02d}", ingresos=round(sum(p.monto or 0 for p in del_mes), 2), pagos=len(del_mes)))

    return schemas.ResumenSuperAdminOut(
        total_talleres=len(talleres),
        **conteo,
        ingresos_mes=serie[-1].ingresos,
        ingresos_mes_anterior=serie[-2].ingresos,
        ingreso_mensual_recurrente=round(recurrente, 2),
        talleres_por_paquete=por_paquete,
        ingresos_por_mes=serie,
        proximos_vencimientos=proximos[:8],
        usuarios_totales=db.query(models.Usuario).filter(models.Usuario.activo == True).count(),
        ordenes_mes_total=db.query(models.Servicio).filter(models.Servicio.fecha_entrada_servicio >= inicio_mes).count(),
    )
