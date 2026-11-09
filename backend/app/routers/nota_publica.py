"""Descarga pública de la nota (PDF tamaño carta) mediante el QR del ticket.

El enlace va firmado (HMAC con la clave del servidor) y no guarda nada en la base:
  · Caduca a los 30 días.
  · Queda ligado al estado de la orden (estatus, total y abonado): si la orden cambia
    —un pago nuevo, una reapertura, un ajuste de precio— el QR impreso deja de servir.
  · Una nota de remisión solo se descarga si la orden está cerrada.
  · Respuestas sin caché, sin indexar y con límite de peticiones por IP.
Formato del token: «tipo.orden.taller.vence.firma» (tipo r = recibo, n = remisión).
"""
import base64
import hashlib
import hmac
import os
import re
import time
from typing import Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session

from .. import models
from ..rate_limit import limiter
from ..sesion_taller import SECRET_KEY
from ..tenancy import MODO_TALLER, fijar_tenant
from .seguimiento import db_publica

publico = APIRouter(prefix="/api/nota", tags=["nota"])

VIGENCIA_DIAS = 30
_TOKEN_RE = re.compile(r"^[nr]\.\d{1,9}\.\d{1,9}\.[0-9a-f]{1,8}\.[A-Za-z0-9_-]{22}$")
_CABECERAS = {
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Referrer-Policy": "no-referrer",
}
MENSAJE_NO_VALIDO = "Este enlace no es válido o ya venció. Pide una nota actualizada al taller."


def _huella(servicio, costos) -> str:
    return f"{servicio.status}|{costos.total:.2f}|{costos.total_abonado:.2f}"


def _firma(tipo: str, id_servicio: int, id_taller: int, vence: int, huella: str) -> str:
    clave = b"nota-publica:" + str(SECRET_KEY).encode("utf-8")
    msg = f"{tipo}|{id_servicio}|{id_taller}|{vence}|{huella}".encode("utf-8")
    return base64.urlsafe_b64encode(hmac.new(clave, msg, hashlib.sha256).digest()[:16]).decode().rstrip("=")


def url_descarga(tipo: str, servicio, costos) -> Optional[str]:
    """Enlace para el QR del ticket. tipo: 'recibo' | 'remision'. None si no se puede armar."""
    id_taller = getattr(servicio, "id_taller", None)
    if id_taller is None:
        return None
    t = "n" if tipo == "remision" else "r"
    vence = int(time.time()) + VIGENCIA_DIAS * 86400
    token = f"{t}.{servicio.id_servicio}.{id_taller}.{vence:x}.{_firma(t, servicio.id_servicio, id_taller, vence, _huella(servicio, costos))}"
    base = (os.getenv("URL_PUBLICA") or "https://app.aldmautocore.com").strip().rstrip("/")
    return f"{base}/api/nota/{token}"


def _no_valido() -> JSONResponse:
    return JSONResponse(status_code=404, content={"codigo": "no_valido", "mensaje": MENSAJE_NO_VALIDO}, headers=_CABECERAS)


@publico.get("/{token}")
@limiter.limit("20/minute")
def descargar(request: Request, token: str, db: Session = Depends(db_publica)):
    if not _TOKEN_RE.match(token):
        return _no_valido()
    tipo, sid, tid, vence_hex, firma = token.split(".")
    sid, tid, vence = int(sid), int(tid), int(vence_hex, 16)
    if vence < time.time():
        return _no_valido()

    fijar_tenant(db, MODO_TALLER, tid)  # a partir de aquí solo se ve ese taller
    from .servicios import _calcular_costos, _get_servicio_o_404, _nombre_pdf
    try:
        servicio = _get_servicio_o_404(db, sid)
    except Exception:  # noqa: BLE001 — no se distingue «no existe» de «firma mala»
        return _no_valido()
    costos = _calcular_costos(servicio)
    esperada = _firma(tipo, sid, tid, vence, _huella(servicio, costos))
    if not hmac.compare_digest(esperada, firma):
        return _no_valido()
    if tipo == "n" and servicio.status != "cerrado":
        return _no_valido()

    from ..suscripciones import estado_taller
    info = estado_taller(db, tid)
    if info and info.get("bloqueado"):
        return _no_valido()

    taller = db.query(models.ConfiguracionTaller).first()
    from ..inspeccion_pdf import inspeccion_de_servicio
    insp = inspeccion_de_servicio(db, models, sid)
    if tipo == "n":
        from ..nota_remision_pdf import generar_nota_remision_pdf
        pdf = generar_nota_remision_pdf(servicio, costos, taller, insp)
        nombre = _nombre_pdf(servicio, "Nota")
    else:
        from ..recibo_pdf import generar_recibo_pdf
        pdf = generar_recibo_pdf(servicio, costos, taller, insp)
        nombre = _nombre_pdf(servicio, "Orden")
    return Response(content=pdf, media_type="application/pdf",
                    headers={**_CABECERAS, "Content-Disposition": f'inline; filename="{nombre}"'})
