"""Seguimiento público de una orden (enlace / código QR para el cliente).

Ciclo de vida del enlace — el estado NUNCA se guarda, siempre se calcula:
  · El enlace sirve mientras la orden esté EN PROCESO (status "abierto":
    Recibido, En piso, Confirmación, Espera refacciones, En reparación,
    Listo para entrega, Garantía).
  · En el instante en que la orden pasa a finalizada (cerrado) o cancelada,
    la consulta responde 410 con el aviso amable. Si la orden se reabre, el
    mismo enlace vuelve a funcionar (no hay nada que "reactivar").
  · El taller puede apagarlo a mano (revocar) o cambiarlo por uno nuevo.

Seguridad:
  · El token son 256 bits aleatorios (secrets.token_urlsafe(32)); en la base
    solo se guarda su SHA-256 para buscarlo (y una copia cifrada con
    FIELD_ENCRYPTION_KEY para poder volver a mostrar el enlace al personal).
  · Sin login: el taller sale del propio token, no de un encabezado.
  · Solo se muestra lo necesario: estatus, avance, conceptos y montos. Nunca
    nombre, teléfonos, correo, VIN ni comentarios internos; las placas salen
    enmascaradas.
  · Límite de peticiones por IP, sin caché y sin indexar en buscadores.
"""
import hashlib
import os
import re
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, joinedload, selectinload

from .. import models
from ..database import SessionLocal, get_db
from ..rate_limit import limiter
from ..security import require_permission
from ..tenancy import MODO_SUPERADMIN, MODO_TALLER, fijar_tenant
from .recepcion import recepcion_publica
from .servicios import ETAPAS_SERVICIO

publico = APIRouter(prefix="/api/seguimiento", tags=["seguimiento"])
interno = APIRouter(prefix="/api/seguimiento-orden", tags=["seguimiento"])

ETIQUETA_ETAPA = dict(ETAPAS_SERVICIO)
_TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{43}$")  # token_urlsafe(32) siempre mide 43
MENSAJE_FINALIZADA = (
    "Esta orden ha sido finalizada y el seguimiento en línea ya no está disponible. "
    "Si requiere asistencia adicional, por favor contacte a soporte."
)
MENSAJE_NO_VALIDO = "Este enlace no es válido o ya no está activo. Pide uno nuevo al taller."
_CABECERAS = {
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Referrer-Policy": "no-referrer",
}


# --- Utilidades -------------------------------------------------------------
def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def orden_en_proceso(s: models.Servicio) -> bool:
    """Regla única de vigencia. Solo las órdenes abiertas tienen seguimiento."""
    return s.status == "abierto" and s.etapa not in ("cerrado", "cancelado")


def _url(token: str) -> str:
    base = (os.getenv("URL_PUBLICA") or "").strip().rstrip("/")
    return f"{base}/seguimiento/{token}"  # sin URL_PUBLICA queda relativa: el panel le antepone su origen


def _placas_mask(p: Optional[str]) -> Optional[str]:
    p = (p or "").strip()
    if not p:
        return None
    return ("•" * max(len(p) - 3, 0)) + p[-3:] if len(p) > 3 else p


def _vehiculo_txt(v) -> str:
    if not v:
        return "Vehículo por registrar"
    partes = [
        v.marca.nombre_marca if getattr(v, "marca", None) else None,
        v.modelo.nombre_modelo if getattr(v, "modelo", None) else None,
        v.id_year_vehiculo,
    ]
    return " ".join(str(x) for x in partes if x) or "Vehículo"


def _montos(s: models.Servicio) -> dict:
    subtotal = sum((d.costo_mano_obra or 0) + (d.costo_refaccion or 0) + (d.costo_extra or 0) for d in s.detalles)
    iva = subtotal * (s.iva_porcentaje or 0) / 100
    total = subtotal + iva
    abonado = sum(a.monto_abono or 0 for a in s.abonos)
    return {
        "mano_obra": round(sum(d.costo_mano_obra or 0 for d in s.detalles), 2),
        "refacciones": round(sum(d.costo_refaccion or 0 for d in s.detalles), 2),
        "extras": round(sum(d.costo_extra or 0 for d in s.detalles), 2),
        "subtotal": round(subtotal, 2),
        "iva_porcentaje": s.iva_porcentaje or 0,
        "iva": round(iva, 2),
        "total": round(total, 2),
        "abonado": round(abonado, 2),
        "saldo": round(max(total - abonado, 0), 2),
    }


