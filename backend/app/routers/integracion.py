"""API para integraciones externas (n8n / agente de WhatsApp).

Se entra con una llave de API del taller (encabezado X-API-Key), nunca con
usuario y contraseña. Todo lo que devuelve está acotado:
  - al taller dueño de la llave (mismo filtro multi-taller del resto del sistema), y
  - al TELÉFONO de quien escribe por WhatsApp: un cliente solo ve sus órdenes,
    y las herramientas del personal solo responden a teléfonos de usuarios
    activos del taller (con los permisos de su rol).
El flujo de n8n pasa el teléfono directo del mensaje recibido, no lo decide la IA.
"""
import hashlib
import io
import re
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from .. import models
from ..database import SessionLocal, get_db
from ..rate_limit import limiter
from ..security import require_permission
from ..tenancy import MODO_SUPERADMIN, MODO_TALLER, fijar_tenant, taller_actual

router = APIRouter(prefix="/api/integracion", tags=["integracion"])

ETIQUETA_ETAPA = {
    "recibido": "Recibido", "diagnostico": "En diagnóstico", "esperando_autorizacion": "Esperando tu autorización",
    "en_reparacion": "En reparación", "esperando_refacciones": "Esperando refacciones",
    "control_calidad": "Control de calidad", "listo_entrega": "Listo para entrega",
}


def _hash(llave: str) -> str:
    return hashlib.sha256(llave.encode("utf-8")).hexdigest()


def _tel10(telefono: Optional[str]) -> str:
    """Últimos 10 dígitos: WhatsApp manda 5214771234567, el sistema guarda 4771234567."""
    return re.sub(r"\D", "", telefono or "")[-10:]


# --- Administración de llaves (desde el panel, con sesión normal) -------------
class LlaveIn(BaseModel):
    nombre: str


@router.get("/llaves")
def listar_llaves(db: Session = Depends(get_db), user=Depends(require_permission("configuracion.editar"))):
    llaves = db.query(models.LlaveIntegracion).order_by(models.LlaveIntegracion.fecha_creacion.desc()).all()
    return [{"id_llave": l.id_llave, "nombre": l.nombre, "prefijo": l.prefijo, "activa": l.activa,
             "creada_por": l.creada_por, "fecha_creacion": l.fecha_creacion, "ultimo_uso": l.ultimo_uso} for l in llaves]


@router.post("/llaves", status_code=201)
def crear_llave(payload: LlaveIn, db: Session = Depends(get_db), user=Depends(require_permission("configuracion.editar"))):
    nombre = (payload.nombre or "").strip()[:80] or "n8n"
    llave = f"aldm_{secrets.token_urlsafe(32)}"
    db.add(models.LlaveIntegracion(nombre=nombre, prefijo=llave[:12], hash_llave=_hash(llave), creada_por=user.username))
    db.commit()
    # Única vez que se devuelve completa
    return {"llave": llave, "prefijo": llave[:12], "nombre": nombre}


@router.delete("/llaves/{id_llave}")
def revocar_llave(id_llave: int, db: Session = Depends(get_db), user=Depends(require_permission("configuracion.editar"))):
    llave = db.query(models.LlaveIntegracion).filter(models.LlaveIntegracion.id_llave == id_llave).first()
    if not llave:
        raise HTTPException(status_code=404, detail="Llave no encontrada")
    llave.activa = False
    db.commit()
    return {"status": "revocada"}


# --- Autenticación por llave ------------------------------------------------
def db_por_llave(request: Request, x_api_key: Optional[str] = Header(None)):
    """Sesión de BD acotada al taller dueño de la llave."""
    if not x_api_key or not x_api_key.startswith("aldm_"):
        raise HTTPException(status_code=401, detail="Falta la llave de API (encabezado X-API-Key).")
    db = SessionLocal()
    try:
        fijar_tenant(db, MODO_SUPERADMIN)
        llave = (
            db.query(models.LlaveIntegracion).execution_options(sin_filtro_taller=True)
            .filter(models.LlaveIntegracion.hash_llave == _hash(x_api_key), models.LlaveIntegracion.activa == True)
            .first()
        )
        if not llave or llave.id_taller is None:
            raise HTTPException(status_code=401, detail="Llave de API no válida o revocada.")
        from ..suscripciones import estado_taller
        info = estado_taller(db, llave.id_taller)
        if info and info.get("bloqueado"):
            raise HTTPException(status_code=402, detail="La suscripción del taller está suspendida.")
        if info and info.get("solo_lectura") and request.method not in ("GET", "HEAD"):
            raise HTTPException(status_code=402, detail="La suscripción del taller venció: solo consulta.")
        if llave.ultimo_uso is None or datetime.utcnow() - llave.ultimo_uso > timedelta(minutes=5):
            llave.ultimo_uso = datetime.utcnow()
            db.commit()
        fijar_tenant(db, MODO_TALLER, llave.id_taller)
        db.info["estado_suscripcion"] = info
        request.state.id_taller = llave.id_taller
        yield db
    finally:
        db.close()


