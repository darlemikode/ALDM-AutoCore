"""Cifrado a nivel de campo para datos personales sensibles (CURP, RFC de
empleado, NSS) que no se usan para facturación ni se buscan por ese valor
— solo se muestran en el panel a quien tenga permiso de ver nómina/empleados.

No se aplica a los RFC de clientes/proveedores/facturación: esos los manda
el sistema a Facturapi (PAC) para generar CFDI y se imprimen en documentos
fiscales, así que cifrarlos solo complicaría esos flujos sin ganar
seguridad real (un RFC fiscal ya es un dato que el propio documento impreso
expone).

Usa Fernet (AES-128 en modo CBC + HMAC, de la librería `cryptography`, que
ya viene instalada por `python-jose[cryptography]`). La llave sale de
FIELD_ENCRYPTION_KEY en .env; si no está configurada, estos campos se
guardan tal cual (no truena el sistema, pero avisa una sola vez en el log).
"""
import os
import base64
import hashlib
import warnings

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.types import TypeDecorator, String


def _derivar_fernet_key(valor: str) -> bytes:
    """Permite poner cualquier texto en FIELD_ENCRYPTION_KEY (no tiene que
    ser ya una llave Fernet válida de 32 bytes base64) — se deriva con
    SHA-256, igual de seguro y más fácil de configurar a mano."""
    return base64.urlsafe_b64encode(hashlib.sha256(valor.encode()).digest())


_KEY = os.getenv("FIELD_ENCRYPTION_KEY")
_fernet = Fernet(_derivar_fernet_key(_KEY)) if _KEY else None

if not _fernet:
    warnings.warn(
        "FIELD_ENCRYPTION_KEY no está configurada: CURP/RFC de empleado/NSS "
        "se están guardando SIN cifrar. Agrega FIELD_ENCRYPTION_KEY en tu "
        ".env (cualquier texto largo y aleatorio sirve) para activarlo.",
        RuntimeWarning,
    )

_PREFIJO = "fc1:"  # marca que el valor ya está cifrado con este esquema


class TextoCifrado(TypeDecorator):
    """Columna String que se guarda cifrada en la base y se entrega en
    claro al código Python. Si FIELD_ENCRYPTION_KEY no está puesta, se
    comporta como un String normal (no cifra) para no romper instalaciones
    existentes que todavía no la configuraron."""
    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None or value == "":
            return value
        if not _fernet:
            return value
        return _PREFIJO + _fernet.encrypt(value.encode()).decode()

    def process_result_value(self, value, dialect):
        if value is None or value == "":
            return value
        if not value.startswith(_PREFIJO):
            return value  # dato viejo guardado antes de activar el cifrado
        if not _fernet:
            # Está cifrado pero ya no hay llave: no se puede leer — mejor
            # avisar con un valor claro que tronar toda la pantalla.
            return "(cifrado — falta FIELD_ENCRYPTION_KEY)"
        try:
            return _fernet.decrypt(value[len(_PREFIJO):].encode()).decode()
        except InvalidToken:
            return "(no se pudo descifrar)"
