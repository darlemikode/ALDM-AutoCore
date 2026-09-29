"""
Fotos adjuntas a vehículos u órdenes de servicio (daños, avances, cualquier
aclaración visual). Los archivos se guardan en `app/uploads/` dentro del
propio proyecto y se sirven como archivos estáticos desde `/uploads/...`
(ver el montaje en main.py) — no se usa ningún servicio externo de por
medio (S3, Cloudinary, etc.), así que no hace falta ninguna cuenta ni
credencial adicional para que esto funcione.
"""
import os
import shutil
import uuid

from .. import almacenamiento
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user
from ..subida_archivos import leer_y_validar_imagen, nombre_unico, guardar

router = APIRouter(prefix="/api/fotos", tags=["fotos"])

CARPETA_UPLOADS = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(CARPETA_UPLOADS, exist_ok=True)

# A qué permiso corresponde poder subir/borrar fotos de cada tipo de entidad
PERMISO_POR_ENTIDAD = {
    "vehiculo": "vehiculos.editar", "servicio": "servicios.editar", "inspeccion": "servicios.editar",
    "proveedor": "proveedores.editar", "herramienta": "herramientas.editar", "cliente": "clientes.editar",
}
EXTENSIONES_VALIDAS = {".jpg", ".jpeg", ".png", ".webp", ".heic"}


@router.get("/", response_model=list[schemas.FotoOut])
def listar(entidad_tipo: str, entidad_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return (
        db.query(models.Foto)
        .filter(models.Foto.entidad_tipo == entidad_tipo, models.Foto.entidad_id == entidad_id)
        .order_by(models.Foto.fecha.desc())
        .all()
    )


@router.post("/", response_model=schemas.FotoOut, status_code=201)
async def subir(
    entidad_tipo: str = Form(...),
    entidad_id: int = Form(...),
    descripcion: str = Form(None),
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    permiso = PERMISO_POR_ENTIDAD.get(entidad_tipo)
    if not permiso:
        raise HTTPException(status_code=400, detail="Tipo de entidad no válido (usa 'vehiculo' o 'servicio').")
    if not user.tiene_permiso(permiso):
        raise HTTPException(status_code=403, detail="Tu rol no tiene permiso para subir fotos aquí.")

    contenido, extension = await leer_y_validar_imagen(archivo)
    nombre_archivo = nombre_unico(f"{entidad_tipo}_{entidad_id}", extension)
    guardar(CARPETA_UPLOADS, nombre_archivo, contenido)

    foto = models.Foto(
        entidad_tipo=entidad_tipo,
        entidad_id=entidad_id,
        ruta_archivo=nombre_archivo,
        descripcion=descripcion,
        subida_por=user.username,
    )
    db.add(foto)
    db.commit()
    db.refresh(foto)
    return foto


@router.delete("/{foto_id}", status_code=204)
def eliminar(foto_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    foto = db.query(models.Foto).filter(models.Foto.id_foto == foto_id).first()
    if not foto:
        raise HTTPException(status_code=404, detail="Foto no encontrada")

    permiso = PERMISO_POR_ENTIDAD.get(foto.entidad_tipo)
    if permiso and not user.tiene_permiso(permiso):
        raise HTTPException(status_code=403, detail="Tu rol no tiene permiso para eliminar esta foto.")

    almacenamiento.borrar(foto.ruta_archivo)

    db.delete(foto)
    db.commit()
    return None