def _concepto(d: models.ServicioDetalle, con_montos: bool = True) -> dict:
    nombre = d.descripcion
    if not nombre and d.refaccion is not None:
        nombre = getattr(d.refaccion, "nombre_refaccion", None)
    mo, rf, ex = d.costo_mano_obra or 0, d.costo_refaccion or 0, d.costo_extra or 0
    es_ref = bool(d.id_refaccion or d.id_inventario_refaccion or rf)
    if not con_montos:
        return {"descripcion": nombre or "Concepto", "cantidad": d.cantidad or 1, "es_refaccion": es_ref}
    return {
        "descripcion": nombre or "Concepto",
        "cantidad": d.cantidad or 1,
        "mano_obra": round(mo, 2), "refaccion": round(rf, 2), "extra": round(ex, 2),
        "importe": round(mo + rf + ex, 2),
        "es_refaccion": es_ref,
    }


# --- Público: consultar el seguimiento (sin login) ---------------------------
def db_publica():
    """Sesión sin taller fijo: el taller se resuelve a partir del token."""
    db = SessionLocal()
    fijar_tenant(db, MODO_SUPERADMIN)
    try:
        yield db
    finally:
        db.close()


def _respuesta(codigo: int, contenido: dict) -> JSONResponse:
    return JSONResponse(status_code=codigo, content=contenido, headers=_CABECERAS)


@publico.get("/{token}")
@limiter.limit("30/minute")
def consultar(request: Request, token: str, db: Session = Depends(db_publica)):
    if not _TOKEN_RE.match(token):
        return _respuesta(404, {"codigo": "no_valido", "mensaje": MENSAJE_NO_VALIDO})
    reg = (
        db.query(models.SeguimientoOrden).execution_options(sin_filtro_taller=True)
        .filter(models.SeguimientoOrden.token_hash == _hash(token), models.SeguimientoOrden.revocado_en.is_(None))
        .first()
    )
    if not reg or reg.id_taller is None:
        return _respuesta(404, {"codigo": "no_valido", "mensaje": MENSAJE_NO_VALIDO})

    fijar_tenant(db, MODO_TALLER, reg.id_taller)  # a partir de aquí solo se ve ese taller
    s = (
        db.query(models.Servicio)
        .options(
            selectinload(models.Servicio.detalles).joinedload(models.ServicioDetalle.refaccion),
            selectinload(models.Servicio.abonos),
            selectinload(models.Servicio.historial_etapas),
            joinedload(models.Servicio.vehiculo).joinedload(models.Vehiculo.marca),
            joinedload(models.Servicio.vehiculo).joinedload(models.Vehiculo.modelo),
            joinedload(models.Servicio.cliente),
        )
        .filter(models.Servicio.id_servicio == reg.id_servicio)
        .first()
    )
    if not s:
        return _respuesta(404, {"codigo": "no_valido", "mensaje": MENSAJE_NO_VALIDO})

    from ..suscripciones import estado_taller
    info = estado_taller(db, reg.id_taller)
    if info and info.get("bloqueado"):
        return _respuesta(404, {"codigo": "no_valido", "mensaje": MENSAJE_NO_VALIDO})

    taller = db.query(models.ConfiguracionTaller).first()
    nombre_taller = taller.nombre_taller if taller else None
    if not orden_en_proceso(s):
        return _respuesta(410, {"codigo": "finalizada", "mensaje": MENSAJE_FINALIZADA, "taller": nombre_taller})

    ahora = datetime.utcnow()
    if reg.ultimo_acceso is None or ahora - reg.ultimo_acceso > timedelta(seconds=60):
        reg.ultimo_acceso = ahora
        reg.accesos = (reg.accesos or 0) + 1
        db.commit()

    mostrar_montos = s.etapa == "listo_entrega"
    historial = [
        {"etapa": ETIQUETA_ETAPA.get(h.etapa, h.etapa), "clave": h.etapa, "fecha": h.fecha.isoformat() if h.fecha else None}
        for h in s.historial_etapas
    ]
    return _respuesta(200, {
        "taller": {
            "nombre": nombre_taller,
            "telefono": taller.telefono if taller else None,
            "direccion": _direccion_taller(taller),
            "logo": f"/uploads/{taller.ruta_logo}" if taller and taller.ruta_logo else None,
        },
        "cliente": _cliente_txt(s.cliente),
        "inspeccion": _inspeccion_publica(db, s.id_servicio),
        "recepcion": recepcion_publica(db, s),
        "orden": {
            "folio": s.id_servicio,
            "servicio": s.nombre_servicio,
            "vehiculo": _vehiculo_txt(s.vehiculo),
            "placas": _placas_mask(s.vehiculo.placas_vehiculo if s.vehiculo else None),
            "fecha_entrada": s.fecha_entrada_servicio.isoformat() if s.fecha_entrada_servicio else None,
            "etapa": s.etapa,
            "estatus": ETIQUETA_ETAPA.get(s.etapa, s.etapa),
            "autorizada": bool(s.autorizado_cliente),
        },
        "historial": historial,
        # Los montos solo se publican cuando la orden está lista para entrega; antes no salen del servidor.
        "montos_visibles": mostrar_montos,
        "conceptos": [_concepto(d, mostrar_montos) for d in s.detalles],
        "montos": _montos(s) if mostrar_montos else None,
        "actualizado": ahora.isoformat() + "Z",
    })


