from ..busqueda import coincide
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload, selectinload

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user, require_permission

router = APIRouter(prefix="/api/refacciones", tags=["refacciones"])


def _asignar_proveedores(db: Session, refaccion, ids_extra):
    """Proveedor principal + adicionales, sin repetir y solo los que existen."""
    ids = list(dict.fromkeys(([refaccion.id_proveedor] if refaccion.id_proveedor else []) + list(ids_extra)))
    refaccion.proveedores = db.query(models.Proveedor).filter(models.Proveedor.id_proveedor.in_(ids)).all() if ids else []


@router.get("/ligero")
def listar_ligero(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Solo lo necesario para llenar selectores (id, nombre, categoría, número): una consulta simple,
    sin proveedores ni compatibilidades. Es lo que usan Inventario y demás pantallas que solo eligen una refacción."""
    filas = (
        db.query(
            models.Refaccion.id_refaccion, models.Refaccion.nombre_refaccion,
            models.Refaccion.categoria, models.Refaccion.subcategoria, models.Refaccion.numero_refaccion,
        )
        .order_by(models.Refaccion.nombre_refaccion)
        .all()
    )
    return [
        {"id_refaccion": r.id_refaccion, "nombre_refaccion": r.nombre_refaccion, "categoria": r.categoria,
         "subcategoria": r.subcategoria, "numero_refaccion": r.numero_refaccion}
        for r in filas
    ]


@router.get("/resumen-categorias")
def resumen_categorias(
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("refacciones.ver")),
):
    """Total y conteo por categoría (con la búsqueda aplicada) sin traer las refacciones: lo usan los chips de filtro."""
    filas = db.query(models.Refaccion.nombre_refaccion, models.Refaccion.numero_refaccion, models.Refaccion.categoria).all()
    if q:
        filas = [r for r in filas if coincide(q, r.nombre_refaccion, r.numero_refaccion)]
    conteo: dict[str, int] = {}
    for r in filas:
        k = r.categoria or "Sin categoría"
        conteo[k] = conteo.get(k, 0) + 1
    return {"total": len(filas), "categorias": conteo}


@router.get("/", response_model=list[schemas.RefaccionOut])
def listar(
    q: Optional[str] = None,
    bajo_stock: bool = False,
    categorias: Optional[str] = None,  # nombres separados por "|" ("Sin categoría" = sin categoría)
    limite: Optional[int] = Query(None, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user=Depends(require_permission("refacciones.ver")),
):
    # Primero se filtra con una consulta ligera (solo id, nombre y número); la carga pesada de
    # proveedores y compatibilidades se hace únicamente para las refacciones que sí coinciden.
    ligera = db.query(models.Refaccion.id_refaccion, models.Refaccion.nombre_refaccion, models.Refaccion.numero_refaccion)
    if bajo_stock:
        ligera = ligera.filter(models.Refaccion.cantidad_refaccion <= 3)
    nombres = [c.strip() for c in (categorias or "").split("|") if c.strip()]
    if nombres:
        conds = []
        con = [n for n in nombres if n != "Sin categoría"]
        if con:
            conds.append(models.Refaccion.categoria.in_(con))
        if "Sin categoría" in nombres:
            conds.append(or_(models.Refaccion.categoria.is_(None), models.Refaccion.categoria == ""))
        ligera = ligera.filter(or_(*conds))
    filas = ligera.order_by(models.Refaccion.nombre_refaccion).all()
    if q:
        filas = [r for r in filas if coincide(q, r.nombre_refaccion, r.numero_refaccion)]
    if limite:
        filas = filas[offset:offset + limite]  # solo este bloque pasa a la carga pesada
    ids = [r.id_refaccion for r in filas]
    if not ids:
        return []
    query = db.query(models.Refaccion).options(
        selectinload(models.Refaccion.proveedores),
        selectinload(models.Refaccion.compatibilidades).options(
            joinedload(models.RefaccionCompatibilidad.marca_vehiculo),
            joinedload(models.RefaccionCompatibilidad.modelo_vehiculo),
        ),
        joinedload(models.Refaccion.marca_vehiculo_compatible),
        joinedload(models.Refaccion.modelo_vehiculo_compatible),
    )
    por_id = {}
    for i in range(0, len(ids), 800):  # SQL Server admite ~2100 parámetros por consulta
        for r in query.filter(models.Refaccion.id_refaccion.in_(ids[i:i + 800])).all():
            por_id[r.id_refaccion] = r
    return [por_id[i] for i in ids if i in por_id]


@router.get("/{refaccion_id}", response_model=schemas.RefaccionOut)
def obtener(refaccion_id: int, db: Session = Depends(get_db), user=Depends(require_permission("refacciones.ver"))):
    refaccion = db.query(models.Refaccion).filter(models.Refaccion.id_refaccion == refaccion_id).first()
    if not refaccion:
        raise HTTPException(status_code=404, detail="Refacción no encontrada")
    return refaccion


def _exigir_nombre_unico(db: Session, nombre, categoria, excluir_id=None):
    """No se repite una refacción con el mismo nombre en la misma categoría
    (sin importar mayúsculas ni acentos: "rotula" = "Rótula")."""
    from ..busqueda import sin_acentos
    clave = (sin_acentos(categoria), sin_acentos(nombre))
    for r in db.query(models.Refaccion.id_refaccion, models.Refaccion.nombre_refaccion, models.Refaccion.categoria).all():
        if r.id_refaccion != excluir_id and (sin_acentos(r.categoria), sin_acentos(r.nombre_refaccion)) == clave:
            donde = f" en {categoria}" if categoria else ""
            raise HTTPException(status_code=400, detail=f'"{nombre}" ya existe{donde}.')


@router.post("/", response_model=schemas.RefaccionOut, status_code=201)
def crear(payload: schemas.RefaccionIn, db: Session = Depends(get_db), user=Depends(require_permission("refacciones.crear"))):
    data = payload.model_dump()
    _exigir_nombre_unico(db, data.get("nombre_refaccion"), data.get("categoria"))
    ids_prov = data.pop("proveedores_ids", []) or []
    data["fecha_refaccion"] = data.get("fecha_refaccion") or date.today()
    refaccion = models.Refaccion(**data)
    db.add(refaccion)
    db.flush()
    _asignar_proveedores(db, refaccion, ids_prov)
    db.commit()
    db.refresh(refaccion)
    return refaccion


@router.put("/{refaccion_id}", response_model=schemas.RefaccionOut)
def actualizar(refaccion_id: int, payload: schemas.RefaccionIn, db: Session = Depends(get_db), user=Depends(require_permission("refacciones.editar"))):
    refaccion = db.query(models.Refaccion).filter(models.Refaccion.id_refaccion == refaccion_id).first()
    if not refaccion:
        raise HTTPException(status_code=404, detail="Refacción no encontrada")
    data = payload.model_dump()
    _exigir_nombre_unico(db, data.get("nombre_refaccion"), data.get("categoria"), excluir_id=refaccion_id)
    ids_prov = data.pop("proveedores_ids", []) or []
    # No dejar que un "fecha" vacío borre la fecha de alta original
    if not data.get("fecha_refaccion"):
        data.pop("fecha_refaccion", None)
    for key, value in data.items():
        setattr(refaccion, key, value)
    _asignar_proveedores(db, refaccion, ids_prov)
    db.commit()
    db.refresh(refaccion)
    return refaccion


@router.delete("/{refaccion_id}", status_code=204)
def eliminar(refaccion_id: int, db: Session = Depends(get_db), user=Depends(require_permission("refacciones.eliminar"))):
    refaccion = db.query(models.Refaccion).filter(models.Refaccion.id_refaccion == refaccion_id).first()
    if not refaccion:
        raise HTTPException(status_code=404, detail="Refacción no encontrada")
    # Con inventario registrado no se borra (se perdería el stock y su historial)
    inventario = db.query(models.InventarioRefaccion).filter(models.InventarioRefaccion.id_refaccion == refaccion_id).all()
    if inventario:
        piezas = sum(i.cantidad or 0 for i in inventario)
        raise HTTPException(status_code=400, detail=f'"{refaccion.nombre_refaccion}" tiene {piezas} pieza(s) en inventario: ajusta el inventario antes de eliminarla.')
    db.delete(refaccion)
    db.commit()
    return None


@router.post("/{refaccion_id}/compatibilidades", response_model=schemas.RefaccionOut, status_code=201)
def agregar_compatibilidad(refaccion_id: int, payload: schemas.RefaccionCompatibilidadIn, db: Session = Depends(get_db), user=Depends(require_permission("refacciones.editar"))):
    refaccion = db.query(models.Refaccion).filter(models.Refaccion.id_refaccion == refaccion_id).first()
    if not refaccion:
        raise HTTPException(status_code=404, detail="Refacción no encontrada")
    db.add(models.RefaccionCompatibilidad(id_refaccion=refaccion_id, **payload.model_dump()))
    db.commit()
    db.refresh(refaccion)
    return refaccion


@router.delete("/{refaccion_id}/compatibilidades/{compatibilidad_id}", response_model=schemas.RefaccionOut)
def quitar_compatibilidad(refaccion_id: int, compatibilidad_id: int, db: Session = Depends(get_db), user=Depends(require_permission("refacciones.editar"))):
    fila = (
        db.query(models.RefaccionCompatibilidad)
        .filter(models.RefaccionCompatibilidad.id_compatibilidad == compatibilidad_id, models.RefaccionCompatibilidad.id_refaccion == refaccion_id)
        .first()
    )
    if not fila:
        raise HTTPException(status_code=404, detail="Compatibilidad no encontrada")
    db.delete(fila)
    db.commit()
    refaccion = db.query(models.Refaccion).filter(models.Refaccion.id_refaccion == refaccion_id).first()
    return refaccion
