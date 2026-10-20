"""
Cuentas de acceso al sistema. Cada usuario tiene un rol (ver roles.py) que
determina exactamente qué puede ver y hacer. Solo quien tiene el permiso
"usuarios.*" administra esto — por defecto, solo el Administrador General.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload

from .. import models, schemas, password_tokens
from ..database import get_db
from ..notifications import enviar_correo_bienvenida, enviar_correo_restablecer
from ..security import generar_password_temporal, hash_password, require_permission
from ..tenancy import taller_actual

router = APIRouter(prefix="/api/usuarios", tags=["usuarios"])


def _con_rol(db: Session):
    # Usuario.rol es una @property calculada desde la membresía del taller
    # activo (no una relación de SQLAlchemy) — lo que hay que precargar es
    # la relación real: membresias -> rol.
    return db.query(models.Usuario).options(
        joinedload(models.Usuario.membresias).joinedload(models.UsuarioTaller.rol)
    )


def usuarios_del_taller(db: Session):
    """Usuarios con membresía (de cualquier estado) en el taller activo de la sesión."""
    query = _con_rol(db)
    id_taller = taller_actual(db)
    if id_taller is not None:
        query = query.join(
            models.UsuarioTaller, models.UsuarioTaller.id_usuario == models.Usuario.id_usuario
        ).filter(models.UsuarioTaller.id_taller == id_taller)
    return query


def es_compartido(usuario: models.Usuario, id_taller: int | None) -> bool:
    """True si el usuario también tiene membresía activa en algún otro taller distinto a id_taller."""
    return any(m.activo and m.id_taller != id_taller for m in usuario.membresias)


def _validar_username(username: str):
    if " " in username:
        raise HTTPException(status_code=400, detail="El nombre de usuario no puede llevar espacios.")


@router.get("/", response_model=list[schemas.UsuarioOut])
def listar(db: Session = Depends(get_db), user=Depends(require_permission("usuarios.ver"))):
    # Solo los usuarios con membresía en el taller activo — no los de otros
    # talleres (eso es del súper administrador, ver routers/superadmin.py).
    return usuarios_del_taller(db).order_by(models.Usuario.username).all()


@router.post("/", response_model=schemas.UsuarioOut, status_code=201)
def crear(payload: schemas.UsuarioCreate, db: Session = Depends(get_db), user=Depends(require_permission("usuarios.crear"))):
    _validar_username(payload.username)
    if db.query(models.Usuario).filter(models.Usuario.username.ilike(payload.username)).first():
        raise HTTPException(status_code=400, detail="Ya existe un usuario con ese nombre de usuario.")
    if db.query(models.Usuario).filter(models.Usuario.correo.ilike(payload.correo)).first():
        raise HTTPException(status_code=400, detail="Ya existe un usuario con ese correo.")
    if not db.query(models.Rol).filter(models.Rol.id_rol == payload.id_rol).first():
        raise HTTPException(status_code=400, detail="El rol indicado no existe.")
    id_taller = taller_actual(db)
    if id_taller is None:
        raise HTTPException(status_code=400, detail="No hay un taller activo en la sesión.")
    datos = payload.model_dump()
    # El rol vive en la membresía (usuarios_talleres), no en el usuario
    # global — Usuario.id_rol es una @property que necesita que esa
    # membresía ya exista, así que aquí se maneja aparte.
    id_rol = datos.pop("id_rol")
    # Si no se manda una contraseña directa, se genera una al azar (nadie
    # la usa) y se le manda al usuario un enlace para que cree la suya.
    password = datos.pop("password") or generar_password_temporal()
    manda_enlace = not payload.password
    usuario = models.Usuario(**datos, hashed_password=hash_password(password), activo=True)
    db.add(usuario)
    db.flush()  # asigna id_usuario antes de crear la membresía
    db.add(models.UsuarioTaller(id_usuario=usuario.id_usuario, id_taller=id_taller, id_rol=id_rol, activo=True))
    db.commit()
    db.refresh(usuario)
    if manda_enlace:
        token = password_tokens.generar_token(usuario, password_tokens.TIPO_SETUP)
        enviar_correo_bienvenida(usuario.correo, usuario.nombre_completo, token)
    return _con_rol(db).filter(models.Usuario.id_usuario == usuario.id_usuario).first()


@router.put("/{usuario_id}", response_model=schemas.UsuarioOut)
def actualizar(usuario_id: int, payload: schemas.UsuarioUpdate, db: Session = Depends(get_db), user=Depends(require_permission("usuarios.editar"))):
    usuario = usuarios_del_taller(db).filter(models.Usuario.id_usuario == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    datos = payload.model_dump(exclude_unset=True)
    if "username" in datos:
        _validar_username(datos["username"])
        if db.query(models.Usuario).filter(
            models.Usuario.username.ilike(datos["username"]), models.Usuario.id_usuario != usuario_id
        ).first():
            raise HTTPException(status_code=400, detail="Ya existe un usuario con ese nombre de usuario.")
    if "id_rol" in datos:
        id_rol = datos.pop("id_rol")
        if not db.query(models.Rol).filter(models.Rol.id_rol == id_rol).first():
            raise HTTPException(status_code=400, detail="El rol indicado no existe.")
        membresia = usuario.membresia(taller_actual(db))
        if membresia is not None:
            membresia.id_rol = id_rol
    for key, value in datos.items():
        setattr(usuario, key, value)
    db.commit()
    return _con_rol(db).filter(models.Usuario.id_usuario == usuario_id).first()


@router.post("/{usuario_id}/restablecer-enlace")
def restablecer_enlace(usuario_id: int, db: Session = Depends(get_db), user=Depends(require_permission("usuarios.editar"))):
    """El admin le manda a un usuario de su taller el mismo enlace de
    "olvidé mi contraseña" que mandaría el self-service — sin generarle ni
    dictarle ninguna contraseña."""
    usuario = usuarios_del_taller(db).filter(models.Usuario.id_usuario == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if not usuario.correo:
        raise HTTPException(status_code=400, detail="Este usuario no tiene correo registrado.")
    token = password_tokens.generar_token(usuario, password_tokens.TIPO_RESET)
    enviar_correo_restablecer(usuario.correo, usuario.nombre_completo, token)
    return {"detail": f"Se mandó el enlace a {usuario.correo}."}


@router.delete("/{usuario_id}", status_code=204)
def eliminar(usuario_id: int, db: Session = Depends(get_db), user=Depends(require_permission("usuarios.eliminar"))):
    usuario = usuarios_del_taller(db).filter(models.Usuario.id_usuario == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    db.delete(usuario)
    db.commit()