def _inspeccion_publica(db: Session, id_servicio: int) -> Optional[dict]:
    """Última inspección de la orden: punto, estado y comentario. Con las fotos de los puntos en Regular/Mal; sin datos del personal."""
    insp = (
        db.query(models.Inspeccion)
        .options(selectinload(models.Inspeccion.resultados).joinedload(models.InspeccionResultado.item))
        .filter(models.Inspeccion.id_servicio == id_servicio)
        .order_by(models.Inspeccion.fecha.desc())
        .first()
    )
    if not insp or not insp.resultados:
        return None
    fotos_por_item: dict = {}
    for f in (
        db.query(models.Foto)
        .filter(models.Foto.entidad_tipo == "inspeccion_item", models.Foto.entidad_id == insp.id_inspeccion)
        .order_by(models.Foto.fecha.asc())
        .all()
    ):
        fotos_por_item.setdefault(str(f.descripcion), []).append(f"/uploads/{f.ruta_archivo}")
    puntos = []
    for r in sorted(insp.resultados, key=lambda x: (x.item.orden or 0) if x.item else 0):
        if not r.item:
            continue
        puntos.append({
            "categoria": r.item.categoria,
            "nombre": r.item.nombre_item,
            "estado": r.estado if r.estado in ("bien", "regular", "mal") else "bien",
            "comentario": (r.comentario or "").strip() or None,
            "fotos": fotos_por_item.get(str(r.id_item), []) if r.estado in ("regular", "mal") else [],
        })
    resumen = {e: sum(1 for p in puntos if p["estado"] == e) for e in ("bien", "regular", "mal")}
    resumen["total"] = len(puntos)
    return {"fecha": insp.fecha.isoformat() if insp.fecha else None, "resumen": resumen, "puntos": puntos}


def _direccion_taller(taller) -> Optional[str]:
    """Dirección en una línea para ubicar el taller en Google Maps."""
    if not taller:
        return None
    partes = []
    calle = " ".join(x for x in [(taller.calle or "").strip(), (taller.numero_taller or "").strip()] if x)
    if calle:
        partes.append(calle)
    elif (taller.direccion or "").strip():
        partes.append(taller.direccion.strip())
    if taller.cp:
        partes.append(f"CP {taller.cp}")
    if taller.ciudad is not None:
        partes.append(taller.ciudad.nombre_ciudad)
    if taller.estado is not None:
        partes.append(taller.estado.nombre_estado)
    partes.append("México")
    return ", ".join(partes) if len(partes) > 1 else None


def _cliente_txt(c) -> Optional[str]:
    """Solo nombre y apellido paterno: el enlace no expone teléfono, correo ni domicilio."""
    if not c:
        return None
    return " ".join(x for x in [(c.nombre_cliente or "").strip(), (c.paterno_cliente or "").strip()] if x) or None


