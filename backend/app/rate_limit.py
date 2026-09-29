"""Límite de peticiones por IP (evita fuerza bruta en /auth/login y que
alguien sature el servidor a peticiones). Se usa como decorador en los
endpoints sensibles y como límite global por defecto en main.py."""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
