"""Límite de peticiones por IP (evita fuerza bruta en /auth/login y que
alguien sature el servidor a peticiones). Se usa como decorador en los
endpoints sensibles y como límite global por defecto en main.py."""
from slowapi import Limiter
from slowapi.util import get_remote_address


def ip_del_cliente(request) -> str:
    """En Azure todas las peticiones llegan desde el proxy interno (se veía
    siempre 169.254.x.x), así que get_remote_address contaba a todo el mundo
    como una sola persona. El proxy agrega la IP real al final de
    X-Forwarded-For; se toma esa última (las anteriores las puede escribir
    el cliente) y se le quita el puerto."""
    reenviado = request.headers.get("x-forwarded-for")
    if reenviado:
        ip = reenviado.split(",")[-1].strip()
        if ip.count(":") == 1:  # IPv4 con puerto
            ip = ip.split(":")[0]
        if ip:
            return ip
    return get_remote_address(request)


limiter = Limiter(key_func=ip_del_cliente, default_limits=["200/minute"])
