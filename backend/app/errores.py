"""Errores estándar: el usuario ve un mensaje único con un código de
soporte, y el detalle técnico queda en la bitácora de su taller."""
import logging
import os
import re
import threading
import time
import traceback
import uuid

from datetime import datetime

from fastapi import Request

from . import models
from .database import sesion_global

MENSAJE_SOPORTE = (
    "Ocurrió un problema en el sistema. Comunícate con soporte de ALDM AutoCore "
    "y menciona el código {codigo}."
)


logger = logging.getLogger("aldm.errores")

# --- Aviso autónomo a soporte -------------------------------------------------
# Cada error del servidor (5xx) o reportado por las apps se manda por correo a
# soporte con los datos mínimos (taller, ruta, código). Para no inundar el
# buzón: el mismo error (misma firma) se avisa una vez por hora y hay un tope
# global por hora. Todo corre en un hilo aparte: nunca retrasa la respuesta.
SOPORTE_EMAIL = os.getenv("SOPORTE_EMAIL", "soporte@aldmautocore.com")
_VENTANA_SEG = 3600
_TOPE_POR_HORA = 30
# Los errores que reportan las apps llegan por un endpoint público: tienen su propio tope
# (bajo) para que nadie pueda llenar el buzón ni agotar los avisos de errores reales del servidor.
_TOPE_CLIENTE_POR_HORA = 5
_vistos: dict[str, float] = {}
_enviados: list[float] = []
_enviados_cliente: list[float] = []
_candado = threading.Lock()


def _firma(status: int, metodo: str | None, ruta: str | None, mensaje: str | None) -> str:
    ruta_n = re.sub(r"/\d+", "/{id}", ruta or "")
    return f"{status}|{metodo}|{ruta_n}|{(mensaje or '')[:80]}"


def _toca_avisar(firma: str, desde_cliente: bool = False) -> tuple[bool, int]:
    """(avisar?, veces que ya había ocurrido sin avisar)."""
    ahora = time.time()
    with _candado:
        for k in [k for k, t in _vistos.items() if ahora - t > _VENTANA_SEG]:
            _vistos.pop(k, None)
        _enviados[:] = [t for t in _enviados if ahora - t < _VENTANA_SEG]
        _enviados_cliente[:] = [t for t in _enviados_cliente if ahora - t < _VENTANA_SEG]
        if firma in _vistos or len(_enviados) >= _TOPE_POR_HORA:
            return False, 0
        if desde_cliente and len(_enviados_cliente) >= _TOPE_CLIENTE_POR_HORA:
            return False, 0
        _vistos[firma] = ahora
        _enviados.append(ahora)
        if desde_cliente:
            _enviados_cliente.append(ahora)
        return True, 0


def _avisar_soporte(datos: dict) -> None:
    try:
        from .notifications import _enviar_correo, _smtp_configurado, _url_frontend

        if not _smtp_configurado() or not SOPORTE_EMAIL:
            return
        taller = "(sin taller)"
        if datos.get("id_taller"):
            db = sesion_global()
            try:
                t = db.query(models.Taller).filter(models.Taller.id_taller == datos["id_taller"]).first()
                if t:
                    taller = f"{t.nombre_comercial} (código {t.codigo or t.id_taller})" + (f" · {t.ciudad}" if t.ciudad else "")
            finally:
                db.close()
        for k in ("metodo", "ruta", "codigo"):
            datos[k] = re.sub(r"[\r\n]+", " ", str(datos.get(k) or ""))
        taller = re.sub(r"[\r\n]+", " ", taller)
        asunto = f"[ALDM] Error {datos['codigo']} · {taller.split(' (')[0]} · {datos.get('metodo') or ''} {datos.get('ruta') or ''}".strip()[:150]
        cuerpo = (
            f"Taller: {taller}\n"
            f"Código: {datos['codigo']}\n"
            f"Origen: {datos['origen']} · status {datos['status']}\n"
            f"Ruta: {datos.get('metodo') or '-'} {datos.get('ruta') or '-'}\n"
            f"Usuario: {datos.get('usuario') or '-'}\n"
            f"Fecha (UTC): {datetime.utcnow():%Y-%m-%d %H:%M:%S}\n\n"
            f"Mensaje: {datos.get('mensaje') or '-'}\n\n"
            f"Detalle técnico (final):\n{(datos.get('detalle') or '-')[-1500:]}\n\n"
            f"Panel: {_url_frontend()}/superadmin/errores\n"
            "Este mismo error no se vuelve a avisar durante 1 hora; el conteo queda en el panel."
        )
        _enviar_correo(SOPORTE_EMAIL, asunto, cuerpo)
    except Exception:  # noqa: BLE001 — el aviso nunca debe causar otro error
        logger.exception("No se pudo avisar a soporte")


def _usuario(request: Request | None) -> str | None:
    try:
        from jose import jwt

        from .security import ALGORITHM, SECRET_KEY

        auth = request.headers.get("authorization", "") if request else ""
        if auth.lower().startswith("bearer "):
            return str(jwt.decode(auth[7:], SECRET_KEY, algorithms=[ALGORITHM]).get("sub", ""))[:50] or None
    except Exception:  # noqa: BLE001
        pass
    return None


def registrar_error(request: Request | None, exc: BaseException | None, status: int = 500, origen: str = "servidor",
                    mensaje: str | None = None, detalle: str | None = None, id_taller: int | None = None) -> str:
    """Guarda el error y regresa su código (ERR-XXXXXXXX). Nunca lanza."""
    codigo = "ERR-" + uuid.uuid4().hex[:8].upper()
    try:
        if detalle is None and exc is not None:
            detalle = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))[-4000:]
        db = sesion_global()
        try:
            db.add(models.ErrorSistema(
                codigo=codigo, origen=origen, status=status,
                id_taller=id_taller if id_taller is not None else getattr(getattr(request, "state", None), "id_taller", None),
                metodo=request.method if request else None,
                ruta=(request.url.path if request else None),
                usuario=_usuario(request),
                mensaje=(mensaje or (f"{type(exc).__name__}: {exc}" if exc else None) or "")[:500],
                detalle=detalle,
            ))
            db.commit()
        finally:
            db.close()
        if status >= 500 or origen in ("app_movil", "web"):
            firma = _firma(status, request.method if request else None, request.url.path if request else None, mensaje or (str(exc) if exc else ""))
            avisar, _ = _toca_avisar(firma, desde_cliente=origen in ("app_movil", "web"))
            if avisar:
                datos = {
                    "codigo": codigo, "origen": origen, "status": status,
                    "id_taller": id_taller if id_taller is not None else getattr(getattr(request, "state", None), "id_taller", None),
                    "metodo": request.method if request else None, "ruta": request.url.path if request else None,
                    "usuario": _usuario(request),
                    "mensaje": (mensaje or (f"{type(exc).__name__}: {exc}" if exc else None) or "")[:500], "detalle": detalle,
                }
                threading.Thread(target=_avisar_soporte, args=(datos,), daemon=True).start()
    except Exception:  # noqa: BLE001 — la bitácora nunca debe causar otro error
        pass
    return codigo
