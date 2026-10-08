"""Almacenamiento de archivos subidos (fotos, logos, facturas).

Sin configuración usa disco (UPLOADS_DIR, por defecto app/uploads) — como
en desarrollo. Si existe AZURE_STORAGE_CONNECTION_STRING guarda en Azure
Blob Storage (contenedor AZURE_STORAGE_CONTAINER, por defecto "uploads"):
los archivos sobreviven a despliegues y se comparten entre instancias.
Las "claves" son rutas relativas, p. ej. "abc.jpg" o "facturas/f1.xml"."""
import os

UPLOADS_DIR = os.getenv("UPLOADS_DIR") or os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

_CONEXION = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
_CONTENEDOR = os.getenv("AZURE_STORAGE_CONTAINER", "uploads")
USA_BLOB = bool(_CONEXION)
_contenedor = None


def _blob(clave: str):
    global _contenedor
    if _contenedor is None:
        from azure.storage.blob import BlobServiceClient

        servicio = BlobServiceClient.from_connection_string(_CONEXION)
        _contenedor = servicio.get_container_client(_CONTENEDOR)
        try:
            _contenedor.create_container()
        except Exception:  # noqa: BLE001 — ya existe
            pass
    return _contenedor.get_blob_client(clave.replace("\\", "/"))


def _ruta(clave: str) -> str:
    ruta = os.path.normpath(os.path.join(UPLOADS_DIR, clave))
    if not ruta.startswith(os.path.normpath(UPLOADS_DIR)):
        raise ValueError("Ruta inválida")
    return ruta


def guardar(clave: str, contenido: bytes) -> None:
    if USA_BLOB:
        _blob(clave).upload_blob(contenido, overwrite=True)
        return
    ruta = _ruta(clave)
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "wb") as f:
        f.write(contenido)


def leer(clave: str) -> bytes | None:
    """Contenido del archivo, o None si no existe."""
    try:
        if USA_BLOB:
            return _blob(clave).download_blob().readall()
        with open(_ruta(clave), "rb") as f:
            return f.read()
    except Exception:  # noqa: BLE001 — no existe / inaccesible
        return None


def existe(clave: str) -> bool:
    if USA_BLOB:
        try:
            return _blob(clave).exists()
        except Exception:  # noqa: BLE001
            return False
    try:
        return os.path.exists(_ruta(clave))
    except ValueError:
        return False


def borrar(clave: str) -> None:
    try:
        if USA_BLOB:
            _blob(clave).delete_blob()
        elif os.path.exists(_ruta(clave)):
            os.remove(_ruta(clave))
    except Exception:  # noqa: BLE001 — borrar es de mejor esfuerzo
        pass
