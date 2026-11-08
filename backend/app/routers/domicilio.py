"""Servicio a domicilio.

Una orden de servicio normal puede marcarse «a domicilio»: se captura la
dirección y la ubicación donde se hará el trabajo, se asigna al mecánico y el
sistema genera:

  · un ENLACE PÚBLICO para el mecánico (token de 256 bits, sin iniciar sesión)
    con el servicio, el cliente, la dirección y el botón de mapas. Si el mismo
    mecánico tiene más órdenes a domicilio abiertas, el enlace muestra cuál
    sigue y su propio enlace;
  · un CÓDIGO de 6 dígitos que se manda al cliente. El mecánico debe capturarlo
    para iniciar: mientras no se capture, la orden no puede avanzar de etapa,
    agregar conceptos ni finalizarse (ver `exigir_codigo_domicilio`). A los 5
    intentos fallidos el código se bloquea y hay que regenerarlo en el taller.

Al finalizar, el mecánico manda la nota por WhatsApp y se registra el envío
(`nota_enviada_at`); eso NO bloquea el cierre.
"""
import hashlib
import hmac
import io
import os
import re
import secrets
from datetime import datetime, timedelta
from typing import Literal, Optional
from urllib.parse import unquote_plus, urljoin, urlparse

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from .. import almacenamiento, models, whatsapp_envio
from ..database import get_db
from ..rate_limit import limiter
from ..push_notifications import enviar_push
from ..security import get_current_user, require_permission
from ..subida_archivos import guardar as guardar_archivo, leer_y_validar_imagen, nombre_unico
from ..ws_manager import manager
from ..tenancy import MODO_TALLER, fijar_tenant
from .seguimiento import db_publica

def _exigir_modulo_domicilio(user=Depends(get_current_user)):
    """El servicio a domicilio es un módulo del paquete: sin él, el taller no usa estas rutas.
    (El enlace público del mecánico no pasa por aquí: se valida con su token.)"""
    modulos = getattr(user, "_modulos_activos", None)
    if modulos is not None and "servicio_domicilio" not in modulos:
        raise HTTPException(status_code=403, detail="Tu paquete no incluye el servicio a domicilio.")


publico = APIRouter(prefix="/api/domicilio", tags=["domicilio"])
interno = APIRouter(prefix="/api/servicio-domicilio", tags=["domicilio"], dependencies=[Depends(_exigir_modulo_domicilio)])

MAX_INTENTOS = 5
_TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{43}$")
MENSAJE_NO_VALIDO = "Este enlace no es válido o ya no está activo. Pide uno nuevo al taller."
MENSAJE_FINALIZADA = "Este servicio ya fue finalizado o cancelado y el enlace ya no está disponible."
_CABECERAS = {
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Referrer-Policy": "no-referrer",
}


# --- Utilidades --------------------------------------------------------------
def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _nuevo_codigo() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(6))


def _url(token: str) -> str:
    base = (os.getenv("URL_PUBLICA") or "").strip().rstrip("/")
    return f"{base}/domicilio/{token}"  # sin URL_PUBLICA queda relativa: el cliente le antepone su origen


def _texto(v: Optional[str], n: int) -> Optional[str]:
    v = (v or "").strip()
    return v[:n] if v else None


def _direccion_txt(d: models.ServicioDomicilio) -> str:
    calle = " ".join(x for x in [d.calle, d.numero] if x)
    partes = [calle, d.colonia, f"CP {d.cp}" if d.cp else None, d.ciudad, d.estado]
    return ", ".join(p for p in partes if p)


def _maps_url(d: models.ServicioDomicilio) -> Optional[str]:
    if d.lat is not None and d.lng is not None:
        return f"https://www.google.com/maps/search/?api=1&query={d.lat},{d.lng}"
    if d.maps_url:
        return d.maps_url
    txt = _direccion_txt(d)
    if txt:
        from urllib.parse import quote
        return f"https://www.google.com/maps/search/?api=1&query={quote(txt + ', México')}"
    return None


_RE_COORD = [
    re.compile(r"!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)"),  # el pin exacto del lugar
    re.compile(r"[?&](?:q|query|ll|destination)=(-?\d{1,3}\.\d+)(?:,|%2C)(-?\d{1,3}\.\d+)"),
    re.compile(r"@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)"),  # centro de la vista (puede no ser el pin)
]


def coordenadas_de_enlace(enlace: Optional[str]) -> Optional[tuple[float, float]]:
    """Saca latitud/longitud de un enlace de Google Maps pegado por el usuario."""
    for rx in _RE_COORD:
        m = rx.search(enlace or "")
        if m:
            lat, lng = float(m.group(1)), float(m.group(2))
            if -90 <= lat <= 90 and -180 <= lng <= 180:
                return lat, lng
    return None


def _enlace_valido(enlace: Optional[str]) -> bool:
    return bool(re.match(r"^https://(www\.)?(google\.[a-z.]+/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl/maps|waze\.com)", enlace or "", re.I))


def exigir_codigo_domicilio(db: Session, servicio: models.Servicio) -> None:
    """Candado: una orden a domicilio no avanza hasta capturar el código del cliente."""
    d = db.query(models.ServicioDomicilio).filter(models.ServicioDomicilio.id_servicio == servicio.id_servicio).first()
    if d and not d.iniciado_at:
        raise HTTPException(
            status_code=400,
            detail="Servicio a domicilio: el mecánico debe capturar el código que le da el cliente para poder iniciar la orden.",
        )


def _verificar_codigo(db: Session, d: models.ServicioDomicilio, codigo: str, quien: str) -> None:
    if d.iniciado_at:
        return  # ya iniciado: idempotente
    if d.codigo_bloqueado:
        raise HTTPException(status_code=423, detail="Código bloqueado por demasiados intentos. Pide al taller que genere uno nuevo.")
    esperado = d.codigo_cifrado or ""
    ok = bool(esperado) and hmac.compare_digest(str(codigo or "").strip(), str(esperado))
    if not ok:
        d.codigo_intentos = (d.codigo_intentos or 0) + 1
        restantes = MAX_INTENTOS - d.codigo_intentos
        if restantes <= 0:
            d.codigo_bloqueado = True
        db.commit()
        if restantes <= 0:
            raise HTTPException(status_code=423, detail="Código bloqueado por demasiados intentos. Pide al taller que genere uno nuevo.")
        raise HTTPException(status_code=400, detail=f"Código incorrecto. Te quedan {restantes} intento{'s' if restantes != 1 else ''}.")
    d.iniciado_at = datetime.utcnow()
    d.iniciado_por = quien
    d.codigo_intentos = 0
    s = db.query(models.Servicio).filter(models.Servicio.id_servicio == d.id_servicio).first()
    if s and s.status == "abierto" and s.etapa in ("en_proceso", "abierto", "pendiente"):
        s.etapa = "en_reparacion"
        db.add(models.ServicioEtapaHistorial(
            id_servicio=s.id_servicio, etapa="en_reparacion", comentario="Servicio a domicilio iniciado con el código del cliente", actualizado_por=quien,
        ))
    db.commit()


def _siguientes(db: Session, d: models.ServicioDomicilio) -> list[dict]:
    if not d.id_empleado_mecanico:
        return []
    filas = (
        db.query(models.ServicioDomicilio, models.Servicio)
        .join(models.Servicio, models.Servicio.id_servicio == models.ServicioDomicilio.id_servicio)
        .options(joinedload(models.Servicio.cliente))
        .filter(
            models.ServicioDomicilio.id_empleado_mecanico == d.id_empleado_mecanico,
            models.ServicioDomicilio.id_domicilio != d.id_domicilio,
            models.Servicio.status == "abierto",
        )
        .order_by(models.Servicio.fecha_entrada_servicio.asc(), models.Servicio.id_servicio.asc())
        .all()
    )
    res = []
    for dom, s in filas:
        token = dom.token_cifrado if dom.token_cifrado and _TOKEN_RE.match(dom.token_cifrado) else None
        res.append({
            "folio": s.id_servicio,
            "servicio": s.nombre_servicio,
            "cliente": _cliente_corto(s.cliente),
            "direccion": _direccion_txt(dom) or None,
            "maps_url": _maps_url(dom),
            "iniciado": bool(dom.iniciado_at),
            "enlace": _url(token) if token else None,
        })
    return res


def _cliente_corto(c) -> Optional[str]:
    if not c:
        return None
    return " ".join(x for x in [(c.nombre_cliente or "").strip(), (c.paterno_cliente or "").strip()] if x) or None


def _vehiculo_txt(v) -> str:
    if not v:
        return "Vehículo por registrar"
    partes = [
        v.marca.nombre_marca if getattr(v, "marca", None) else None,
        v.modelo.nombre_modelo if getattr(v, "modelo", None) else None,
        v.id_year_vehiculo,
    ]
    return " ".join(str(x) for x in partes if x) or "Vehículo"


def _respuesta(codigo: int, contenido: dict) -> JSONResponse:
    return JSONResponse(status_code=codigo, content=contenido, headers=_CABECERAS)


# --- Público: lo que ve el mecánico con su enlace -----------------------------
class CodigoIn(BaseModel):
    codigo: str = Field(min_length=4, max_length=10)


class EtapaMecanicoIn(BaseModel):
    etapa: str = Field(min_length=3, max_length=30)
    comentario: Optional[str] = Field(default=None, max_length=250)


