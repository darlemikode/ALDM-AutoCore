"""
Configuración del taller — una sola fila con los datos reales que van en
el encabezado de los documentos que se le entregan al cliente (recibo,
nota de remisión, ticket). Cualquiera puede leerla (para que los PDFs se
generen bien sin importar quién los pida); solo el Dueño la edita.
"""
import os
import shutil
import uuid

from .. import almacenamiento
from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user, require_permission
from ..subida_archivos import leer_y_validar_imagen, nombre_unico, guardar

router = APIRouter(prefix="/api/configuracion-taller", tags=["configuracion-taller"])

CARPETA_UPLOADS = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")


def _obtener_o_crear(db: Session) -> models.ConfiguracionTaller:
    config = db.query(models.ConfiguracionTaller).first()
    if not config:
        config = models.ConfiguracionTaller()
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


@router.get("/", response_model=schemas.ConfiguracionTallerOut)
def obtener(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return _obtener_o_crear(db)


@router.put("/", response_model=schemas.ConfiguracionTallerOut)
def actualizar(payload: schemas.ConfiguracionTallerIn, db: Session = Depends(get_db), user=Depends(require_permission("configuracion.editar"))):
    config = _obtener_o_crear(db)
    for key, value in payload.model_dump().items():
        setattr(config, key, value)
    db.commit()
    db.refresh(config)
    return config


@router.post("/logo", response_model=schemas.ConfiguracionTallerOut)
async def subir_logo(archivo: UploadFile = File(...), db: Session = Depends(get_db), user=Depends(require_permission("configuracion.editar"))):
    contenido, extension = await leer_y_validar_imagen(archivo)
    config = _obtener_o_crear(db)
    if config.ruta_logo:
        almacenamiento.borrar(config.ruta_logo)
    nombre_archivo = nombre_unico("logo_taller", extension)
    guardar(CARPETA_UPLOADS, nombre_archivo, contenido)
    config.ruta_logo = nombre_archivo
    db.commit()
    db.refresh(config)
    return config