# --- Panel (con sesión): generar, ver, regenerar y apagar el enlace -----------
def _orden_o_404(db: Session, id_servicio: int) -> models.Servicio:
    s = db.query(models.Servicio).filter(models.Servicio.id_servicio == id_servicio).first()
    if not s:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    return s


def _vigente(db: Session, id_servicio: int) -> Optional[models.SeguimientoOrden]:
    return (
        db.query(models.SeguimientoOrden)
        .filter(models.SeguimientoOrden.id_servicio == id_servicio, models.SeguimientoOrden.revocado_en.is_(None))
        .order_by(models.SeguimientoOrden.id_seguimiento.desc())
        .first()
    )


def _estado(s: models.Servicio, reg: Optional[models.SeguimientoOrden]) -> dict:
    token = reg.token_cifrado if reg else None
    if token and not _TOKEN_RE.match(token):
        token = None  # no se pudo descifrar (falta la llave): hay que regenerar
    return {
        "existe": bool(reg),
        "orden_en_proceso": orden_en_proceso(s),
        "activo": bool(reg and token and orden_en_proceso(s)),
        "requiere_regenerar": bool(reg and not token),
        "url": _url(token) if token else None,
        "creado_en": reg.creado_en if reg else None,
        "creado_por": reg.creado_por if reg else None,
        "accesos": reg.accesos if reg else 0,
        "ultimo_acceso": reg.ultimo_acceso if reg else None,
    }


def _exigir_permisos(user):
    # El enlace muestra montos: quien no puede ver precios tampoco puede abrirlo ni compartirlo.
    if not user.tiene_permiso("servicios.ver_precios"):
        raise HTTPException(status_code=403, detail="Tu rol no puede ver precios, así que tampoco puede compartir el seguimiento.")


def _crear(db: Session, s: models.Servicio, user) -> models.SeguimientoOrden:
    token = secrets.token_urlsafe(32)
    reg = models.SeguimientoOrden(
        id_servicio=s.id_servicio, token_hash=_hash(token), token_cifrado=token, creado_por=user.username,
    )
    db.add(reg)
    db.commit()
    db.refresh(reg)
    return reg


@interno.get("/{id_servicio}")
def estado_enlace(id_servicio: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.ver"))):
    _exigir_permisos(user)
    s = _orden_o_404(db, id_servicio)
    return _estado(s, _vigente(db, id_servicio))


@interno.post("/{id_servicio}")
def generar_enlace(id_servicio: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    """Crea el enlace de la orden (si ya hay uno vigente, lo devuelve: no se duplican)."""
    _exigir_permisos(user)
    s = _orden_o_404(db, id_servicio)
    if not orden_en_proceso(s):
        raise HTTPException(status_code=400, detail="La orden ya está finalizada o cancelada: no tiene seguimiento en línea.")
    reg = _vigente(db, id_servicio)
    if not reg or not _TOKEN_RE.match(reg.token_cifrado or ""):
        if reg:
            reg.revocado_en, reg.revocado_por = datetime.utcnow(), user.username
        reg = _crear(db, s, user)
    return _estado(s, reg)


@interno.post("/{id_servicio}/regenerar")
def regenerar_enlace(id_servicio: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    """Invalida el enlace anterior (y su QR) y crea uno nuevo."""
    _exigir_permisos(user)
    s = _orden_o_404(db, id_servicio)
    if not orden_en_proceso(s):
        raise HTTPException(status_code=400, detail="La orden ya está finalizada o cancelada: no tiene seguimiento en línea.")
    anterior = _vigente(db, id_servicio)
    if anterior:
        anterior.revocado_en, anterior.revocado_por = datetime.utcnow(), user.username
    return _estado(s, _crear(db, s, user))


@interno.delete("/{id_servicio}")
def apagar_enlace(id_servicio: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    s = _orden_o_404(db, id_servicio)
    reg = _vigente(db, id_servicio)
    if reg:
        reg.revocado_en, reg.revocado_por = datetime.utcnow(), user.username
        db.commit()
    return _estado(s, None)