class NotaMecanicoIn(BaseModel):
    texto: str = Field(min_length=2, max_length=250)


# Etapas que el mecánico puede marcar desde su enlace (cerrar y cobrar sigue siendo del taller)
ETAPAS_MECANICO = {"en_proceso": "Recibido", "abierto": "En piso", "pendiente": "Confirmación del cliente", "espera_refacciones": "Espera refacciones", "en_reparacion": "En reparación", "listo_entrega": "Listo para entrega"}
_ETAPAS_NOMBRE = {**ETAPAS_MECANICO, "en_proceso": "Recibido", "abierto": "En piso", "pendiente": "Confirmación del cliente",
                  "cerrado": "Finalizada", "garantia": "Garantía", "cancelado": "Cancelado"}
QUIEN_ENLACE = "mecanico (enlace)"
MAX_FOTOS_ENLACE = 20
_CARPETA_UPLOADS = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")


def _progreso(db: Session, s: models.Servicio, d: Optional[models.ServicioDomicilio] = None) -> dict:
    """Etapa actual, bitácora reciente y fotos que el mecánico ha subido desde el enlace."""
    hist = (
        db.query(models.ServicioEtapaHistorial).filter(models.ServicioEtapaHistorial.id_servicio == s.id_servicio)
        .order_by(models.ServicioEtapaHistorial.fecha.desc(), models.ServicioEtapaHistorial.id_registro.desc()).limit(8).all()
    )
    fotos = (
        db.query(models.Foto)
        .filter(models.Foto.entidad_tipo == "servicio", models.Foto.entidad_id == s.id_servicio, models.Foto.subida_por == QUIEN_ENLACE)
        .order_by(models.Foto.fecha.desc()).limit(MAX_FOTOS_ENLACE).all()
    )
    return {
        "etapa": {"clave": s.etapa, "nombre": _ETAPAS_NOMBRE.get(s.etapa or "", s.etapa)},
        "etapas_permitidas": [{"clave": k, "nombre": v} for k, v in ETAPAS_MECANICO.items()],
        "bitacora": [{"etapa": _ETAPAS_NOMBRE.get(h.etapa, h.etapa), "comentario": h.comentario, "fecha": h.fecha.isoformat() + "Z" if h.fecha else None,
                      "quien": "Mecánico" if h.actualizado_por == QUIEN_ENLACE else "Taller"} for h in hist],
        "fotos": [{"id": f.id_foto, "url": f"/uploads/{f.ruta_archivo}", "descripcion": f.descripcion} for f in fotos],
        "inspeccion_hecha": db.query(models.Inspeccion.id_inspeccion).filter(models.Inspeccion.id_servicio == s.id_servicio).first() is not None,
        "refacciones_usadas": _refacciones_usadas(db, s, d),
        "cobro": _cobro(db, s),
    }


def _cobro(db: Session, s: models.Servicio) -> dict:
    """Total de la orden, lo ya cobrado y el saldo (mismos cálculos que las órdenes del taller)."""
    from . import servicios as serv  # importación tardía: servicios importa este módulo
    db.expire(s)
    c = serv._calcular_costos(s)
    return {
        "total": c.total, "abonado": c.total_abonado, "saldo": c.saldo_pendiente,
        "pagado": c.total > 0 and c.saldo_pendiente <= 0,
        "abonos": [{"numero": a.numero_abono, "monto": a.monto_abono, "tipo": a.tipo_pago, "cambio": a.cambio or 0,
                    "fecha": a.fecha_pago.isoformat() + "Z" if a.fecha_pago else None}
                   for a in sorted(s.abonos, key=lambda x: x.numero_abono or 0)],
    }


def _resp_conceptos(db: Session, s: models.Servicio, d) -> dict:
    return {"refacciones_usadas": _refacciones_usadas(db, s, d), "bitacora": _progreso(db, s, d)["bitacora"], "cobro": _cobro(db, s)}


class CobroMecanicoIn(BaseModel):
    tipo_pago: Literal["efectivo", "tarjeta", "mixto"] = "efectivo"
    monto: float = Field(default=0, ge=0, le=1000000)
    efectivo: Optional[float] = Field(default=None, ge=0, le=1000000)  # solo mixto
    tarjeta: Optional[float] = Field(default=None, ge=0, le=1000000)  # solo mixto


# --- Refacciones usadas, capturadas desde el enlace (sin precios: eso lo ve el taller) -------------
VENTANA_QUITAR = timedelta(minutes=15)


class RefaccionMecanicoIn(BaseModel):
    id_refaccion: Optional[int] = None
    descripcion: Optional[str] = Field(default=None, max_length=150)  # refacción que no está en el catálogo
    cantidad: int = Field(default=1, ge=1, le=20)
    tipo: Literal["refaccion", "mano_obra"] = "refaccion"
    monto: Optional[float] = Field(default=None, ge=0, le=1000000)  # mano de obra, o precio por pieza de una refacción manual


class EditarRefaccionIn(BaseModel):
    cantidad: Optional[int] = Field(default=None, ge=1, le=99)
    monto: Optional[float] = Field(default=None, ge=0, le=1000000)  # mano de obra: monto; refacción manual: precio por pieza


PREFIJO_MANO_OBRA = "Mano de obra"


def _refacciones_usadas(db: Session, s: models.Servicio, d: Optional[models.ServicioDomicilio] = None) -> list[dict]:
    """Refacciones y mano de obra de la orden. El mecánico puede quitarlas o editarlas mientras la orden siga activa."""
    filas = db.query(models.ServicioDetalle).filter(models.ServicioDetalle.id_servicio == s.id_servicio).order_by(models.ServicioDetalle.orden, models.ServicioDetalle.id_servicio_detalle).all()
    res = []
    for x in filas:
        es_mo = not x.id_refaccion and bool(x.descripcion) and x.descripcion.startswith(PREFIJO_MANO_OBRA)
        sin_precio_libre = bool(x.descripcion) and not x.id_refaccion and not (x.costo_mano_obra or x.costo_refaccion or x.costo_extra)
        libre_con_precio = bool(x.descripcion) and not x.id_refaccion and not es_mo and (x.costo_refaccion or 0) > 0 and not (x.costo_mano_obra or x.costo_extra)
        if not (x.id_refaccion or sin_precio_libre or es_mo or libre_con_precio):
            continue
        nombre = x.descripcion or (x.refaccion.nombre_refaccion if x.refaccion else "Refacción")
        if es_mo:
            nombre = nombre[len(PREFIJO_MANO_OBRA):].lstrip(": ").strip() or "Mano de obra"
        res.append({"id": x.id_servicio_detalle, "nombre": nombre, "cantidad": x.cantidad or 1, "catalogo": bool(x.id_refaccion), "puede_quitar": True, "puede_editar": True, "tipo": "mano_obra" if es_mo else "refaccion",
                    "monto": float(x.costo_mano_obra or 0) if es_mo else round(float(x.costo_refaccion or 0) / (x.cantidad or 1), 2)})
    return res


def _inventario_para(db: Session, s: models.Servicio, id_refaccion: int):
    v = s.vehiculo
    if not (v and v.id_marca_vehiculo):
        return None
    return (
        db.query(models.InventarioRefaccion).join(models.InventarioRefaccionCompatibilidad)
        .filter(models.InventarioRefaccion.id_refaccion == id_refaccion,
                models.InventarioRefaccionCompatibilidad.id_marca_vehiculo == v.id_marca_vehiculo,
                models.InventarioRefaccionCompatibilidad.id_modelo_vehiculo == v.id_modelo_vehiculo)
        .first()
    )


def _orden_activa_o_error(db: Session, token: str):
    """Para las acciones del mecánico: enlace válido, orden abierta y servicio YA iniciado con el código."""
    d = _por_token(db, token)
    if not d:
        return None, None, _respuesta(404, {"codigo": "no_valido", "mensaje": MENSAJE_NO_VALIDO})
    s = db.query(models.Servicio).filter(models.Servicio.id_servicio == d.id_servicio).first()
    if not s or s.status != "abierto":
        return None, None, _respuesta(410, {"codigo": "finalizada", "mensaje": MENSAJE_FINALIZADA})
    if not d.iniciado_at:
        return None, None, _respuesta(403, {"codigo": "sin_iniciar", "mensaje": "Primero captura el código del cliente para iniciar el servicio."})
    return d, s, None


def _por_token(db: Session, token: str) -> Optional[models.ServicioDomicilio]:
    if not _TOKEN_RE.match(token or ""):
        return None
    d = (
        db.query(models.ServicioDomicilio).execution_options(sin_filtro_taller=True)
        .filter(models.ServicioDomicilio.token_hash == _hash(token))
        .first()
    )
    if not d or d.id_taller is None:
        return None
    fijar_tenant(db, MODO_TALLER, d.id_taller)
    return d


