"""Solicitudes de información/demo desde la página informativa.

POST /api/contacto es público (lo usa el formulario de sitio-web). Al llegar:
  1) se guarda la solicitud,
  2) se crea un aviso en la campanita del taller principal (web y app),
  3) se manda push a los súper admin que tengan la app instalada.
Lo demás (lista y marcar como atendida) es solo para súper admin.
"""
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db_global, sesion_global
from ..push_notifications import enviar_push
from ..rate_limit import limiter
from ..security import require_superadmin
from ..suscripciones import obtener_config

router = APIRouter(tags=["contacto"])


class ContactoIn(BaseModel):
    negocio: str
    nombre: str
    telefono: str
    correo: str | None = None
    mensaje: str | None = None
    web: str | None = None  # trampa para bots: los humanos no lo llenan


def _limpio(texto: str | None, largo: int) -> str | None:
    texto = re.sub(r"\s+", " ", (texto or "")).strip()
    return texto[:largo] or None


@router.post("/api/contacto")
@limiter.limit("5/hour")
async def solicitar_informacion(request: Request, payload: ContactoIn):
    if payload.web:  # bot: fingimos éxito y no guardamos nada
        return {"ok": True}
    negocio, nombre = _limpio(payload.negocio, 120), _limpio(payload.nombre, 120)
    telefono, correo = _limpio(payload.telefono, 30), _limpio(payload.correo, 120)
    if not negocio or not nombre or not telefono:
        raise HTTPException(status_code=400, detail="Falta tu negocio, tu nombre y un teléfono.")
    if len(re.sub(r"\D", "", telefono)) < 8:
        raise HTTPException(status_code=400, detail="Revisa tu teléfono: parece que le faltan dígitos.")
    if correo and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", correo):
        raise HTTPException(status_code=400, detail="Revisa tu correo: no parece válido.")
    mensaje = _limpio(payload.mensaje, 280)

    db = sesion_global()
    try:
        db.add(models.SolicitudContacto(negocio=negocio, nombre=nombre, telefono=telefono, correo=correo, mensaje=mensaje))
        # Aviso en la campanita del taller principal (donde entran los súper admin)
        id_principal = obtener_config(db).id_taller_principal
        if id_principal:
            resumen = f"{nombre} · {telefono}" + (f" · {correo}" if correo else "") + (f" · {mensaje}" if mensaje else "")
            db.add(models.Notificacion(id_taller=id_principal, tipo="solicitud_demo",
                                       titulo=f"Quiere información: {negocio}"[:150], mensaje=resumen[:300]))
        tokens = [u.push_token for u in db.query(models.Usuario).filter(
            models.Usuario.es_superadmin == True, models.Usuario.activo == True, models.Usuario.push_token.isnot(None)).all()]  # noqa: E712
        db.commit()
    finally:
        db.close()
    for token in set(tokens):
        await enviar_push(token, f"Quiere información: {negocio}", f"{nombre} · {telefono}", {"tipo": "solicitud_demo"})
    return {"ok": True}


@router.get("/api/superadmin/solicitudes")
def listar(db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    filas = db.query(models.SolicitudContacto).order_by(models.SolicitudContacto.fecha.desc()).limit(200).all()
    return [{"id_solicitud": s.id_solicitud, "negocio": s.negocio, "nombre": s.nombre, "telefono": s.telefono,
             "correo": s.correo, "mensaje": s.mensaje, "fecha": s.fecha, "atendida": bool(s.atendida)} for s in filas]


@router.put("/api/superadmin/solicitudes/{id_solicitud}")
def marcar(id_solicitud: int, payload: dict, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    s = db.get(models.SolicitudContacto, id_solicitud)
    if not s:
        raise HTTPException(status_code=404, detail="No existe esa solicitud.")
    s.atendida = bool(payload.get("atendida"))
    db.commit()
    return {"ok": True}
