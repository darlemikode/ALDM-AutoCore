"""
Roles y permisos. Los 4 roles base de la jerarquía del taller
(es_sistema=True) no se pueden borrar, pero sí editar sus permisos.
Ver o administrar esto requiere permisos especiales ("roles.ver" /
"roles.editar") que, por defecto, solo tiene el Administrador General.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import require_permission

router = APIRouter(prefix="/api/roles", tags=["roles"])


@router.get("/", response_model=list[schemas.RolOut])
def listar(db: Session = Depends(get_db), user=Depends(require_permission("roles.ver"))):
    return db.query(models.Rol).order_by(models.Rol.id_rol).all()


@router.get("/permisos-disponibles", response_model=list[schemas.PermisoOut])
def listar_permisos_disponibles(db: Session = Depends(get_db), user=Depends(require_permission("roles.ver"))):
    """Catálogo completo de permisos — lo consume la pantalla de armar/editar
    un rol, para mostrar todas las casillas posibles agrupadas por módulo."""
    return db.query(models.Permiso).order_by(models.Permiso.modulo, models.Permiso.clave).all()


def _resolver_permisos(db: Session, claves: list[str]) -> list[models.Permiso]:
    if not claves:
        return []
    permisos = db.query(models.Permiso).filter(models.Permiso.clave.in_(claves)).all()
    encontradas = {p.clave for p in permisos}
    faltantes = set(claves) - encontradas
    if faltantes:
        raise HTTPException(status_code=400, detail=f"Permiso(s) no reconocido(s): {', '.join(sorted(faltantes))}")
    return permisos


@router.post("/", response_model=schemas.RolOut, status_code=201)
def crear(payload: schemas.RolCreate, db: Session = Depends(get_db), user=Depends(require_permission("roles.editar"))):
    if db.query(models.Rol).filter(models.Rol.nombre == payload.nombre).first():
        raise HTTPException(status_code=400, detail="Ya existe un rol con ese nombre.")
    rol = models.Rol(nombre=payload.nombre, descripcion=payload.descripcion, es_sistema=False)
    rol.permisos = _resolver_permisos(db, payload.permisos)
    db.add(rol)
    db.commit()
    db.refresh(rol)
    return rol


@router.put("/{rol_id}", response_model=schemas.RolOut)
def actualizar(rol_id: int, payload: schemas.RolUpdate, db: Session = Depends(get_db), user=Depends(require_permission("roles.editar"))):
    rol = db.query(models.Rol).filter(models.Rol.id_rol == rol_id).first()
    if not rol:
        raise HTTPException(status_code=404, detail="Rol no encontrado.")
    datos = payload.model_dump(exclude_unset=True)
    permisos_claves = datos.pop("permisos", None)
    for key, value in datos.items():
        setattr(rol, key, value)
    if permisos_claves is not None:
        rol.permisos = _resolver_permisos(db, permisos_claves)
    db.commit()
    db.refresh(rol)
    return rol


@router.delete("/{rol_id}", status_code=204)
def eliminar(rol_id: int, db: Session = Depends(get_db), user=Depends(require_permission("roles.editar"))):
    rol = db.query(models.Rol).filter(models.Rol.id_rol == rol_id).first()
    if not rol:
        raise HTTPException(status_code=404, detail="Rol no encontrado.")
    if rol.es_sistema:
        raise HTTPException(status_code=400, detail="Los roles base del sistema no se pueden eliminar.")
    if db.query(models.UsuarioTaller).filter(models.UsuarioTaller.id_rol == rol_id).first():
        raise HTTPException(status_code=400, detail="Hay usuarios con este rol — reasígnalos antes de eliminarlo.")
    db.delete(rol)
    db.commit()