@publico.get("/{token}")
@limiter.limit("30/minute")
def consultar(request: Request, token: str, db: Session = Depends(db_publica)):
    d = _por_token(db, token)
    if not d:
        return _respuesta(404, {"codigo": "no_valido", "mensaje": MENSAJE_NO_VALIDO})
    s = (
        db.query(models.Servicio)
        .options(
            joinedload(models.Servicio.cliente),
            joinedload(models.Servicio.vehiculo).joinedload(models.Vehiculo.marca),
            joinedload(models.Servicio.vehiculo).joinedload(models.Vehiculo.modelo),
        )
        .filter(models.Servicio.id_servicio == d.id_servicio)
        .first()
    )
    if not s:
        return _respuesta(404, {"codigo": "no_valido", "mensaje": MENSAJE_NO_VALIDO})
    from ..suscripciones import estado_taller
    info = estado_taller(db, d.id_taller)
    if info and info.get("bloqueado"):
        return _respuesta(404, {"codigo": "no_valido", "mensaje": MENSAJE_NO_VALIDO})
    taller = db.query(models.ConfiguracionTaller).first()
    if s.status != "abierto":
        return _respuesta(410, {"codigo": "finalizada", "mensaje": MENSAJE_FINALIZADA, "taller": taller.nombre_taller if taller else None})
    c = s.cliente
    return _respuesta(200, {
        "taller": {"nombre": taller.nombre_taller if taller else None, "telefono": taller.telefono if taller else None},
        "orden": {
            "folio": s.id_servicio,
            "servicio": s.nombre_servicio,
            "diagnostico": s.diagnostico,
            "vehiculo": _vehiculo_txt(s.vehiculo),
            "placas": s.vehiculo.placas_vehiculo if s.vehiculo else None,
            "fecha": s.fecha_entrada_servicio.isoformat() if s.fecha_entrada_servicio else None,
        },
        "cliente": {"nombre": _cliente_corto(c), "telefono": (c.telefono1 or c.telefono2) if c else None},
        "domicilio": {
            "direccion": _direccion_txt(d) or None,
            "referencias": d.referencias,
            "lat": d.lat, "lng": d.lng,
            "maps_url": _maps_url(d),
        },
        "iniciado": bool(d.iniciado_at),
        "bloqueado": bool(d.codigo_bloqueado),
        "intentos_restantes": max(MAX_INTENTOS - (d.codigo_intentos or 0), 0),
        "siguientes": _siguientes(db, d),
        **_progreso(db, s, d),
        "actualizado": datetime.utcnow().isoformat() + "Z",
    })


@publico.post("/{token}/iniciar")
@limiter.limit("12/minute")
def iniciar_publico(request: Request, token: str, payload: CodigoIn, db: Session = Depends(db_publica)):
    d = _por_token(db, token)
    if not d:
        return _respuesta(404, {"codigo": "no_valido", "mensaje": MENSAJE_NO_VALIDO})
    s = db.query(models.Servicio).filter(models.Servicio.id_servicio == d.id_servicio).first()
    if not s or s.status != "abierto":
        return _respuesta(410, {"codigo": "finalizada", "mensaje": MENSAJE_FINALIZADA})
    try:
        _verificar_codigo(db, d, payload.codigo, "mecanico (enlace)")
    except HTTPException as e:
        return _respuesta(e.status_code, {"codigo": "codigo", "mensaje": e.detail})
    return _respuesta(200, {"iniciado": True})


@publico.get("/{token}/refacciones/buscar")
@limiter.limit("60/minute")
def buscar_refacciones_publico(request: Request, token: str, q: str = "", db: Session = Depends(db_publica)):
    d, s, error = _orden_activa_o_error(db, token)
    if error:
        return error
    q = (q or "").strip()[:60]
    if len(q) < 2:
        return _respuesta(200, {"resultados": []})
    from ..busqueda import coincide
    todas = db.query(models.Refaccion).order_by(models.Refaccion.nombre_refaccion).all()
    filas = [r for r in todas if coincide(q, r.nombre_refaccion, r.numero_refaccion, r.categoria, r.subcategoria,
                                          r.sku_interno, r.codigo_barras)][:40]
    res = []
    for r in filas:
        inv = _inventario_para(db, s, r.id_refaccion)
        res.append({"id": r.id_refaccion, "nombre": r.nombre_refaccion, "numero": r.numero_refaccion, "categoria": r.categoria,
                    "stock": inv.cantidad if inv else (r.cantidad_refaccion or 0), "compatible": bool(inv)})
    res.sort(key=lambda x: (not x["compatible"], x["nombre"]))
    return _respuesta(200, {"resultados": res[:25]})


@publico.post("/{token}/refacciones")
@limiter.limit("30/minute")
def agregar_refaccion_publico(request: Request, token: str, payload: RefaccionMecanicoIn, db: Session = Depends(db_publica)):
    d, s, error = _orden_activa_o_error(db, token)
    if error:
        return error
    from . import servicios as serv  # importación tardía: servicios importa este módulo
    from .. import schemas
    descripcion = _texto(payload.descripcion, 150)
    if payload.id_refaccion:
        ref = db.query(models.Refaccion).filter(models.Refaccion.id_refaccion == payload.id_refaccion).first()
        if not ref:
            return _respuesta(400, {"codigo": "refaccion", "mensaje": "Esa refacción no existe."})
        inv = _inventario_para(db, s, ref.id_refaccion)
        # No se valida existencia: si coincide con el inventario del vehículo se descuenta (servicios.agregar_detalle).
        precio = ((inv.preciocliente if inv else ref.preciocliente_refaccion) or (inv.preciopropio if inv else ref.preciopropio_refaccion) or 0)
        if payload.monto:  # precio capturado por el mecánico: sustituye al del catálogo
            precio = payload.monto
        detalle = schemas.ServicioDetalleIn(id_refaccion=ref.id_refaccion, descripcion=ref.nombre_refaccion, cantidad=payload.cantidad, costo_refaccion=round(precio * payload.cantidad, 2))
        nombre = ref.nombre_refaccion
    elif payload.tipo == "mano_obra":
        if not payload.monto or payload.monto <= 0:
            return _respuesta(400, {"codigo": "monto", "mensaje": "Captura el monto de la mano de obra."})
        detalle = schemas.ServicioDetalleIn(descripcion=PREFIJO_MANO_OBRA, cantidad=1, costo_mano_obra=round(payload.monto, 2))
        nombre = f"Mano de obra ${payload.monto:,.2f}"
    elif descripcion:
        # Precio por pieza opcional; si no lo captura, el taller lo pone después.
        total = round((payload.monto or 0) * payload.cantidad, 2)
        detalle = schemas.ServicioDetalleIn(descripcion=descripcion, cantidad=payload.cantidad, costo_refaccion=total)
        nombre = descripcion
    else:
        return _respuesta(400, {"codigo": "refaccion", "mensaje": "Elige una refacción o escribe su nombre."})
    try:
        serv.agregar_detalle(s.id_servicio, detalle, db, None)
    except HTTPException as e:
        return _respuesta(e.status_code, {"codigo": "refaccion", "mensaje": e.detail})
    db.add(models.ServicioEtapaHistorial(id_servicio=s.id_servicio, etapa=s.etapa or "en_reparacion", actualizado_por=QUIEN_ENLACE,
                                         comentario=(f"{nombre}" if payload.tipo == "mano_obra" and not payload.id_refaccion else f"Refacción usada: {nombre} x{payload.cantidad}")[:255]))
    db.commit()
    return _respuesta(200, _resp_conceptos(db, s, d))


@publico.put("/{token}/refacciones/{id_detalle}")
@limiter.limit("30/minute")
def editar_refaccion_publico(request: Request, token: str, id_detalle: int, payload: EditarRefaccionIn, db: Session = Depends(db_publica)):
    d, s, error = _orden_activa_o_error(db, token)
    if error:
        return error
    item = next((x for x in _refacciones_usadas(db, s, d) if x["id"] == id_detalle), None)
    det = db.query(models.ServicioDetalle).filter(models.ServicioDetalle.id_servicio_detalle == id_detalle, models.ServicioDetalle.id_servicio == s.id_servicio).first()
    if not item or not det:
        return _respuesta(404, {"codigo": "no_editar", "mensaje": "Ese concepto ya no está en la orden."})
    if item["tipo"] == "mano_obra":
        if not payload.monto or payload.monto <= 0:
            return _respuesta(400, {"codigo": "monto", "mensaje": "Captura el monto de la mano de obra."})
        det.costo_mano_obra = round(payload.monto, 2)
        cambio = f"Mano de obra editada: ${payload.monto:,.2f}"
    else:
        anterior = det.cantidad or 1
        nueva = payload.cantidad or anterior
        if nueva != anterior and det.id_refaccion:
            delta = nueva - anterior  # >0 usa más piezas del inventario; <0 regresa
            inv = db.query(models.InventarioRefaccion).filter(models.InventarioRefaccion.id_inventario_refaccion == det.id_inventario_refaccion).first() if det.id_inventario_refaccion else None
            if inv:
                inv.cantidad = max((inv.cantidad or 0) - delta, 0)
            else:
                ref = db.query(models.Refaccion).filter(models.Refaccion.id_refaccion == det.id_refaccion).first()
                if ref:
                    ref.cantidad_refaccion = max((ref.cantidad_refaccion or 0) - delta, 0)
        unit = payload.monto if payload.monto else (det.costo_refaccion or 0) / anterior
        det.costo_refaccion = round(unit * nueva, 2)
        det.cantidad = nueva
        cambio = f"Refacción editada: {item['nombre']} x{nueva}"
    db.add(models.ServicioEtapaHistorial(id_servicio=s.id_servicio, etapa=s.etapa or "en_reparacion", actualizado_por=QUIEN_ENLACE, comentario=cambio[:255]))
    db.commit()
    from . import servicios as serv
    serv._sincronizar_pagado(db, s.id_servicio)
    return _respuesta(200, _resp_conceptos(db, s, d))