def _cliente_por_tel(db: Session, telefono: str) -> Optional[models.Cliente]:
    t = _tel10(telefono)
    if len(t) != 10:
        return None
    candidatos = db.query(models.Cliente).filter(
        models.Cliente.status_cliente == 1,
        or_(models.Cliente.telefono1.like(f"%{t}"), models.Cliente.telefono2.like(f"%{t}")),
    ).all()
    return next((c for c in candidatos if t in (_tel10(c.telefono1), _tel10(c.telefono2))), None)


def _personal_por_tel(db: Session, telefono: str) -> Optional[models.Usuario]:
    t = _tel10(telefono)
    if len(t) != 10:
        return None
    tid = taller_actual(db)
    usuarios = (
        db.query(models.Usuario).join(models.UsuarioTaller)
        .filter(models.UsuarioTaller.id_taller == tid, models.UsuarioTaller.activo == True,
                models.Usuario.activo == True, models.Usuario.telefono.like(f"%{t}"))
        .all()
    )
    u = next((x for x in usuarios if _tel10(x.telefono) == t), None)
    if u:
        u._taller_activo = tid
        info = db.info.get("estado_suscripcion")
        u._modulos_activos = info["modulos"] if info else None
    return u


def _exigir_cliente(db, telefono) -> models.Cliente:
    c = _cliente_por_tel(db, telefono)
    if not c:
        raise HTTPException(status_code=404, detail="No hay un cliente registrado con este teléfono.")
    return c


def _exigir_personal(db, telefono, permiso=None) -> models.Usuario:
    u = _personal_por_tel(db, telefono)
    if not u:
        raise HTTPException(status_code=403, detail="Este teléfono no pertenece al personal del taller.")
    if permiso and not u.tiene_permiso(permiso):
        raise HTTPException(status_code=403, detail="Tu rol no tiene permiso para consultar esto.")
    return u


def _costos(s: models.Servicio) -> dict:
    subtotal = sum((d.costo_mano_obra or 0) + (d.costo_refaccion or 0) + (d.costo_extra or 0) for d in s.detalles)
    total = subtotal * (1 + (s.iva_porcentaje or 0) / 100)
    abonado = sum(a.monto_abono or 0 for a in s.abonos)
    return {"total": round(total, 2), "abonado": round(abonado, 2), "saldo": round(max(total - abonado, 0), 2)}


def _vehiculo_txt(v) -> str:
    if not v:
        return "—"
    return " ".join(str(x) for x in [getattr(v.marca, "nombre_marca", None) if v.marca else None,
                                       getattr(v.modelo, "nombre_modelo", None) if v.modelo else None,
                                       v.placas_vehiculo and f"({v.placas_vehiculo})"] if x) or "vehículo"


def _orden_dict(s: models.Servicio, con_precios=True) -> dict:
    d = {
        "id_orden": s.id_servicio, "vehiculo": _vehiculo_txt(s.vehiculo), "servicio": s.nombre_servicio,
        "estado": {"abierto": "En proceso", "cerrado": "Entregada", "cancelado": "Cancelada"}.get(s.status, s.status),
        "etapa": ETIQUETA_ETAPA.get(s.etapa or "", s.etapa) if s.status == "abierto" else None,
        "fecha_entrada": s.fecha_entrada_servicio.strftime("%d/%m/%Y") if s.fecha_entrada_servicio else None,
        "fecha_salida": s.fecha_salida_servicio.strftime("%d/%m/%Y") if s.fecha_salida_servicio else None,
    }
    if con_precios:
        d.update(_costos(s))
    return d


def _q_ordenes(db):
    return db.query(models.Servicio).options(
        selectinload(models.Servicio.detalles), selectinload(models.Servicio.abonos),
        joinedload(models.Servicio.vehiculo).joinedload(models.Vehiculo.marca),
        joinedload(models.Servicio.vehiculo).joinedload(models.Vehiculo.modelo),
        joinedload(models.Servicio.cliente),
    )


