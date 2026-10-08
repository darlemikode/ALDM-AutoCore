"""Validación común para cualquier archivo que suba un usuario (fotos de
vehículos/servicios, logo del taller, fotos de chat). Tres capas:

  1) Extensión permitida (lo que dice el nombre — lo controla quien sube).
  2) Tamaño máximo (evita llenar el disco a punta de subidas).
  3) Contenido real: se intenta abrir como imagen con Pillow — si no es una
     imagen de verdad (aunque el nombre diga .jpg), se rechaza. Esto evita
     subir un archivo disfrazado (HTML/JS con extensión de imagen) que
     luego se sirve público desde /uploads/.
"""
import io
import os
import uuid

from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

EXTENSIONES_VALIDAS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif"}
TAMANO_MAXIMO_MB = 8
TAMANO_MAXIMO_BYTES = TAMANO_MAXIMO_MB * 1024 * 1024


async def leer_y_validar_imagen(archivo: UploadFile) -> tuple[bytes, str]:
    """Lee el archivo completo, valida extensión/tamaño/contenido, y
    regresa (contenido, extension). Lanza HTTPException(400) si algo no
    pasa la validación."""
    extension = os.path.splitext(archivo.filename or "")[1].lower() or ".jpg"
    if extension not in EXTENSIONES_VALIDAS:
        raise HTTPException(status_code=400, detail="Formato de imagen no soportado (usa JPG, PNG, WEBP, GIF o HEIC).")

    contenido = await archivo.read()
    if len(contenido) > TAMANO_MAXIMO_BYTES:
        raise HTTPException(status_code=400, detail=f"La imagen pesa demasiado (máximo {TAMANO_MAXIMO_MB} MB).")
    if not contenido:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    if extension != ".heic":  # Pillow no siempre trae soporte HEIC instalado; esas se confían solo a extensión+tamaño
        try:
            Image.open(io.BytesIO(contenido)).verify()
        except (UnidentifiedImageError, OSError):
            raise HTTPException(status_code=400, detail="El archivo no es una imagen válida.")

    return contenido, extension


def nombre_unico(prefijo: str, extension: str) -> str:
    return f"{prefijo}_{uuid.uuid4().hex[:12]}{extension}"


def guardar(carpeta, nombre_archivo: str, contenido: bytes) -> None:
    """`carpeta` se ignora (compatibilidad): todo va a almacenamiento.py."""
    from . import almacenamiento

    almacenamiento.guardar(nombre_archivo, contenido)