@publico.post("/{token}/cobro")
@limiter.limit("10/minute")
def cobrar_publico(request: Request, token: str, payload: CobroMecanicoIn, db: Session = Depends(db_publica)):
    """El mecánico cobra en el domicilio: se registra un abono igual que en la orden (efectivo, tarjeta o mixto)."""
    d, s, error = _orden_activa_o_error(db, token)
    if error:
        return error
    from . import servicios as serv
    from .. import schemas
    ef = tar = None
    monto = round(payload.monto, 2)
    if payload.tipo_pago == "mixto":
        ef, tar = round(payload.efectivo or 0, 2), round(payload.tarjeta or 0, 2)
        monto = round(ef + tar, 2)
    if monto <= 0:
        return _respuesta(400, {"codigo": "monto", "mensaje": "Captura el monto a cobrar."})
    db.expire(s)
    saldo = serv._calcular_costos(s).saldo_pendiente
    if saldo <= 0:
        return _respuesta(400, {"codigo": "pagada", "mensaje": "Esta orden ya está pagada."})
    try:
        serv.agregar_abono(s.id_servicio, schemas.ServicioAbonoIn(
            monto_abono=monto, tipo_pago=payload.tipo_pago, desglose_mixto_efectivo=ef, desglose_mixto_tarjeta=tar,
            comentario="Cobrado por el mecánico desde el enlace"), db, None)
    except HTTPException as e:
        return _respuesta(e.status_code, {"codigo": "cobro", "mensaje": e.detail})
    aplicado = min(monto, saldo)
    db.add(models.ServicioEtapaHistorial(id_servicio=s.id_servicio, etapa=s.etapa or "en_reparacion", actualizado_por=QUIEN_ENLACE,
                                         comentario=f"Cobro registrado: ${aplicado:,.2f} ({payload.tipo_pago})"[:255]))
    db.commit()
    resp = _resp_conceptos(db, s, d)
    resp["cambio"] = round(max(monto - saldo, 0), 2)
    return _respuesta(200, resp)


@publico.post("/{token}/finalizar")
@limiter.limit("5/minute")
async def finalizar_publico(request: Request, token: str, bg: BackgroundTasks, db: Session = Depends(db_publica)):
    """El mecánico finaliza desde su enlace: cierra la orden (mismo proceso que el taller), el cliente recibe la nota
    y se devuelve lo necesario para mandársela por WhatsApp con el enlace al PDF."""
    d, s, error = _orden_activa_o_error(db, token)
    if error:
        return error
    from . import servicios as serv
    from .. import schemas
    db.expire(s)
    if not s.detalles:
        return _respuesta(400, {"codigo": "sin_conceptos", "mensaje": "Agrega al menos una refacción o mano de obra antes de finalizar."})
    saldo = serv._calcular_costos(s).saldo_pendiente
    if saldo > 0.005:
        return _respuesta(400, {"codigo": "saldo", "mensaje": f"Aún hay un saldo de ${saldo:,.2f}. Registra el cobro antes de finalizar."})

    class _Enlace:  # «usuario» que queda en la bitácora
        username = QUIEN_ENLACE

    try:
        await serv.finalizar_orden(s.id_servicio, schemas.FinalizarServicioIn(notificar_cliente=True), db, _Enlace())
    except HTTPException as e:
        return _respuesta(e.status_code, {"codigo": "finalizar", "mensaje": e.detail})

    s = db.query(models.Servicio).filter(models.Servicio.id_servicio == d.id_servicio).first()
    costos = serv._calcular_costos(s)
    taller = db.query(models.ConfiguracionTaller).first()
    nombre_taller = (taller.nombre_taller if taller else None) or "tu taller"
    base = (os.getenv("URL_PUBLICA") or "").strip().rstrip("/")
    nota_url = f"{base}/api/domicilio/{token}/nota" if base else None
    cliente = s.cliente
    tel = (cliente.telefono1 or cliente.telefono2) if cliente else None
    nombre = _cliente_corto(cliente) or ""
    texto = (f"Hola {nombre}, gracias por confiar en {nombre_taller}. Tu servicio a domicilio (orden #{s.id_servicio}) quedó finalizado ✅\n"
             f"Total: ${costos.total:,.2f}.").replace("Hola ,", "Hola,")
    if nota_url:
        texto += f"\nAquí puedes ver y descargar tu nota: {nota_url}"
    if tel and whatsapp_envio.configurado():
        bg.add_task(whatsapp_envio.enviar, tel, texto, os.getenv("WHATSAPP_PLANTILLA_NOTA") or None, [nombre or "cliente", str(s.id_servicio), f"${costos.total:,.2f}", nota_url or ""])
    return _respuesta(200, {"finalizado": True, "folio": s.id_servicio, "total": costos.total, "cliente": nombre or None, "cliente_telefono": tel,
                            "taller": nombre_taller, "nota_url": nota_url, "mensaje_whatsapp": texto, "enviado_auto": bool(tel and whatsapp_envio.configurado())})


@publico.get("/{token}/nota")
@limiter.limit("20/minute")
def nota_publica(request: Request, token: str, db: Session = Depends(db_publica)):
    """Nota de remisión en PDF de una orden ya finalizada (el enlace del mecánico es el permiso)."""
    d = _por_token(db, token)
    if not d:
        return _respuesta(404, {"codigo": "no_valido", "mensaje": MENSAJE_NO_VALIDO})
    from . import servicios as serv
    from ..nota_remision_pdf import generar_nota_remision_pdf
    from ..inspeccion_pdf import inspeccion_de_servicio
    s = serv._get_servicio_o_404(db, d.id_servicio)
    if s.status != "cerrado":
        return _respuesta(404, {"codigo": "sin_nota", "mensaje": "La nota estará disponible cuando se finalice el servicio."})
    taller = db.query(models.ConfiguracionTaller).first()
    pdf = generar_nota_remision_pdf(s, serv._calcular_costos(s), taller, inspeccion_de_servicio(db, models, s.id_servicio))
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="{serv._nombre_pdf(s, "Nota")}"', "Cache-Control": "no-store"})


@publico.delete("/{token}/refacciones/{id_detalle}")
@limiter.limit("30/minute")
def quitar_refaccion_publico(request: Request, token: str, id_detalle: int, db: Session = Depends(db_publica)):
    d, s, error = _orden_activa_o_error(db, token)
    if error:
        return error
    permitido = next((x for x in _refacciones_usadas(db, s, d) if x["id"] == id_detalle and x["puede_quitar"]), None)
    if not permitido:
        return _respuesta(404, {"codigo": "no_quitar", "mensaje": "Ese concepto ya no está en la orden."})
    from . import servicios as serv
    try:
        serv.eliminar_detalle(s.id_servicio, id_detalle, db, None)
    except HTTPException as e:
        return _respuesta(e.status_code, {"codigo": "refaccion", "mensaje": e.detail})
    db.add(models.ServicioEtapaHistorial(id_servicio=s.id_servicio, etapa=s.etapa or "en_reparacion", actualizado_por=QUIEN_ENLACE,
                                         comentario=f"Refacción quitada: {permitido['nombre']}"[:255]))
    db.commit()
    return _respuesta(200, _resp_conceptos(db, s, d))


@publico.post("/{token}/etapa")
@limiter.limit("30/minute")
async def etapa_publico(request: Request, token: str, payload: EtapaMecanicoIn, db: Session = Depends(db_publica)):
    d, s, error = _orden_activa_o_error(db, token)
    if error:
        return error
    if payload.etapa not in ETAPAS_MECANICO:
        return _respuesta(400, {"codigo": "etapa", "mensaje": "Esa etapa no se puede marcar desde el enlace."})
    comentario = _texto(payload.comentario, 250)
    if s.etapa != payload.etapa or comentario:
        s.etapa = payload.etapa
        db.add(models.ServicioEtapaHistorial(id_servicio=s.id_servicio, etapa=payload.etapa, comentario=comentario, actualizado_por=QUIEN_ENLACE))
        db.commit()
        await manager.difundir(s.id_servicio, {"tipo": "etapa", "etapa": payload.etapa, "comentario": comentario, "actualizado_por": QUIEN_ENLACE})
        c = db.query(models.Cliente).filter(models.Cliente.id_cliente == s.id_cliente).first() if s.id_cliente else None
        if c and c.push_token:
            await enviar_push(c.push_token, "Actualización de tu servicio", f"Orden #{s.id_servicio}: {ETAPAS_MECANICO[payload.etapa]}", {"id_servicio": s.id_servicio, "tipo": "etapa"})
    return _respuesta(200, _progreso(db, s))


@publico.post("/{token}/nota")
@limiter.limit("30/minute")
async def nota_publico(request: Request, token: str, payload: NotaMecanicoIn, db: Session = Depends(db_publica)):
    d, s, error = _orden_activa_o_error(db, token)
    if error:
        return error
    texto = _texto(payload.texto, 250)
    if not texto:
        return _respuesta(400, {"codigo": "nota", "mensaje": "Escribe la nota."})
    db.add(models.ServicioEtapaHistorial(id_servicio=s.id_servicio, etapa=s.etapa or "en_reparacion", comentario=texto, actualizado_por=QUIEN_ENLACE))
    db.commit()
    await manager.difundir(s.id_servicio, {"tipo": "etapa", "etapa": s.etapa, "comentario": texto, "actualizado_por": QUIEN_ENLACE})
    return _respuesta(200, _progreso(db, s))


