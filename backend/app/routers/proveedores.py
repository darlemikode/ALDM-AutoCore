from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user, require_permission

router = APIRouter(prefix="/api/proveedores", tags=["proveedores"])


@router.get("/", response_model=list[schemas.ProveedorOut])
def listar(db: Session = Depends(get_db), user=Depends(require_permission("proveedores.ver"))):
    return db.query(models.Proveedor).order_by(models.Proveedor.nombre_proveedor).all()


@router.get("/{proveedor_id}", response_model=schemas.ProveedorOut)
def obtener(proveedor_id: int, db: Session = Depends(get_db), user=Depends(require_permission("proveedores.ver"))):
    proveedor = db.query(models.Proveedor).filter(models.Proveedor.id_proveedor == proveedor_id).first()
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    return proveedor


@router.post("/", response_model=schemas.ProveedorOut, status_code=201)
def crear(payload: schemas.ProveedorIn, db: Session = Depends(get_db), user=Depends(require_permission("proveedores.crear"))):
    proveedor = models.Proveedor(**payload.model_dump())
    db.add(proveedor)
    db.commit()
    db.refresh(proveedor)
    return proveedor


@router.put("/{proveedor_id}", response_model=schemas.ProveedorOut)
def actualizar(proveedor_id: int, payload: schemas.ProveedorIn, db: Session = Depends(get_db), user=Depends(require_permission("proveedores.editar"))):
    proveedor = db.query(models.Proveedor).filter(models.Proveedor.id_proveedor == proveedor_id).first()
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    for key, value in payload.model_dump().items():
        setattr(proveedor, key, value)
    db.commit()
    db.refresh(proveedor)
    return proveedor


@router.delete("/{proveedor_id}", status_code=204)
def eliminar(proveedor_id: int, db: Session = Depends(get_db), user=Depends(require_permission("proveedores.eliminar"))):
    proveedor = db.query(models.Proveedor).filter(models.Proveedor.id_proveedor == proveedor_id).first()
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    db.delete(proveedor)
    db.commit()
    return None


# --- Productos que ofrece el proveedor -------------------------------------
@router.get("/{proveedor_id}/productos", response_model=list[schemas.ProveedorProductoOut])
def listar_productos(proveedor_id: int, db: Session = Depends(get_db), user=Depends(require_permission("proveedores.ver"))):
    return db.query(models.ProveedorProducto).filter(models.ProveedorProducto.id_proveedor == proveedor_id).all()


@router.post("/{proveedor_id}/productos", response_model=schemas.ProveedorProductoOut, status_code=201)
def crear_producto(proveedor_id: int, payload: schemas.ProveedorProductoCreate, db: Session = Depends(get_db), user=Depends(require_permission("proveedores.editar"))):
    proveedor = db.query(models.Proveedor).filter(models.Proveedor.id_proveedor == proveedor_id).first()
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    producto = models.ProveedorProducto(id_proveedor=proveedor_id, **payload.model_dump())
    db.add(producto)
    db.commit()
    db.refresh(producto)
    return producto


# --- Deuda con el proveedor --------------------------------------------------
@router.get("/{proveedor_id}/deudas", response_model=list[schemas.ProveedorDeudaOut])
def listar_deudas(proveedor_id: int, db: Session = Depends(get_db), user=Depends(require_permission("proveedores.ver"))):
    return db.query(models.ProveedorDeuda).filter(models.ProveedorDeuda.id_proveedor == proveedor_id).all()


@router.post("/{proveedor_id}/deudas", response_model=schemas.ProveedorDeudaOut, status_code=201)
def crear_deuda(proveedor_id: int, payload: schemas.ProveedorDeudaCreate, db: Session = Depends(get_db), user=Depends(require_permission("proveedores.editar"))):
    proveedor = db.query(models.Proveedor).filter(models.Proveedor.id_proveedor == proveedor_id).first()
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    deuda = models.ProveedorDeuda(id_proveedor=proveedor_id, fecha=date.today(), **payload.model_dump())
    db.add(deuda)
    db.commit()
    db.refresh(deuda)
    return deuda


@router.put("/deudas/{deuda_id}", response_model=schemas.ProveedorDeudaOut)
def actualizar_deuda(deuda_id: int, payload: schemas.ProveedorDeudaIn, db: Session = Depends(get_db), user=Depends(require_permission("proveedores.editar"))):
    deuda = db.query(models.ProveedorDeuda).filter(models.ProveedorDeuda.id_deuda == deuda_id).first()
    if not deuda:
        raise HTTPException(status_code=404, detail="Deuda no encontrada")
    data = payload.model_dump()
    # No dejar que un "fecha" vacío borre la fecha original de la deuda
    if not data.get("fecha"):
        data.pop("fecha", None)
    for key, value in data.items():
        setattr(deuda, key, value)
    db.commit()
    db.refresh(deuda)
    return deuda


@router.delete("/deudas/{deuda_id}", status_code=204)
def eliminar_deuda(deuda_id: int, db: Session = Depends(get_db), user=Depends(require_permission("proveedores.eliminar"))):
    deuda = db.query(models.ProveedorDeuda).filter(models.ProveedorDeuda.id_deuda == deuda_id).first()
    if not deuda:
        raise HTTPException(status_code=404, detail="Deuda no encontrada")
    db.delete(deuda)
    db.commit()
    return None


# --- Todas las deudas pendientes (para el dashboard) ------------------------
@router.get("/deudas/pendientes", response_model=list[schemas.ProveedorDeudaOut])
def listar_todas_las_deudas(db: Session = Depends(get_db), user=Depends(require_permission("proveedores.ver"))):
    return db.query(models.ProveedorDeuda).filter(models.ProveedorDeuda.saldo_total > 0).all()
