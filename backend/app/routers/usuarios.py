"""
Cuentas de acceso del taller. Un usuario es global (un mismo usuario puede
entrar a varios talleres); aquí cada taller administra SU relación con él:
qué rol tiene en este taller y si puede entrar o no.

Si el usuario también pertenece a otros talleres (o es súper
administrador), desde aquí solo se puede cambiar su rol/acceso en ESTE
taller — sus datos personales y su contraseña los administra ALDM desde la
app de súper administración, para que un taller no pueda afectar el acceso
de ese usuario a otro taller.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..security import hash_password, require_permission
from ..tenancy import taller_actual

router = APIRouter(prefix="/api/usuarios", tags=["usuarios"])


def usuarios_del_taller(db: Session):
    tid = taller_actual(db)
    return (
        db.query(models.Usuario)
        .join(models.UsuarioTaller, models.UsuarioTaller.id_usuario == models.Usuario.id_usuario)
        .filter(models.UsuarioTaller.id_taller == tid)
        .options(joinedload(models.Usuario.membresias).joinedload(models.UsuarioTaller.rol))
    )


def es_compartido(usuario: models.Usuario, id_taller: int) -> bool:
    return bool(usuario.es_superadmin) or any(m.id_taller != id_taller for m in usuario.membresias)


def _rol_del_taller(db: Session, id_rol: int):
    rol = db.query(models.Rol).filter(models.Rol.id_rol == id_rol).first()  # acotado al taller
    if not rol:
        raise HTTPException(status_code=400, detail="El rol indicado no existe.")
    return rol


def _validar_limite_usuarios(db: Session, tid: int):
    susc = db.query(models.Suscripcion).filter(models.Suscripcion.id_taller == tid).first()
    limite = susc.paquete.limite_usuarios if susc and susc.paquete else None
    if limite:
        activos = db.query(models.UsuarioTaller).filter(
            models.UsuarioTaller.id_taller == tid, models.UsuarioTaller.activo == True
        ).count()
        if activos >= limite:
            raise HTTPException(status_code=400, detail=f"Tu paquete permite hasta {limite} usuarios activos. Pide a ALDM ampliar tu paquete.")


@router.get("/", response_model=list[schemas.UsuarioOut])
def listar(db: Session = Depends(get_db), user=Depends(require_permission("usuarios.ver"))):
    return usuarios_del_taller(db).order_by(models.Usuario.username).all()


@router.post("/", response_model=schemas.UsuarioOut, status_code=201)
def crear(payload: schemas.UsuarioCreate, db: Session = Depends(get_db), user=Depends(require_permission("usuarios.crear"))):
    tid = taller_actual(db)
    if db.query(models.Usuario).filter(models.Usuario.username.ilike(payload.username)).first():
        raise HTTPException(status_code=400, detail="Ya existe un usuario con ese nombre de usuario.")
    _rol_del_taller(db, payload.id_rol)
    _validar_limite_usuarios(db, tid)
    datos = payload.model_dump()
    password = datos.pop("password")
    id_rol = datos.pop("id_rol")
    usuario = models.Usuario(**datos, id_rol_base=id_rol, hashed_password=hash_password(password), activo=True, id_ultimo_taller=tid)
    usuario.membresias.append(models.UsuarioTaller(id_taller=tid, id_rol=id_rol, activo=True))
    db.add(usuario)
    db.commit()
    return usuarios_del_taller(db).filter(models.Usuario.id_usuario == usuario.id_usuario).first()


@router.put("/{usuario_id}", response_model=schemas.UsuarioOut)
def actualizar(usuario_id: int, payload: schemas.UsuarioUpdate, db: Session = Depends(get_db), user=Depends(require_permission("usuarios.editar"))):
    tid = taller_actual(db)
    usuario = usuarios_del_taller(db).filter(models.Usuario.id_usuario == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    datos = payload.model_dump(exclude_unset=True)
    membresia = usuario.membresia(tid)
    if "id_rol" in datos and datos["id_rol"] is not None:
        _rol_del_taller(db, datos["id_rol"])
        membresia.id_rol = datos.pop("id_rol")
    else:
        datos.pop("id_rol", None)
    if "activo" in datos:
        if datos["activo"] and not membresia.activo:
            _validar_limite_usuarios(db, tid)
        membresia.activo = bool(datos.pop("activo"))
        if not es_compartido(usuario, tid):
            usuario.activo = membresia.activo
    personales = {k: v for k, v in datos.items() if k in ("nombre_completo", "telefono", "correo")}
    if personales:
        if es_compartido(usuario, tid) and any(getattr(usuario, k) != v for k, v in personales.items()):
            raise HTTPException(status_code=403, detail="Este usuario también tiene acceso a otros talleres; sus datos personales solo los cambia ALDM. Aquí puedes cambiar su rol o quitarle el acceso.")
        for k, v in personales.items():
            setattr(usuario, k, v)
    db.commit()
    return usuarios_del_taller(db).filter(models.Usuario.id_usuario == usuario_id).first()


@router.delete("/{usuario_id}", status_code=204)
def eliminar(usuario_id: int, db: Session = Depends(get_db), user=Depends(require_permission("usuarios.eliminar"))):
    """Quita al usuario de ESTE taller. Si no pertenece a ningún otro, se
    borra la cuenta por completo."""
    tid = taller_actual(db)
    usuario = usuarios_del_taller(db).filter(models.Usuario.id_usuario == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if usuario.id_usuario == user.id_usuario:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta.")
    membresia = usuario.membresia(tid)
    if es_compartido(usuario, tid):
        db.delete(membresia)
    else:
        db.delete(usuario)
    db.commit()