# --- Inspección del vehículo desde el enlace (misma inspección que la orden en el panel) ----------
class ResultadoInspIn(BaseModel):
    id_item: int
    estado: str = Field(pattern="^(bien|regular|mal)$")
    comentario: Optional[str] = Field(default=None, max_length=255)


class InspeccionMecanicoIn(BaseModel):
    comentario_general: Optional[str] = Field(default=None, max_length=1000)
    resultados: list[ResultadoInspIn] = Field(default_factory=list, max_length=300)


MAX_FOTOS_PUNTO = 6
MAX_FOTOS_INSPECCION = 60


def _inspeccion_de(db: Session, s: models.Servicio) -> Optional[models.Inspeccion]:
    return (
        db.query(models.Inspeccion).options(joinedload(models.Inspeccion.resultados))
        .filter(models.Inspeccion.id_servicio == s.id_servicio)
        .order_by(models.Inspeccion.fecha.desc()).first()
    )


def _inspeccion_salida(db: Session, s: models.Servicio) -> dict:
    items = db.query(models.InspeccionItem).filter(models.InspeccionItem.activo == True).order_by(models.InspeccionItem.categoria, models.InspeccionItem.orden).all()  # noqa: E712
    insp = _inspeccion_de(db, s)
    fotos: dict[str, list] = {}
    if insp:
        for f in db.query(models.Foto).filter(models.Foto.entidad_tipo == "inspeccion_item", models.Foto.entidad_id == insp.id_inspeccion).order_by(models.Foto.fecha).all():
            fotos.setdefault(str(f.descripcion), []).append({"id_foto": f.id_foto, "ruta_archivo": f.ruta_archivo})
    return {
        "items": [{"id_item": i.id_item, "categoria": i.categoria, "nombre_item": i.nombre_item, "orden": i.orden} for i in items],
        "inspeccion": {
            "id_inspeccion": insp.id_inspeccion, "comentario_general": insp.comentario_general,
            "resultados": [{"id_item": r.id_item, "estado": r.estado, "comentario": r.comentario, "id_refaccion_sugerida": None} for r in insp.resultados],
        } if insp else None,
        "fotos_puntos": fotos,
    }


@publico.get("/{token}/inspeccion")
@limiter.limit("30/minute")
def inspeccion_publico(request: Request, token: str, db: Session = Depends(db_publica)):
    d, s, error = _orden_activa_o_error(db, token)
    if error:
        return error
    return _respuesta(200, _inspeccion_salida(db, s))


@publico.put("/{token}/inspeccion")
@limiter.limit("30/minute")
def guardar_inspeccion_publico(request: Request, token: str, payload: InspeccionMecanicoIn, db: Session = Depends(db_publica)):
    d, s, error = _orden_activa_o_error(db, token)
    if error:
        return error
    if not s.id_vehiculo:
        return _respuesta(400, {"codigo": "sin_vehiculo", "mensaje": "La orden no tiene vehículo registrado; avisa al taller."})
    validos = {i for (i,) in db.query(models.InspeccionItem.id_item).filter(models.InspeccionItem.activo == True).all()}  # noqa: E712
    vistos: dict[int, ResultadoInspIn] = {r.id_item: r for r in payload.resultados if r.id_item in validos}
    insp = _inspeccion_de(db, s)
    nueva = insp is None
    if nueva:
        insp = models.Inspeccion(id_vehiculo=s.id_vehiculo, id_servicio=s.id_servicio, realizada_por=QUIEN_ENLACE)
        db.add(insp)
        db.flush()
    insp.comentario_general = _texto(payload.comentario_general, 1000)
    db.query(models.InspeccionResultado).filter(models.InspeccionResultado.id_inspeccion == insp.id_inspeccion).delete()
    for r in vistos.values():
        db.add(models.InspeccionResultado(id_inspeccion=insp.id_inspeccion, id_item=r.id_item, estado=r.estado, comentario=_texto(r.comentario, 255)))
    malos = sum(1 for r in vistos.values() if r.estado == "mal")
    regulares = sum(1 for r in vistos.values() if r.estado == "regular")
    db.add(models.ServicioEtapaHistorial(
        id_servicio=s.id_servicio, etapa=s.etapa or "en_reparacion", actualizado_por=QUIEN_ENLACE,
        comentario=f"Inspección {'realizada' if nueva else 'actualizada'}: {malos} en mal estado, {regulares} regulares",
    ))
    db.commit()
    return _respuesta(200, {**_inspeccion_salida(db, s), "id_inspeccion": insp.id_inspeccion})


@publico.post("/{token}/inspeccion/foto")
@limiter.limit("30/minute")
async def foto_inspeccion_publico(request: Request, token: str, id_item: int = Form(...), archivo: UploadFile = File(...), db: Session = Depends(db_publica)):
    d, s, error = _orden_activa_o_error(db, token)
    if error:
        return error
    insp = _inspeccion_de(db, s)
    if not insp:
        return _respuesta(400, {"codigo": "sin_inspeccion", "mensaje": "Guarda primero el avance de la inspección."})
    if not db.query(models.InspeccionItem).filter(models.InspeccionItem.id_item == id_item, models.InspeccionItem.activo == True).first():  # noqa: E712
        return _respuesta(400, {"codigo": "punto", "mensaje": "Ese punto de inspección no existe."})
    base = db.query(models.Foto).filter(models.Foto.entidad_tipo == "inspeccion_item", models.Foto.entidad_id == insp.id_inspeccion)
    if base.count() >= MAX_FOTOS_INSPECCION or base.filter(models.Foto.descripcion == str(id_item)).count() >= MAX_FOTOS_PUNTO:
        return _respuesta(400, {"codigo": "limite", "mensaje": f"Máximo {MAX_FOTOS_PUNTO} fotos por punto."})
    try:
        contenido, extension = await leer_y_validar_imagen(archivo)
    except HTTPException as e:
        return _respuesta(e.status_code, {"codigo": "foto", "mensaje": e.detail})
    nombre = nombre_unico(f"inspeccion_item_{insp.id_inspeccion}", extension)
    guardar_archivo(_CARPETA_UPLOADS, nombre, contenido)
    foto = models.Foto(entidad_tipo="inspeccion_item", entidad_id=insp.id_inspeccion, ruta_archivo=nombre, descripcion=str(id_item), subida_por=QUIEN_ENLACE)
    db.add(foto)
    db.commit()
    db.refresh(foto)
    return _respuesta(200, {"id_foto": foto.id_foto, "ruta_archivo": foto.ruta_archivo})


@publico.delete("/{token}/inspeccion/foto/{id_foto}")
@limiter.limit("30/minute")
def borrar_foto_inspeccion_publico(request: Request, token: str, id_foto: int, db: Session = Depends(db_publica)):
    d, s, error = _orden_activa_o_error(db, token)
    if error:
        return error
    insp = _inspeccion_de(db, s)
    foto = db.query(models.Foto).filter(models.Foto.id_foto == id_foto).first() if insp else None
    if not foto or foto.entidad_tipo != "inspeccion_item" or foto.entidad_id != insp.id_inspeccion or foto.subida_por != QUIEN_ENLACE:
        return _respuesta(404, {"codigo": "foto", "mensaje": "Foto no encontrada."})
    almacenamiento.borrar(foto.ruta_archivo)
    db.delete(foto)
    db.commit()
    return _respuesta(200, {"ok": True})


@publico.post("/{token}/foto")
@limiter.limit("20/minute")
async def foto_publico(request: Request, token: str, archivo: UploadFile = File(...), descripcion: Optional[str] = Form(None), db: Session = Depends(db_publica)):
    d, s, error = _orden_activa_o_error(db, token)
    if error:
        return error
    ya = db.query(models.Foto).filter(models.Foto.entidad_tipo == "servicio", models.Foto.entidad_id == s.id_servicio, models.Foto.subida_por == QUIEN_ENLACE).count()
    if ya >= MAX_FOTOS_ENLACE:
        return _respuesta(400, {"codigo": "limite", "mensaje": f"Ya subiste {MAX_FOTOS_ENLACE} fotos a esta orden."})
    try:
        contenido, extension = await leer_y_validar_imagen(archivo)
    except HTTPException as e:
        return _respuesta(e.status_code, {"codigo": "foto", "mensaje": e.detail})
    nombre = nombre_unico(f"servicio_{s.id_servicio}", extension)
    guardar_archivo(_CARPETA_UPLOADS, nombre, contenido)
    db.add(models.Foto(entidad_tipo="servicio", entidad_id=s.id_servicio, ruta_archivo=nombre, descripcion=_texto(descripcion, 200), subida_por=QUIEN_ENLACE))
    db.commit()
    return _respuesta(200, _progreso(db, s))


# --- Panel / app (con sesión) --------------------------------------------------
class DomicilioIn(BaseModel):
    calle: Optional[str] = None
    numero: Optional[str] = None
    colonia: Optional[str] = None
    cp: Optional[str] = None
    ciudad: Optional[str] = None
    estado: Optional[str] = None
    referencias: Optional[str] = None
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lng: Optional[float] = Field(default=None, ge=-180, le=180)
    maps_url: Optional[str] = None
    id_empleado_mecanico: Optional[int] = None


def _orden_o_404(db: Session, id_servicio: int) -> models.Servicio:
    s = db.query(models.Servicio).options(joinedload(models.Servicio.cliente)).filter(models.Servicio.id_servicio == id_servicio).first()
    if not s:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    return s


