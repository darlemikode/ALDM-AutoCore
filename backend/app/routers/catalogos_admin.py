"""Administración del CATÁLOGO GENERAL (solo súper administrador).

Los talleres solo pueden leer estos catálogos (ver catalogos.py, modo "lectura"); aquí se dan de alta,
editan y eliminan — sin taller, para que los vean todos. Incluye las imágenes de modelos y marcas."""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import almacenamiento, models, schemas
from ..crud_factory import make_crud_router
from ..database import get_db_global
from ..security import require_superadmin
from ..subida_archivos import leer_y_validar_imagen, nombre_unico

router = APIRouter()

router.include_router(make_crud_router(
    model=models.Pais, schema_out=schemas.PaisOut, schema_in=schemas.PaisIn,
    prefix="/api/superadmin/catalogos/paises", tags=["catálogo general"], id_field="id_pais", modo="global",
))

router.include_router(make_crud_router(
    model=models.Estado, schema_out=schemas.EstadoOut, schema_in=schemas.EstadoIn,
    prefix="/api/superadmin/catalogos/estados", tags=["catálogo general"], id_field="id_estado", modo="global",
))

router.include_router(make_crud_router(
    model=models.Ciudad, schema_out=schemas.CiudadOut, schema_in=schemas.CiudadIn,
    prefix="/api/superadmin/catalogos/ciudades", tags=["catálogo general"], id_field="id_ciudad", filtro_campo="id_estado", modo="global",
))

router.include_router(make_crud_router(
    model=models.ColorVehiculo, schema_out=schemas.ColorVehiculoOut, schema_in=schemas.ColorVehiculoIn,
    prefix="/api/superadmin/catalogos/colores-vehiculos", tags=["catálogo general"], id_field="id_color", modo="global",
))

router.include_router(make_crud_router(
    model=models.VehiculoMarca, schema_out=schemas.VehiculoMarcaOut, schema_in=schemas.VehiculoMarcaIn,
    prefix="/api/superadmin/catalogos/vehiculos-marcas", tags=["catálogo general"], id_field="id_marca_vehiculo", modo="global",
))

router.include_router(make_crud_router(
    model=models.VehiculoModelo, schema_out=schemas.VehiculoModeloOut, schema_in=schemas.VehiculoModeloIn,
    prefix="/api/superadmin/catalogos/vehiculos-modelos", tags=["catálogo general"], id_field="id_modelo_vehiculo", filtro_campo="id_marca_vehiculo", modo="global",
))

router.include_router(make_crud_router(
    model=models.RefaccionMarca, schema_out=schemas.RefaccionMarcaOut, schema_in=schemas.RefaccionMarcaIn,
    prefix="/api/superadmin/catalogos/refacciones-marcas", tags=["catálogo general"], id_field="id_marca_refaccion", modo="global",
))

router.include_router(make_crud_router(
    model=models.RefaccionCategoria, schema_out=schemas.RefaccionCategoriaOut, schema_in=schemas.RefaccionCategoriaIn,
    prefix="/api/superadmin/catalogos/refacciones-categorias", tags=["catálogo general"], id_field="id_categoria_refaccion", modo="global",
))

router.include_router(make_crud_router(
    model=models.HerramientaMarca, schema_out=schemas.HerramientaMarcaOut, schema_in=schemas.HerramientaMarcaIn,
    prefix="/api/superadmin/catalogos/herramientas-marcas", tags=["catálogo general"], id_field="id_herramienta_marca", modo="global",
))

router.include_router(make_crud_router(
    model=models.TipoServicio, schema_out=schemas.TipoServicioOut, schema_in=schemas.TipoServicioIn,
    prefix="/api/superadmin/catalogos/tipos-servicio", tags=["catálogo general"], id_field="id_tipo_servicio", modo="global",
))


def _validar_foto_de_vehiculo(contenido: bytes, extension: str) -> None:
    """Revisión ligera (sin IA, no pesa): una foto de auto es horizontal y no es un ícono. Descarta
    íconos/capturas diminutas, imágenes muy verticales o muy alargadas (planos, banners, logos)."""
    if extension == ".heic":  # Pillow no la lee siempre; se confía en extensión y tamaño
        return
    import io
    from PIL import Image

    try:
        ancho, alto = Image.open(io.BytesIO(contenido)).size
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="No se pudo leer la imagen.")
    if ancho < 240 or alto < 140:
        raise HTTPException(status_code=400, detail="La imagen es muy pequeña: sube una foto del vehículo de al menos 240×140 px.")
    proporcion = ancho / alto
    if proporcion < 0.7 or proporcion > 3.2:
        raise HTTPException(status_code=400, detail="La foto no parece de un vehículo (proporción muy vertical o alargada). Sube una foto horizontal del auto.")