# --- Comunes ----------------------------------------------------------------
@router.get("/identificar")
@limiter.limit("120/minute")
def identificar(request: Request, telefono: str = Query(...), db: Session = Depends(db_por_llave)):
    """¿Quién escribe? personal del taller, cliente o desconocido."""
    taller = db.query(models.ConfiguracionTaller).first()
    base = {"taller": taller.nombre_taller if taller else None}
    u = _personal_por_tel(db, telefono)
    if u:
        return {**base, "tipo": "personal", "nombre": u.nombre_completo, "rol": u.rol.nombre if u.rol else None}
    c = _cliente_por_tel(db, telefono)
    if c:
        return {**base, "tipo": "cliente", "nombre": c.nombre_cliente, "numero_cuenta": c.numero_cuenta}
    return {**base, "tipo": "desconocido"}


@router.get("/taller")
def datos_taller(db: Session = Depends(db_por_llave)):
    t = db.query(models.ConfiguracionTaller).first()
    if not t:
        return {}
    ciudad = getattr(t.ciudad, "nombre_ciudad", None) if t.ciudad else None
    estado = getattr(t.estado, "nombre_estado", None) if t.estado else None
    return {
        "nombre": t.nombre_taller,
        "direccion": ", ".join(filter(None, [" ".join(filter(None, [t.calle, t.numero_taller])), t.direccion and f"Col. {t.direccion}", t.cp and f"CP {t.cp}", ciudad, estado])),
        "telefonos": [x for x in [t.telefono, t.telefono2, t.telefono3] if x],
        "correos": [x for x in [t.correo, t.correo2] if x],
    }


# --- Herramientas para CLIENTES -----------------------------------------------
@router.get("/cliente/ordenes")
def ordenes_del_cliente(telefono: str = Query(...), db: Session = Depends(db_por_llave)):
    c = _exigir_cliente(db, telefono)
    ordenes = _q_ordenes(db).filter(models.Servicio.id_cliente == c.id_cliente).order_by(models.Servicio.fecha_entrada_servicio.desc()).limit(10).all()
    return {"cliente": c.nombre_cliente, "ordenes": [_orden_dict(s) for s in ordenes]}


@router.get("/cliente/ordenes/{id_orden}/nota")
def nota_del_cliente(id_orden: int, telefono: str = Query(...), db: Session = Depends(db_por_llave)):
    """PDF de la nota (remisión si ya se entregó, si no el recibo) — solo si la orden es de ese cliente."""
    c = _exigir_cliente(db, telefono)
    s = _q_ordenes(db).filter(models.Servicio.id_servicio == id_orden, models.Servicio.id_cliente == c.id_cliente).first()
    if not s or not s.detalles:
        raise HTTPException(status_code=404, detail="No encontramos esa orden en tu cuenta.")
    from .servicios import _calcular_costos, _get_servicio_o_404, _nombre_pdf
    from ..inspeccion_pdf import inspeccion_de_servicio
    servicio = _get_servicio_o_404(db, id_orden)
    taller = db.query(models.ConfiguracionTaller).first()
    insp = inspeccion_de_servicio(db, models, id_orden)
    if servicio.status == "cerrado":
        from ..nota_remision_pdf import generar_nota_remision_pdf
        pdf, nombre = generar_nota_remision_pdf(servicio, _calcular_costos(servicio), taller, insp), _nombre_pdf(servicio, "Nota")
    else:
        from ..recibo_pdf import generar_recibo_pdf
        pdf, nombre = generar_recibo_pdf(servicio, _calcular_costos(servicio), taller, insp), _nombre_pdf(servicio, "Orden")
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{nombre}"'})


class CitaIn(BaseModel):
    telefono: str
    fecha_propuesta: Optional[datetime] = None
    descripcion: str


@router.post("/cliente/citas", status_code=201)
def solicitar_cita(payload: CitaIn, db: Session = Depends(db_por_llave)):
    c = _exigir_cliente(db, payload.telefono)
    pendientes = db.query(func.count(models.CitaSolicitada.id_cita)).filter(
        models.CitaSolicitada.id_cliente == c.id_cliente, models.CitaSolicitada.estado == "pendiente").scalar()
    if pendientes and pendientes >= 3:
        raise HTTPException(status_code=400, detail="Ya tienes 3 solicitudes de cita pendientes; el taller te confirmará pronto.")
    vehiculos = db.query(models.Vehiculo).filter(models.Vehiculo.id_cliente == c.id_cliente).all()
    cita = models.CitaSolicitada(
        id_cliente=c.id_cliente, id_vehiculo=vehiculos[0].id_vehiculo if len(vehiculos) == 1 else None,
        descripcion=f"[WhatsApp] {(payload.descripcion or '').strip()[:1000]}", fecha_propuesta=payload.fecha_propuesta,
    )
    db.add(cita)
    db.commit()
    return {"id_cita": cita.id_cita, "estado": "pendiente", "mensaje": "Solicitud registrada; el taller la confirmará."}