def _dom(db: Session, id_servicio: int) -> Optional[models.ServicioDomicilio]:
    return db.query(models.ServicioDomicilio).filter(models.ServicioDomicilio.id_servicio == id_servicio).first()


def _mecanico(db: Session, d: models.ServicioDomicilio):
    if not d.id_empleado_mecanico:
        return None
    return db.query(models.Empleado).filter(models.Empleado.id_empleado == d.id_empleado_mecanico).first()


def _salida(db: Session, s: models.Servicio, d: Optional[models.ServicioDomicilio]) -> dict:
    if not d:
        return {"existe": False}
    token = d.token_cifrado if d.token_cifrado and _TOKEN_RE.match(d.token_cifrado) else None
    m = _mecanico(db, d)
    c = s.cliente
    return {
        "existe": True,
        "id_servicio": s.id_servicio,
        "calle": d.calle, "numero": d.numero, "colonia": d.colonia, "cp": d.cp, "ciudad": d.ciudad, "estado": d.estado,
        "referencias": d.referencias,
        "lat": d.lat, "lng": d.lng,
        "direccion": _direccion_txt(d) or None,
        "maps_url": _maps_url(d),
        "id_empleado_mecanico": d.id_empleado_mecanico,
        "mecanico": " ".join(x for x in [m.nombre, m.paterno] if x) if m else None,
        "mecanico_telefono": m.telefono if m else None,
        "cliente": _cliente_corto(c),
        "cliente_telefono": (c.telefono1 or c.telefono2) if c else None,
        "enlace": _url(token) if token else None,
        "requiere_regenerar_enlace": not token,
        "codigo": None if d.iniciado_at else d.codigo_cifrado,
        "codigo_bloqueado": bool(d.codigo_bloqueado),
        "intentos_restantes": max(MAX_INTENTOS - (d.codigo_intentos or 0), 0),
        "iniciado_at": d.iniciado_at,
        "iniciado_por": d.iniciado_por,
        "nota_enviada_at": d.nota_enviada_at,
    }


def _programar_envios(bg: BackgroundTasks, out: dict, cliente: bool = False, mecanico: bool = False) -> dict:
    """Manda por WhatsApp, en segundo plano y sin intervención del mecánico, el código al cliente y/o el enlace al mecánico."""
    res = {"activo": whatsapp_envio.configurado(), "cliente": False, "mecanico": False}
    if not res["activo"]:
        return res
    orden, direccion = out.get("id_servicio"), out.get("direccion") or "ubicación en el mapa"
    if cliente and out.get("codigo") and out.get("cliente_telefono"):
        nombre = out.get("cliente") or ""
        texto = (f"Hola {nombre}, tu servicio a domicilio (orden #{orden}) quedó confirmado ✅\nDirección: {direccion}\n"
                 f"Cuando llegue el mecánico dale este código para que pueda iniciar: {out['codigo']}\nSin el código no podrá comenzar.").replace("Hola ,", "Hola,")
        bg.add_task(whatsapp_envio.enviar, out["cliente_telefono"], texto, os.getenv("WHATSAPP_PLANTILLA_CLIENTE") or None,
                    [nombre or "cliente", str(orden), direccion, out["codigo"]])
        res["cliente"] = True
    if mecanico and out.get("enlace") and str(out["enlace"]).startswith("http") and out.get("mecanico_telefono"):
        texto = (f"Servicio a domicilio (orden #{orden})\nDirección: {direccion}\nAbre aquí la ubicación y los datos: {out['enlace']}\n"
                 "Pide al cliente el código de 6 dígitos para iniciar.")
        bg.add_task(whatsapp_envio.enviar, out["mecanico_telefono"], texto, os.getenv("WHATSAPP_PLANTILLA_MECANICO") or None,
                    [f"Orden #{orden}", direccion, out["enlace"]])
        res["mecanico"] = True
    return res


# --- Resolver ubicación: enlace de Maps / coordenadas -> dirección -----------------
_HOST_MAPAS = re.compile(r"^(www\.)?(google\.[a-z.]+|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl|waze\.com)$", re.I)
_UA = {"User-Agent": "ALDM-AutoCore/1.0 (servicio a domicilio)", "Accept-Language": "es"}


class UbicacionIn(BaseModel):
    url: Optional[str] = Field(default=None, max_length=500)
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lng: Optional[float] = Field(default=None, ge=-180, le=180)


def _host_permitido(url: str) -> bool:
    p = urlparse(url)
    return p.scheme == "https" and bool(p.hostname) and bool(_HOST_MAPAS.match(p.hostname)) and p.port in (None, 443)


_RE_CALLE = re.compile(r"^(calle|av\.?|avenida|blvd\.?|boulevard|bulevar|calzada|calz\.?|privada|priv\.?|prol\.?|prolongaci[oó]n|andador|camino|carretera|carr\.?|callej[oó]n|cjon\.?|cerrada|cda\.?|cerr\.?|paseo|circuito|cto\.?|cir\.?|retorno|eje|perif[eé]rico|diagonal|viaducto|rinconada|jard[ií]n|jdn\.?|jard\.?|pri?v\.?|andr\.?|brecha|vereda|pasaje|plaza|glorieta)(?=[\s.]|$)", re.I)
_ABREV = {"jdn": "Jardín", "jard": "Jardín", "cjon": "Callejón", "prol": "Prolongación", "priv": "Privada", "blvd": "Boulevard", "cda": "Cerrada", "cerr": "Cerrada", "calz": "Calzada", "cto": "Circuito", "cir": "Circuito", "carr": "Carretera", "av": "Avenida", "andr": "Andador"}


def _expandir_abrev(calle: str) -> str:
    m = re.match(r"^([A-Za-zñÑ]+)\.?\s+(.*)$", calle)
    if m and m.group(1).lower() in _ABREV:
        return f"{_ABREV[m.group(1).lower()]} {m.group(2)}"
    return calle


def _lugar_de_url(url: str) -> Optional[str]:
    m = re.search(r"/maps/place/([^/@?]+)", url or "")
    if not m:
        return None
    txt = unquote_plus(m.group(1)).strip()
    return None if (not txt or re.match(r"^-?\d+(\.\d+)?\s*,", txt)) else txt


def _campos_de_lugar(txt: Optional[str]) -> dict:
    """Dirección escrita por Google en el enlace: «Calle X 322, Colonia, 37530 León, Gto.»"""
    partes = [p.strip() for p in (txt or "").split(",") if p.strip()]
    if not partes:
        return {}
    m = re.match(r"^(.*?)\s+(\d+[A-Za-z]?(?:-\d+)?)$", partes[0])
    # Si no parece calle (ni por su nombre ni por terminar en número) puede ser un negocio: se ignora
    if not (_RE_CALLE.match(partes[0]) or m):
        return {}
    out: dict = {}
    out["calle"], out["numero"] = (m.group(1), m.group(2)) if m else (partes[0], None)
    out["calle"] = _expandir_abrev(out["calle"])
    resto = partes[1:]
    for p in list(resto):
        m = re.match(r"^(\d{5})\s+(.+)$", p)
        if m:
            out["cp"], out["ciudad"] = m.group(1), m.group(2)
            resto.remove(p)
            break
    if resto:
        out["colonia"] = resto[0]
    return out


async def _coordenadas_de_url(url: str) -> tuple[Optional[tuple[float, float]], Optional[str]]:
    """Sigue (máx. 5) redirecciones de un enlace corto de Maps SOLO por hosts de mapas permitidos.
    Devuelve (coordenadas, texto del lugar que Google puso en la URL)."""
    lugar = None
    async with httpx.AsyncClient(timeout=8, follow_redirects=False, headers=_UA) as cli:
        for _ in range(5):
            lugar = lugar or _lugar_de_url(url)
            co = coordenadas_de_enlace(url)
            if co:
                return co, lugar
            if not _host_permitido(url):
                return None, lugar
            r = await cli.get(url)
            destino = r.headers.get("location")
            if r.status_code in (301, 302, 303, 307, 308) and destino:
                url = urljoin(url, destino)
                continue
            final = str(r.url)
            return (coordenadas_de_enlace(final) or coordenadas_de_enlace(r.text[:300000])), (lugar or _lugar_de_url(final))
    return coordenadas_de_enlace(url), lugar


async def _direccion_de_coordenadas(lat: float, lng: float) -> dict:
    try:
        async with httpx.AsyncClient(timeout=8, headers=_UA) as cli:
            r = await cli.get("https://nominatim.openstreetmap.org/reverse", params={
                "format": "jsonv2", "lat": lat, "lon": lng, "zoom": 18, "addressdetails": 1, "accept-language": "es",
            })
        a = (r.json() or {}).get("address") or {} if r.status_code == 200 else {}
    except Exception:
        a = {}
    primero = lambda *ks: next((a[k] for k in ks if a.get(k)), None)  # noqa: E731
    return {
        "calle": primero("road", "pedestrian", "residential", "footway"),
        "numero": a.get("house_number"),
        "colonia": primero("suburb", "neighbourhood", "quarter", "city_district", "hamlet"),
        "cp": a.get("postcode"),
        "ciudad": primero("city", "town", "village", "municipality", "county"),
        "estado": a.get("state"),
    }


