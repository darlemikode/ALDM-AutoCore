"""Salud del sistema: métricas de la API en memoria, estado detallado
(/api/salud) y alertas cuando algo se degrada o se cae.

Variables (todas opcionales):
  SALUD_KEY            clave para consultar /api/salud (sin ella el endpoint no existe)
  ALERTA_WEBHOOK_URL   URL de n8n (u otro) que recibe {nivel, titulo, mensaje} y manda el WhatsApp
  SALUD_VIGILAR_BD=1   el vigilante interno también prueba la base (en Azure SQL Serverless
                       evita que se pause, pero genera cobro: por omisión NO la toca)
  SALUD_CADA_SEG       cada cuánto evalúa el vigilante interno (por omisión 120)
"""
import asyncio
import hmac
import os
import time
from collections import deque

import httpx

INICIO = time.time()
_VENTANA_SEG = 900  # se conservan 15 min
_muestras: deque = deque(maxlen=20000)  # (momento, status, milisegundos)
_ultimo_nivel = "ok"
_pendiente = {"nivel": None, "veces": 0}


def registrar(status: int, ms: float) -> None:
    _muestras.append((time.time(), int(status), float(ms)))


def _recientes(segundos: int):
    corte = time.time() - segundos
    return [m for m in _muestras if m[0] >= corte]


def resumen_api() -> dict:
    filas = _recientes(300)
    n = len(filas)
    errores = sum(1 for _, s, _ in filas if s >= 500)
    tiempos = sorted(ms for _, _, ms in filas)
    p95 = int(tiempos[min(len(tiempos) - 1, int(len(tiempos) * 0.95))]) if tiempos else 0
    return {"req_5m": n, "err5xx_5m": errores, "p95_ms": p95, "uptime_s": int(time.time() - INICIO)}


def clave_valida(recibida: str | None) -> bool:
    esperada = (os.getenv("SALUD_KEY") or "").strip()
    return bool(esperada and recibida and hmac.compare_digest(esperada, recibida.strip()))


def probar_bd() -> dict:
    from sqlalchemy import text
    from .database import engine
    t0 = time.time()
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"ok": True, "ms": int((time.time() - t0) * 1000)}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "ms": int((time.time() - t0) * 1000), "error": e.__class__.__name__}


def errores_recientes(minutos: int = 15) -> int | None:
    try:
        from datetime import datetime, timedelta
        from . import models
        from .database import sesion_global
        db = sesion_global()
        try:
            desde = datetime.utcnow() - timedelta(minutes=minutos)
            return db.query(models.ErrorSistema).execution_options(sin_filtro_taller=True).filter(models.ErrorSistema.fecha >= desde).count()
        finally:
            db.close()
    except Exception:  # noqa: BLE001
        return None


def nivel_de(api: dict, bd: dict | None) -> str:
    if bd is not None and not bd["ok"]:
        return "caido"
    tasa = (api["err5xx_5m"] / api["req_5m"]) if api["req_5m"] >= 20 else 0
    if tasa > 0.05 or api["p95_ms"] > 2500 or (bd is not None and bd["ms"] > 1500):
        return "degradado"
    return "ok"


def estado(revisar_bd: bool = True) -> dict:
    from .ws_manager import manager_global
    api = resumen_api()
    bd = probar_bd() if revisar_bd else None
    salida = {
        "estado": nivel_de(api, bd),
        "version": os.getenv("APP_VERSION") or os.getenv("WEBSITE_SITE_NAME") or "local",
        "api": api,
        "bd": bd,
        "ws": len(manager_global.conexiones),
    }
    if bd is not None and bd["ok"]:
        salida["errores_15m"] = errores_recientes(15)
    return salida


async def _avisar(nivel: str, titulo: str, mensaje: str) -> None:
    url = (os.getenv("ALERTA_WEBHOOK_URL") or "").strip()
    if url:
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                await c.post(url, json={"nivel": nivel, "titulo": titulo, "mensaje": mensaje})
        except Exception:  # noqa: BLE001
            pass
    try:  # push a los súper administradores
        from . import models
        from .database import sesion_global
        from .push_notifications import enviar_push
        db = sesion_global()
        try:
            tokens = [u.push_token for u in db.query(models.Usuario).filter(
                models.Usuario.es_superadmin == True, models.Usuario.activo == True, models.Usuario.push_token.isnot(None)).all()]  # noqa: E712
        finally:
            db.close()
        for t in tokens:
            await enviar_push(t, titulo, mensaje, {"tipo": "salud", "nivel": nivel})
    except Exception:  # noqa: BLE001
        pass


async def vigilar() -> None:
    """Evalúa cada SALUD_CADA_SEG; avisa al cambiar de estado (confirmado 2 veces seguidas)."""
    global _ultimo_nivel
    cada = max(30, int(os.getenv("SALUD_CADA_SEG", "120")))
    con_bd = os.getenv("SALUD_VIGILAR_BD") == "1"
    while True:
        await asyncio.sleep(cada)
        try:
            e = await asyncio.get_event_loop().run_in_executor(None, estado, con_bd)
            nivel = e["estado"]
            if nivel == _ultimo_nivel:
                _pendiente.update(nivel=None, veces=0)
                continue
            if _pendiente["nivel"] != nivel:
                _pendiente.update(nivel=nivel, veces=1)
                continue
            _pendiente["veces"] += 1
            if _pendiente["veces"] < 2:
                continue
            anterior, _ultimo_nivel = _ultimo_nivel, nivel
            _pendiente.update(nivel=None, veces=0)
            api = e["api"]
            detalle = f"{api['err5xx_5m']} errores 5xx de {api['req_5m']} peticiones en 5 min, p95 {api['p95_ms']} ms"
            if e.get("bd"):
                detalle += f", base {'ok' if e['bd']['ok'] else 'CAÍDA'} ({e['bd']['ms']} ms)"
            if nivel == "ok":
                await _avisar("ok", "ALDM recuperado", f"El sistema volvió a la normalidad. {detalle}")
            else:
                await _avisar(nivel, "ALDM caído" if nivel == "caido" else "ALDM degradado", detalle)
        except Exception:  # noqa: BLE001
            continue
