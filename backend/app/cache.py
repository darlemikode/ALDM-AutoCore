"""Caché de datos que casi no cambian (catálogos compartidos entre talleres).
Con REDIS_URL se guarda en Redis (compartido entre instancias); sin él, en memoria de cada instancia.
Se invalida sola en cuanto se guarda un cambio en las tablas indicadas (evento de SQLAlchemy), y además caduca por tiempo."""
import json
import os
import time

from sqlalchemy import event
from sqlalchemy.orm import Session

REDIS_URL = os.getenv("REDIS_URL")
PREFIJO = "aldm:cache:"
_memoria: dict[str, tuple[float, str]] = {}
_redis = None


def _r():
    global _redis
    if _redis is None:
        import redis

        _redis = redis.Redis.from_url(REDIS_URL, decode_responses=True, socket_timeout=1, socket_connect_timeout=1)
    return _redis


def leer(clave: str):
    try:
        if REDIS_URL:
            v = _r().get(PREFIJO + clave)
            return json.loads(v) if v else None
    except Exception:  # noqa: BLE001 — si Redis falla se consulta la base como siempre
        return None
    hit = _memoria.get(clave)
    if hit and hit[0] > time.time():
        return json.loads(hit[1])
    return None


def guardar(clave: str, valor, segundos: int = 600):
    try:
        texto = json.dumps(valor, default=str)
        if REDIS_URL:
            _r().setex(PREFIJO + clave, segundos, texto)
        else:
            _memoria[clave] = (time.time() + segundos, texto)
    except Exception:  # noqa: BLE001
        pass


def borrar(clave: str):
    """Borra la clave y todas las que empiezan con ella (una por taller)."""
    for k in [k for k in _memoria if k.startswith(clave)]:
        _memoria.pop(k, None)
    try:
        if REDIS_URL:
            claves = list(_r().scan_iter(match=f"{PREFIJO}{clave}*", count=200))
            if claves:
                _r().delete(*claves)
    except Exception:  # noqa: BLE001
        pass


def invalidar_al_guardar(clave: str, *modelos):
    """Borra `clave` cuando se guarda, cambia o elimina algo de esos modelos."""
    nombres = {m.__name__ for m in modelos}

    @event.listens_for(Session, "after_flush")
    def _tras_guardar(session, contexto):
        for obj in list(session.new) + list(session.dirty) + list(session.deleted):
            if type(obj).__name__ in nombres:
                borrar(clave)
                return