async def _numero_cercano(lat: float, lng: float, calle: Optional[str]) -> Optional[str]:
    """Número de la puerta más cercana al pin (Photon/OSM), solo si es de la misma calle."""
    try:
        async with httpx.AsyncClient(timeout=6, headers=_UA) as cli:
            r = await cli.get("https://photon.komoot.io/reverse", params={"lat": lat, "lon": lng, "lang": "es", "limit": 5, "radius": 0.08})
        for f in (r.json().get("features") or []) if r.status_code == 200 else []:
            p = f.get("properties") or {}
            num = p.get("housenumber")
            if num and (not calle or not p.get("street") or p["street"].lower() in calle.lower() or calle.lower() in p["street"].lower()):
                return str(num)[:20]
    except Exception:
        pass
    return None


@interno.post("/resolver-ubicacion")
@limiter.limit("20/minute")
async def resolver_ubicacion(request: Request, payload: UbicacionIn, user=Depends(require_permission("servicios.editar"))):
    """Del enlace de Google Maps/Waze (o de unas coordenadas) devuelve lat/lng y la dirección para autollenar el formulario."""
    lat, lng = payload.lat, payload.lng
    lugar_g: dict = {}
    if lat is None or lng is None:
        enlace = _texto(payload.url, 500)
        if not enlace or not _enlace_valido(enlace):
            raise HTTPException(status_code=400, detail="Pega un enlace de Google Maps o Waze.")
        try:
            co, lugar = await _coordenadas_de_url(enlace)
        except httpx.HTTPError:
            co, lugar = None, None
        lugar_g = _campos_de_lugar(lugar)
        if not co:
            raise HTTPException(status_code=422, detail="No se pudo leer la ubicación de ese enlace. Prueba con «Compartir» > «Copiar enlace» desde Google Maps.")
        lat, lng = co
    direccion = await _direccion_de_coordenadas(lat, lng)
    if lugar_g.get("calle"):
        direccion["numero"] = None  # con enlace manda lo que escribió Google
    elif not direccion.get("numero"):
        direccion["numero"] = await _numero_cercano(lat, lng, direccion.get("calle"))
    direccion.update({k: v for k, v in lugar_g.items() if v})  # lo que escribió Google manda sobre lo aproximado
    return {
        "lat": round(lat, 6), "lng": round(lng, 6), **direccion,
        "fuente": "google" if lugar_g.get("calle") else "aproximada",
        "direccion_encontrada": bool(direccion.get("calle") or direccion.get("colonia")),
    }


# --- Complemento por C.P.: estado, municipio y colonias ------------------------
_CACHE_CP: dict[str, dict] = {}


@interno.get("/cp/{cp}")
async def consultar_cp(cp: str, db: Session = Depends(get_db), user=Depends(require_permission("servicios.ver"))):
    """Del código postal devuelve estado, ciudad/municipio y la lista de colonias para completar la dirección.
    Primero el catálogo propio (Sepomex cargado); si el C.P. no está, consulta un catálogo nacional público."""
    if not re.fullmatch(r"\d{5}", cp or ""):
        raise HTTPException(status_code=400, detail="El código postal tiene 5 dígitos.")
    filas = db.query(models.CodigoPostal).filter(models.CodigoPostal.cp == cp).all()
    if filas:
        p = filas[0]
        return {"cp": cp, "estado": p.estado, "municipio": p.municipio, "ciudad": p.ciudad or p.municipio,
                "colonias": sorted({f.asentamiento for f in filas}), "fuente": "catalogo"}
    if cp in _CACHE_CP:
        return _CACHE_CP[cp]
    try:
        async with httpx.AsyncClient(timeout=8, headers=_UA) as cli:
            r = await cli.get(f"https://api.zippopotam.us/mx/{cp}")
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="No se pudo consultar el código postal. Captura la colonia, ciudad y estado a mano.")
    if r.status_code != 200:
        raise HTTPException(status_code=404, detail="No encontramos ese código postal. Captura la colonia, ciudad y estado a mano.")
    lugares = (r.json() or {}).get("places") or []
    if not lugares:
        raise HTTPException(status_code=404, detail="No encontramos ese código postal. Captura la colonia, ciudad y estado a mano.")
    ciudad = None
    try:  # la ciudad/municipio sale de las coordenadas de la primera colonia
        ciudad = (await _direccion_de_coordenadas(float(lugares[0]["latitude"]), float(lugares[0]["longitude"]))).get("ciudad")
    except Exception:
        pass
    res = {"cp": cp, "estado": lugares[0].get("state"), "municipio": ciudad, "ciudad": ciudad,
           "colonias": sorted({(x.get("place name") or "").strip() for x in lugares if x.get("place name")}), "fuente": "nacional"}
    if len(_CACHE_CP) < 2000:
        _CACHE_CP[cp] = res
    return res


class DireccionIn(BaseModel):
    calle: Optional[str] = Field(default=None, max_length=150)
    numero: Optional[str] = Field(default=None, max_length=30)
    colonia: Optional[str] = Field(default=None, max_length=100)
    cp: Optional[str] = Field(default=None, max_length=10)
    ciudad: Optional[str] = Field(default=None, max_length=100)
    estado: Optional[str] = Field(default=None, max_length=100)


@interno.post("/geocodificar")
@limiter.limit("15/minute")
async def geocodificar(request: Request, payload: DireccionIn, user=Depends(require_permission("servicios.editar"))):
    """De la dirección escrita (calle, número, colonia, C.P., ciudad, estado) devuelve lat/lng para mostrar el mapa.
    Prueba de más a menos específica y avisa qué tan precisa fue: «direccion» | «colonia» | «cp»."""
    p = payload
    limpio = lambda v: (v or "").strip()  # noqa: E731
    cp_ciudad = " ".join(x for x in [limpio(p.cp), limpio(p.ciudad)] if x)
    unir = lambda *ps: ", ".join(x for x in ps if x)  # noqa: E731
    calle_num = " ".join(x for x in [limpio(p.calle), limpio(p.numero)] if x)
    intentos = []
    if calle_num:
        intentos.append(("direccion", unir(calle_num, limpio(p.colonia), cp_ciudad, limpio(p.estado), "México")))
        if limpio(p.numero):
            intentos.append(("direccion", unir(limpio(p.calle), limpio(p.colonia), cp_ciudad, limpio(p.estado), "México")))
    if limpio(p.colonia):
        intentos.append(("colonia", unir(limpio(p.colonia), cp_ciudad, limpio(p.estado), "México")))
    if cp_ciudad:
        intentos.append(("cp", unir(cp_ciudad, limpio(p.estado), "México")))
    if not intentos:
        raise HTTPException(status_code=400, detail="Captura al menos la calle, la colonia o el código postal.")
    async with httpx.AsyncClient(timeout=8, headers=_UA) as cli:
        for precision, consulta in intentos:
            try:
                r = await cli.get("https://nominatim.openstreetmap.org/search", params={
                    "q": consulta, "format": "jsonv2", "limit": 1, "countrycodes": "mx", "accept-language": "es",
                })
                datos = r.json() if r.status_code == 200 else []
            except Exception:
                datos = []
            if datos:
                return {"lat": round(float(datos[0]["lat"]), 6), "lng": round(float(datos[0]["lon"]), 6), "precision": precision}
    raise HTTPException(status_code=404, detail="No se pudo ubicar esa dirección en el mapa. Pega un enlace de Maps o usa tu ubicación.")


def _sugerencia(titulo, calle, numero, colonia, cp, ciudad, estado, lat, lng) -> dict:
    sub = ", ".join(x for x in [calle if calle and calle != titulo else None, numero and f"#{numero}", colonia, f"{cp or ''} {ciudad or ''}".strip(), estado] if x)
    return {"titulo": titulo or calle or colonia or ciudad or "Lugar", "subtitulo": sub, "calle": calle, "numero": numero, "colonia": colonia,
            "cp": cp, "ciudad": ciudad, "estado": estado, "lat": round(float(lat), 6), "lng": round(float(lng), 6)}


@interno.get("/sugerencias")
@limiter.limit("60/minute")
async def sugerencias(request: Request, q: str, lat: Optional[float] = None, lng: Optional[float] = None, user=Depends(require_permission("servicios.editar"))):
    """Sugerencias de direcciones/lugares mientras se escribe (OpenStreetMap vía Photon; respaldo Nominatim)."""
    q = (q or "").strip()[:150]
    if len(q) < 3:
        return []
    res: list[dict] = []
    try:
        params = {"q": q, "limit": 8, "bbox": "-118.5,14.4,-86.5,32.8"}
        if lat is not None and lng is not None:
            params.update({"lat": lat, "lon": lng})
        async with httpx.AsyncClient(timeout=6, headers=_UA) as cli:
            r = await cli.get("https://photon.komoot.io/api/", params=params)
        for f in (r.json().get("features") or []) if r.status_code == 200 else []:
            p, g = f.get("properties") or {}, (f.get("geometry") or {}).get("coordinates") or []
            if len(g) < 2 or (p.get("countrycode") and p["countrycode"] != "MX"):
                continue
            calle = p.get("street") or (p.get("name") if p.get("osm_key") == "highway" else None)
            res.append(_sugerencia(p.get("name") or calle, calle, p.get("housenumber"), p.get("district") or p.get("locality"),
                                   p.get("postcode"), p.get("city") or p.get("county"), p.get("state"), g[1], g[0]))
    except Exception:
        res = []
    if not res:  # respaldo
        try:
            async with httpx.AsyncClient(timeout=8, headers=_UA) as cli:
                r = await cli.get("https://nominatim.openstreetmap.org/search", params={"q": q, "format": "jsonv2", "limit": 6, "countrycodes": "mx", "addressdetails": 1, "accept-language": "es"})
            for d in r.json() if r.status_code == 200 else []:
                a = d.get("address") or {}
                calle = a.get("road") or a.get("pedestrian")
                res.append(_sugerencia(d.get("name") or calle or (d.get("display_name") or "").split(",")[0], calle, a.get("house_number"),
                                       a.get("suburb") or a.get("neighbourhood") or a.get("quarter"), a.get("postcode"),
                                       a.get("city") or a.get("town") or a.get("municipality") or a.get("county"), a.get("state"), d["lat"], d["lon"]))
        except Exception:
            res = []
    vistos, salida = set(), []
    for s in res:  # sin duplicados
        k = (s["titulo"], s["calle"], s["numero"], s["colonia"], s["cp"])
        if k not in vistos:
            vistos.add(k)
            salida.append(s)
    return salida[:8]


