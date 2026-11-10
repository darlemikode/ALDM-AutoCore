"""TOTP (RFC 6238) con la librería estándar: códigos de 6 dígitos que cambian
cada 30 s en apps como Google Authenticator, Microsoft Authenticator o Authy."""
import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

PERIODO = 30
DIGITOS = 6


def generar_secreto() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _codigo(secreto: str, paso: int) -> str:
    clave = base64.b32decode(secreto + "=" * (-len(secreto) % 8), casefold=True)
    h = hmac.new(clave, struct.pack(">Q", paso), hashlib.sha1).digest()
    o = h[-1] & 15
    n = (struct.unpack(">I", h[o:o + 4])[0] & 0x7FFFFFFF) % (10 ** DIGITOS)
    return f"{n:0{DIGITOS}d}"


def verificar(secreto: str, codigo: str, ultimo_paso: int | None = None, ventana: int = 1, ahora: float | None = None) -> int | None:
    """Devuelve el paso de tiempo aceptado, o None. Un código ya usado (paso <=
    ultimo_paso) no se acepta otra vez."""
    codigo = "".join(c for c in (codigo or "") if c.isdigit())
    if not secreto or len(codigo) != DIGITOS:
        return None
    paso = int((time.time() if ahora is None else ahora) // PERIODO)
    for d in range(-ventana, ventana + 1):
        p = paso + d
        if ultimo_paso is not None and p <= ultimo_paso:
            continue
        if hmac.compare_digest(_codigo(secreto, p), codigo):
            return p
    return None


def uri(secreto: str, cuenta: str, emisor: str = "ALDM AutoCore") -> str:
    return (f"otpauth://totp/{quote(emisor)}:{quote(cuenta)}?secret={secreto}"
            f"&issuer={quote(emisor)}&algorithm=SHA1&digits={DIGITOS}&period={PERIODO}")
