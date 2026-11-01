"""Bloqueo temporal por cuenta tras muchos intentos fallidos de login.

El límite por IP (rate_limit.py) no frena un ataque repartido en muchas IP
(botnet) contra UNA cuenta. Aquí se cuentan los fallos por identificador
(correo/usuario): al llegar a MAX_FALLOS dentro de VENTANA_MIN minutos la
cuenta se bloquea BLOQUEO_MIN minutos, aunque la contraseña sea correcta.
Memoria del proceso (con varias instancias cada una cuenta aparte; con
REDIS_URL sería compartido — pendiente si se escala)."""
import os
import threading
import time

MAX_FALLOS = int(os.getenv("LOGIN_MAX_FALLOS", "10"))
VENTANA_S = int(os.getenv("LOGIN_VENTANA_MIN", "15")) * 60
BLOQUEO_S = int(os.getenv("LOGIN_BLOQUEO_MIN", "15")) * 60

_lock = threading.Lock()
_fallos: dict[str, list[float]] = {}
_bloqueados: dict[str, float] = {}


def _clave(identificador: str) -> str:
    return (identificador or "").strip().lower()[:120]


def segundos_bloqueado(identificador: str) -> int:
    """0 si puede intentar; si no, segundos que faltan para desbloquearse."""
    k = _clave(identificador)
    ahora = time.time()
    with _lock:
        hasta = _bloqueados.get(k, 0)
        if hasta > ahora:
            return int(hasta - ahora) + 1
        _bloqueados.pop(k, None)
    return 0


def registrar_fallo(identificador: str) -> bool:
    """Cuenta un fallo; True si con este la cuenta quedó bloqueada."""
    k = _clave(identificador)
    ahora = time.time()
    with _lock:
        lista = [t for t in _fallos.get(k, []) if ahora - t < VENTANA_S]
        lista.append(ahora)
        _fallos[k] = lista
        if len(lista) >= MAX_FALLOS:
            _bloqueados[k] = ahora + BLOQUEO_S
            _fallos.pop(k, None)
            return True
        if len(_fallos) > 50000:  # evita crecer sin límite
            for kk in list(_fallos)[:10000]:
                _fallos.pop(kk, None)
    return False


def limpiar(identificador: str) -> None:
    with _lock:
        _fallos.pop(_clave(identificador), None)