# ---- Foto propia de cada modelo de vehículo (reemplaza a la imagen sugerida) ----
@router.post("/api/superadmin/catalogos/vehiculos-modelos/{id_modelo}/imagen", response_model=schemas.VehiculoModeloOut, tags=["catálogo general"])
async def subir_imagen_modelo(
    id_modelo: int, archivo: UploadFile = File(...), db: Session = Depends(get_db_global),
    user=Depends(require_superadmin),
):
    modelo = db.query(models.VehiculoModelo).filter(models.VehiculoModelo.id_modelo_vehiculo == id_modelo).first()
    if not modelo:
        raise HTTPException(status_code=404, detail="Modelo no encontrado")
    contenido, extension = await leer_y_validar_imagen(archivo)
    _validar_foto_de_vehiculo(contenido, extension)
    nombre = nombre_unico(f"modelo_{id_modelo}", extension)
    almacenamiento.guardar(nombre, contenido)
    anterior = modelo.imagen
    modelo.imagen = nombre
    db.commit()
    db.refresh(modelo)
    if anterior:
        try:
            almacenamiento.borrar(anterior)
        except Exception:  # noqa: BLE001 — si no se puede borrar la anterior, no importa
            pass
    return modelo


@router.delete("/api/superadmin/catalogos/vehiculos-modelos/{id_modelo}/imagen", response_model=schemas.VehiculoModeloOut, tags=["catálogo general"])
def quitar_imagen_modelo(id_modelo: int, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    modelo = db.query(models.VehiculoModelo).filter(models.VehiculoModelo.id_modelo_vehiculo == id_modelo).first()
    if not modelo:
        raise HTTPException(status_code=404, detail="Modelo no encontrado")
    if modelo.imagen:
        try:
            almacenamiento.borrar(modelo.imagen)
        except Exception:  # noqa: BLE001
            pass
        modelo.imagen = None
        db.commit()
        db.refresh(modelo)
    return modelo


# ---- Logo propio de cada marca de refacción (reemplaza al sugerido) ----
def _validar_logo(contenido: bytes, extension: str) -> None:
    """Revisión ligera: un logo no debe ser un ícono diminuto ni una tira extrema."""
    if extension == ".heic":
        return
    import io
    from PIL import Image

    try:
        ancho, alto = Image.open(io.BytesIO(contenido)).size
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="No se pudo leer la imagen.")
    if ancho < 80 or alto < 50:
        raise HTTPException(status_code=400, detail="La imagen es muy pequeña: sube un logo de al menos 80×50 px.")
    if not 0.25 <= ancho / alto <= 5:
        raise HTTPException(status_code=400, detail="La proporción de la imagen no parece un logo.")


@router.post("/api/superadmin/catalogos/refacciones-marcas/{id_marca}/imagen", response_model=schemas.RefaccionMarcaOut, tags=["catálogo general"])
async def subir_imagen_marca_refaccion(
    id_marca: int, archivo: UploadFile = File(...), db: Session = Depends(get_db_global),
    user=Depends(require_superadmin),
):
    marca = db.query(models.RefaccionMarca).filter(models.RefaccionMarca.id_marca_refaccion == id_marca).first()
    if not marca:
        raise HTTPException(status_code=404, detail="Marca no encontrada")
    contenido, extension = await leer_y_validar_imagen(archivo)
    _validar_logo(contenido, extension)
    nombre = nombre_unico(f"marcaref_{id_marca}", extension)
    almacenamiento.guardar(nombre, contenido)
    anterior = marca.imagen
    marca.imagen = nombre
    db.commit()
    db.refresh(marca)
    if anterior:
        try:
            almacenamiento.borrar(anterior)
        except Exception:  # noqa: BLE001
            pass
    return marca


@router.delete("/api/superadmin/catalogos/refacciones-marcas/{id_marca}/imagen", response_model=schemas.RefaccionMarcaOut, tags=["catálogo general"])
def quitar_imagen_marca_refaccion(id_marca: int, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
    marca = db.query(models.RefaccionMarca).filter(models.RefaccionMarca.id_marca_refaccion == id_marca).first()
    if not marca:
        raise HTTPException(status_code=404, detail="Marca no encontrada")
    if marca.imagen:
        try:
            almacenamiento.borrar(marca.imagen)
        except Exception:  # noqa: BLE001
            pass
        marca.imagen = None
        db.commit()
        db.refresh(marca)
    return marca
