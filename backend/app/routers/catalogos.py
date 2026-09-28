"""Todos los catálogos simples, generados con la fábrica CRUD genérica."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..crud_factory import make_crud_router
from ..database import get_db
from ..security import require_permission

router = APIRouter()

router.include_router(make_crud_router(
    model=models.Pais, schema_out=schemas.PaisOut, schema_in=schemas.PaisIn,
    prefix="/api/paises", tags=["catálogos"], id_field="id_pais",
))

router.include_router(make_crud_router(
    model=models.Estado, schema_out=schemas.EstadoOut, schema_in=schemas.EstadoIn,
    prefix="/api/estados", tags=["catálogos"], id_field="id_estado",
))

router.include_router(make_crud_router(
    model=models.Ciudad, schema_out=schemas.CiudadOut, schema_in=schemas.CiudadIn,
    prefix="/api/ciudades", tags=["catálogos"], id_field="id_ciudad", filtro_campo="id_estado",
))

router.include_router(make_crud_router(
    model=models.ColorVehiculo, schema_out=schemas.ColorVehiculoOut, schema_in=schemas.ColorVehiculoIn,
    prefix="/api/colores-vehiculos", tags=["catálogos"], id_field="id_color",
))

router.include_router(make_crud_router(
    model=models.VehiculoMarca, schema_out=schemas.VehiculoMarcaOut, schema_in=schemas.VehiculoMarcaIn,
    prefix="/api/vehiculos-marcas", tags=["catálogos"], id_field="id_marca_vehiculo",
))

router.include_router(make_crud_router(
    model=models.VehiculoModelo, schema_out=schemas.VehiculoModeloOut, schema_in=schemas.VehiculoModeloIn,
    prefix="/api/vehiculos-modelos", tags=["catálogos"], id_field="id_modelo_vehiculo", filtro_campo="id_marca_vehiculo",
))

router.include_router(make_crud_router(
    model=models.RefaccionMarca, schema_out=schemas.RefaccionMarcaOut, schema_in=schemas.RefaccionMarcaIn,
    prefix="/api/refacciones-marcas", tags=["catálogos"], id_field="id_marca_refaccion",
))

router.include_router(make_crud_router(
    model=models.RefaccionCategoria, schema_out=schemas.RefaccionCategoriaOut, schema_in=schemas.RefaccionCategoriaIn,
    prefix="/api/refacciones-categorias", tags=["catálogos"], id_field="id_categoria_refaccion",
))

# El endpoint de /refacciones-subcategorias/ se retiró — esas listas ahora
# viven como refacciones reales dentro del catálogo de Refacciones (ver
# seed.py: _migrar_subcategorias_a_refacciones). El modelo RefaccionSubcategoria
# se deja en la base de datos solo para esa migración, sin exponerse ya en la API.

router.include_router(make_crud_router(
    model=models.InventarioRefaccion, schema_out=schemas.InventarioRefaccionOut, schema_in=schemas.InventarioRefaccionIn,
    prefix="/api/inventario-refacciones", tags=["catálogos"], id_field="id_inventario_refaccion", filtro_campo="id_refaccion",
))

# POST personalizado para compatibilidades: antes de crear, valida si YA
# existe otro registro de inventario para la MISMA refacción + marca de
# refacción + marca/modelo de vehículo — ese es el único caso real de
# "ya existe", nada más (antes se topaba con validaciones genéricas de la
# base de datos que disparaban el mismo mensaje por causas ajenas).
compat_router = APIRouter(prefix="/api/inventario-refacciones-compatibilidades", tags=["catálogos"])


@compat_router.post("/", response_model=schemas.InventarioRefaccionCompatibilidadOut, status_code=201)
def crear_compatibilidad(payload: schemas.InventarioRefaccionCompatibilidadIn, db: Session = Depends(get_db), user=Depends(require_permission("catalogos.crear"))):
    actual = db.query(models.InventarioRefaccion).filter(
        models.InventarioRefaccion.id_inventario_refaccion == payload.id_inventario_refaccion
    ).first()
    if not actual:
        raise HTTPException(status_code=404, detail="El registro de inventario no existe")

    duplicado = (
        db.query(models.InventarioRefaccionCompatibilidad)
        .join(models.InventarioRefaccion)
        .filter(
            models.InventarioRefaccion.id_refaccion == actual.id_refaccion,
            models.InventarioRefaccion.id_marca_refaccion == actual.id_marca_refaccion,
            models.InventarioRefaccionCompatibilidad.id_marca_vehiculo == payload.id_marca_vehiculo,
            models.InventarioRefaccionCompatibilidad.id_modelo_vehiculo == payload.id_modelo_vehiculo,
        )
        .first()
    )
    if duplicado:
        raise HTTPException(status_code=400, detail="Ya existe esta refacción con esta misma marca, registrada para ese mismo vehículo.")

    nueva = models.InventarioRefaccionCompatibilidad(**payload.model_dump())
    db.add(nueva)
    db.commit()
    db.refresh(nueva)
    return nueva


router.include_router(compat_router)

router.include_router(make_crud_router(
    model=models.InventarioRefaccionCompatibilidad, schema_out=schemas.InventarioRefaccionCompatibilidadOut, schema_in=schemas.InventarioRefaccionCompatibilidadIn,
    prefix="/api/inventario-refacciones-compatibilidades", tags=["catálogos"], id_field="id_compatibilidad", filtro_campo="id_inventario_refaccion",
))

router.include_router(make_crud_router(
    model=models.HerramientaMarca, schema_out=schemas.HerramientaMarcaOut, schema_in=schemas.HerramientaMarcaIn,
    prefix="/api/herramientas-marcas", tags=["catálogos"], id_field="id_herramienta_marca",
))

router.include_router(make_crud_router(
    model=models.TipoServicio, schema_out=schemas.TipoServicioOut, schema_in=schemas.TipoServicioIn,
    prefix="/api/tipos-servicio", tags=["catálogos"], id_field="id_tipo_servicio",
))