@interno.get("/envio-automatico")
def envio_automatico(user=Depends(require_permission("servicios.ver"))):
    """¿El servidor puede mandar los WhatsApp solo? (si no, la pantalla ofrece los botones manuales)"""
    return {"activo": whatsapp_envio.configurado()}


@interno.get("/lista/abiertas")
def listar_abiertas(incluir_finalizados: bool = False, db: Session = Depends(get_db), user=Depends(require_permission("servicios.ver"))):
    base = (
        db.query(models.ServicioDomicilio, models.Servicio)
        .join(models.Servicio, models.Servicio.id_servicio == models.ServicioDomicilio.id_servicio)
        .options(joinedload(models.Servicio.cliente), joinedload(models.Servicio.vehiculo), joinedload(models.Servicio.detalles))
    )
    filas = base.filter(models.Servicio.status == "abierto").order_by(models.Servicio.fecha_entrada_servicio.asc()).all()
    if incluir_finalizados:  # los 100 más recientes
        filas += base.filter(models.Servicio.status == "cerrado").order_by(models.Servicio.fecha_entrada_servicio.desc()).limit(100).all()
    ids_mec = {d.id_empleado_mecanico for d, _ in filas if d.id_empleado_mecanico}
    nombres_mec = {}
    if ids_mec:  # un solo query para los nombres (la pantalla ya no pide /empleados/)
        for e in db.query(models.Empleado).filter(models.Empleado.id_empleado.in_(ids_mec)).all():
            nombres_mec[e.id_empleado] = " ".join(x for x in (e.nombre, e.paterno) if x)
    return [{
        "mecanico": nombres_mec.get(d.id_empleado_mecanico),
        "id_servicio": s.id_servicio, "servicio": s.nombre_servicio, "cliente": _cliente_corto(s.cliente),
        "direccion": _direccion_txt(d) or None, "id_empleado_mecanico": d.id_empleado_mecanico,
        "iniciado": bool(d.iniciado_at), "bloqueado": bool(d.codigo_bloqueado),
        "finalizado": s.status == "cerrado",
        "fecha_salida": s.fecha_salida_servicio.isoformat() if s.fecha_salida_servicio else None,
        "total": round(sum((x.costo_mano_obra or 0) + (x.costo_refaccion or 0) + (x.costo_extra or 0) for x in s.detalles) * (1 + (s.iva_porcentaje or 0) / 100), 2) if user.tiene_permiso("servicios.ver_precios") else None,
        "etapa": s.etapa or "en_proceso", "vehiculo": (_vehiculo_txt(s.vehiculo) if s.vehiculo else None) or None,
        "placas": s.vehiculo.placas_vehiculo if s.vehiculo else None, "fecha": s.fecha_entrada_servicio.isoformat() if s.fecha_entrada_servicio else None,
        "lat": d.lat, "lng": d.lng, "maps_url": d.maps_url,
        "telefono": ((s.cliente.telefono1 or s.cliente.telefono2) if s.cliente else None),
    } for d, s in filas]


@interno.get("/{id_servicio}")
def obtener(id_servicio: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.ver"))):
    s = _orden_o_404(db, id_servicio)
    return _salida(db, s, _dom(db, id_servicio))


@interno.put("/{id_servicio}")
def guardar(id_servicio: int, payload: DomicilioIn, bg: BackgroundTasks, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    s = _orden_o_404(db, id_servicio)
    if s.status != "abierto":
        raise HTTPException(status_code=400, detail="La orden ya no está abierta.")
    lat, lng = payload.lat, payload.lng
    enlace = _texto(payload.maps_url, 500)
    if enlace and not _enlace_valido(enlace):
        raise HTTPException(status_code=400, detail="El enlace de ubicación debe ser de Google Maps o Waze.")
    if (lat is None or lng is None) and enlace:
        co = coordenadas_de_enlace(enlace)
        if co:
            lat, lng = co
    if (lat is None) != (lng is None):
        raise HTTPException(status_code=400, detail="Captura latitud y longitud juntas, o ninguna.")
    calle = _texto(payload.calle, 150)
    if not (calle or enlace or (lat is not None and lng is not None)):
        raise HTTPException(status_code=400, detail="Captura la dirección (calle) o la ubicación (mapa / enlace) donde se hará el servicio.")
    if payload.id_empleado_mecanico:
        if not db.query(models.Empleado).filter(models.Empleado.id_empleado == payload.id_empleado_mecanico).first():
            raise HTTPException(status_code=400, detail="El mecánico indicado no existe.")

    d = _dom(db, id_servicio)
    nuevo = d is None
    mecanico_antes = d.id_empleado_mecanico if d else None
    if nuevo:
        token = secrets.token_urlsafe(32)
        d = models.ServicioDomicilio(
            id_servicio=id_servicio, token_hash=_hash(token), token_cifrado=token,
            codigo_cifrado=_nuevo_codigo(), creado_por=user.username,
        )
        db.add(d)
    d.calle = calle
    d.numero = _texto(payload.numero, 20)
    d.colonia = _texto(payload.colonia, 100)
    d.cp = _texto(payload.cp, 10)
    d.ciudad = _texto(payload.ciudad, 100)
    d.estado = _texto(payload.estado, 100)
    d.referencias = _texto(payload.referencias, 500)
    d.lat, d.lng, d.maps_url = lat, lng, enlace
    d.id_empleado_mecanico = payload.id_empleado_mecanico or None
    if s.id_empleado_responsable is None and d.id_empleado_mecanico:
        s.id_empleado_responsable = d.id_empleado_mecanico
    db.commit()
    db.refresh(d)
    out = _salida(db, s, d)
    out["envio_automatico"] = _programar_envios(
        bg, out, cliente=nuevo, mecanico=bool(d.id_empleado_mecanico) and (nuevo or d.id_empleado_mecanico != mecanico_antes))
    return out


@interno.post("/{id_servicio}/regenerar-codigo")
def regenerar_codigo(id_servicio: int, bg: BackgroundTasks, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    s = _orden_o_404(db, id_servicio)
    d = _dom(db, id_servicio)
    if not d:
        raise HTTPException(status_code=404, detail="Esta orden no es a domicilio.")
    if d.iniciado_at:
        raise HTTPException(status_code=400, detail="El servicio ya fue iniciado.")
    d.codigo_cifrado = _nuevo_codigo()
    d.codigo_intentos = 0
    d.codigo_bloqueado = False
    db.commit()
    out = _salida(db, s, d)
    out["envio_automatico"] = _programar_envios(bg, out, cliente=True)
    return out


@interno.post("/{id_servicio}/regenerar-enlace")
def regenerar_enlace(id_servicio: int, bg: BackgroundTasks, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    s = _orden_o_404(db, id_servicio)
    d = _dom(db, id_servicio)
    if not d:
        raise HTTPException(status_code=404, detail="Esta orden no es a domicilio.")
    token = secrets.token_urlsafe(32)
    d.token_hash = _hash(token)
    d.token_cifrado = token
    db.commit()
    out = _salida(db, s, d)
    out["envio_automatico"] = _programar_envios(bg, out, mecanico=True)
    return out


@interno.post("/{id_servicio}/iniciar")
def iniciar(id_servicio: int, payload: CodigoIn, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    s = _orden_o_404(db, id_servicio)
    if s.status != "abierto":
        raise HTTPException(status_code=400, detail="La orden ya no está abierta.")
    d = _dom(db, id_servicio)
    if not d:
        raise HTTPException(status_code=404, detail="Esta orden no es a domicilio.")
    _verificar_codigo(db, d, payload.codigo, user.username)
    db.refresh(d)
    return _salida(db, s, d)


@interno.post("/{id_servicio}/nota-enviada")
def nota_enviada(id_servicio: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    s = _orden_o_404(db, id_servicio)
    d = _dom(db, id_servicio)
    if not d:
        raise HTTPException(status_code=404, detail="Esta orden no es a domicilio.")
    d.nota_enviada_at = datetime.utcnow()
    db.commit()
    return _salida(db, s, d)


@interno.delete("/{id_servicio}", status_code=204)
def quitar(id_servicio: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    d = _dom(db, id_servicio)
    if not d:
        return
    if d.iniciado_at:
        raise HTTPException(status_code=400, detail="El servicio a domicilio ya fue iniciado; no se puede quitar.")
    db.delete(d)
    db.commit()