# --- Herramientas para el PERSONAL del taller ---------------------------------
@router.get("/personal/resumen")
def resumen_personal(telefono: str = Query(...), db: Session = Depends(db_por_llave)):
    u = _exigir_personal(db, telefono, "servicios.ver")
    ahora = datetime.utcnow() - timedelta(hours=6)  # día en hora de México
    inicio = (ahora.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(hours=6))
    abiertas = _q_ordenes(db).filter(models.Servicio.status == "abierto").all()
    entradas_hoy = db.query(func.count(models.Servicio.id_servicio)).filter(models.Servicio.fecha_entrada_servicio >= inicio).scalar()
    entregadas_hoy = db.query(func.count(models.Servicio.id_servicio)).filter(models.Servicio.fecha_salida_servicio >= inicio, models.Servicio.status == "cerrado").scalar()
    bajo_stock = db.query(func.count(models.Refaccion.id_refaccion)).filter(models.Refaccion.cantidad_refaccion <= models.Refaccion.umbral_rojo).scalar()
    citas = db.query(func.count(models.CitaSolicitada.id_cita)).filter(models.CitaSolicitada.estado == "pendiente").scalar()
    r = {"para": u.nombre_completo, "ordenes_abiertas": len(abiertas), "entraron_hoy": entradas_hoy or 0,
         "entregadas_hoy": entregadas_hoy or 0, "refacciones_bajo_stock": bajo_stock or 0, "citas_por_confirmar": citas or 0}
    if u.tiene_permiso("dashboard.ver_por_cobrar"):
        cobrado = db.query(func.coalesce(func.sum(models.ServicioAbono.monto_abono), 0)).filter(models.ServicioAbono.fecha_pago >= inicio).scalar()
        r["cobrado_hoy"] = round(float(cobrado or 0), 2)
        r["por_cobrar_ordenes_abiertas"] = round(sum(_costos(s)["saldo"] for s in abiertas), 2)
    return r


@router.get("/personal/ordenes")
def ordenes_personal(telefono: str = Query(...), estado: str = "abierto", buscar: Optional[str] = None, db: Session = Depends(db_por_llave)):
    u = _exigir_personal(db, telefono, "servicios.ver")
    q = _q_ordenes(db)
    if estado in ("abierto", "cerrado", "cancelado"):
        q = q.filter(models.Servicio.status == estado)
    ordenes = q.order_by(models.Servicio.fecha_entrada_servicio.desc()).limit(200).all()
    if buscar:
        from ..busqueda import coincide
        ordenes = [s for s in ordenes if coincide(buscar, str(s.id_servicio), s.nombre_servicio, _vehiculo_txt(s.vehiculo),
                                                  s.cliente and f"{s.cliente.nombre_cliente} {s.cliente.paterno_cliente or ''}")]
    precios = u.tiene_permiso("servicios.ver_precios")
    return {"ordenes": [{**_orden_dict(s, precios), "cliente": s.cliente and f"{s.cliente.nombre_cliente} {s.cliente.paterno_cliente or ''}".strip()} for s in ordenes[:20]]}


@router.get("/personal/bajo-stock")
def bajo_stock_personal(telefono: str = Query(...), db: Session = Depends(db_por_llave)):
    _exigir_personal(db, telefono, "refacciones.ver")
    refs = (db.query(models.Refaccion).filter(models.Refaccion.cantidad_refaccion <= models.Refaccion.umbral_rojo)
            .order_by(models.Refaccion.cantidad_refaccion.asc()).limit(25).all())
    return {"refacciones": [{"nombre": r.nombre_refaccion, "categoria": r.categoria, "stock": r.cantidad_refaccion} for r in refs]}


@router.get("/personal/citas")
def citas_personal(telefono: str = Query(...), db: Session = Depends(db_por_llave)):
    _exigir_personal(db, telefono, "servicios.ver")
    citas = (db.query(models.CitaSolicitada).options(joinedload(models.CitaSolicitada.cliente))
             .filter(models.CitaSolicitada.estado == "pendiente").order_by(models.CitaSolicitada.fecha_creacion.desc()).limit(20).all())
    return {"citas": [{"id_cita": c.id_cita, "cliente": c.cliente and c.cliente.nombre_cliente, "telefono": c.cliente and c.cliente.telefono1,
                       "fecha_propuesta": c.fecha_propuesta.strftime("%d/%m/%Y %H:%M") if c.fecha_propuesta else None,
                       "descripcion": c.descripcion} for c in citas]}
