"""
Configuración del taller — una sola fila con los datos reales que van en
el encabezado de los documentos que se le entregan al cliente (recibo,
nota de remisión, ticket). Cualquiera puede leerla (para que los PDFs se
generen bien sin importar quién los pida); solo el Dueño la edita.
"""
import os
import re
import shutil
import uuid

from .. import almacenamiento
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user, require_permission
from ..subida_archivos import leer_y_validar_imagen, nombre_unico, guardar
from ..tenancy import taller_actual

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


def _taller_de_sesion(db: Session) -> models.Taller | None:
    id_taller = taller_actual(db)
    return db.query(models.Taller).filter(models.Taller.id_taller == id_taller).first() if id_taller else None


def _con_codigo(db: Session, config: models.ConfiguracionTaller) -> schemas.ConfiguracionTallerOut:
    salida = schemas.ConfiguracionTallerOut.model_validate(config)
    taller = _taller_de_sesion(db)
    salida.codigo_taller = taller.codigo if taller else None
    return salida


@router.get("/", response_model=schemas.ConfiguracionTallerOut)
def obtener(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return _con_codigo(db, _obtener_o_crear(db))


@router.put("/", response_model=schemas.ConfiguracionTallerOut)
def actualizar(payload: schemas.ConfiguracionTallerIn, db: Session = Depends(get_db), user=Depends(require_permission("configuracion.editar"))):
    config = _obtener_o_crear(db)
    datos = payload.model_dump(exclude_unset=True)
    codigo_nuevo = datos.pop("codigo_taller", None)
    # Solo los campos que llegaron: una app vieja que no manda teléfono 2/3 o correo 2 no los borra
    for key, value in datos.items():
        setattr(config, key, value)
    if codigo_nuevo is not None:
        taller = _taller_de_sesion(db)
        if taller:
            limpio = re.sub(r"[^A-Z0-9]", "", codigo_nuevo.strip().upper())
            if taller.codigo:
                if limpio != taller.codigo:
                    raise HTTPException(status_code=400, detail="El código del taller ya quedó fijo y no se puede cambiar.")
            elif len(limpio) >= 3:
                # Menos de 3 caracteres: todavía está escribiendo, no se
                # guarda nada (ni error) hasta que complete un código válido.
                if db.query(models.Taller).filter(models.Taller.codigo == limpio).first():
                    raise HTTPException(status_code=400, detail="Ese código ya lo usa otro taller; elige otro.")
                taller.codigo = limpio
    db.commit()
    db.refresh(config)
    return _con_codigo(db, config)


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
