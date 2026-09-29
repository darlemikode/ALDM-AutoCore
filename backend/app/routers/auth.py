from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db, get_db_global
from ..notifications import notificar_admin_recuperacion
from ..security import (
    authenticate_user, get_current_user, get_current_user_sin_taller, require_permission, token_usuario,
    hash_password, verify_password, generar_password_temporal,
)
from ..suscripciones import contenido_qr, estado_taller, permiso_en_modulos
from ..tenancy import MODO_SUPERADMIN, MODO_TALLER, fijar_tenant, taller_actual
from ..rate_limit import limiter
from .usuarios import listar as _listar_usuarios, crear as _crear_usuario, actualizar as _actualizar_usuario, usuarios_del_taller, es_compartido

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _estado_out(info):
    if not info:
        return None
    return schemas.EstadoSuscripcionOut(
        estado=info["estado"], paquete=info["paquete"], fecha_vencimiento=info["fecha_vencimiento"],
        dias_restantes=info["dias_restantes"], solo_lectura=info["solo_lectura"], bloqueado=info["bloqueado"],
        mensaje=info["mensaje"], modulos=sorted(info["modulos"]) if info["modulos"] is not None else None,
    )


def _talleres_de(db: Session, user: models.Usuario) -> list[schemas.TallerAccesoOut]:
    salida = []
    for m in sorted(user.membresias, key=lambda m: m.taller.nombre_comercial if m.taller else ""):
        if not m.activo or not m.taller:
            continue
        info = estado_taller(db, m.id_taller) or {}
        salida.append(schemas.TallerAccesoOut(
            id_taller=m.id_taller, nombre=m.taller.nombre_comercial, codigo=m.taller.codigo,
            rol=m.rol.nombre if m.rol else None, estado=info.get("estado"),
            bloqueado=bool(info.get("bloqueado")), mensaje=info.get("mensaje"),
        ))
    return salida


def _permisos_efectivos(user: models.Usuario, info) -> list[str]:
    rol = user.rol
    if rol is None:
        return []
    modulos = info["modulos"] if info else None
    return [p.clave for p in rol.permisos if modulos is None or permiso_en_modulos(p.clave, modulos)]


def _sesion_para(db: Session, user: models.Usuario, id_taller: int | None) -> schemas.Token:
    """Arma el token + datos de sesión del usuario dentro de un taller."""
    info = None
    taller = None
    if id_taller is not None:
        fijar_tenant(db, MODO_TALLER, id_taller)
        info = estado_taller(db, id_taller)
        taller = db.query(models.Taller).filter(models.Taller.id_taller == id_taller).first()
        user.id_ultimo_taller = id_taller
        db.commit()
    return schemas.Token(
        access_token=token_usuario(user, id_taller),
        nombre_completo=user.nombre_completo,
        username=user.username,
        rol=user.rol.nombre if user.rol else "",
        permisos=_permisos_efectivos(user, info),
        es_superadmin=bool(user.es_superadmin),
        id_taller=id_taller,
        taller=taller.nombre_comercial if taller else None,
        codigo_taller=taller.codigo if taller else None,
        talleres=_talleres_de(db, user),
        estado_suscripcion=_estado_out(info),
    )


def _elegir_taller(db: Session, user: models.Usuario, codigo: str | None) -> int | None:
    activas = [m for m in user.membresias if m.activo and m.taller and m.taller.activo]
    if codigo:
        for m in activas:
            if m.taller.codigo == codigo.strip().upper():
                return m.id_taller
    disponibles = [m for m in activas if not (estado_taller(db, m.id_taller) or {}).get("bloqueado")]
    candidatas = disponibles or activas
    if not candidatas:
        return None
    for m in candidatas:
        if m.id_taller == user.id_ultimo_taller:
            return m.id_taller
    return sorted(candidatas, key=lambda m: m.id_taller)[0].id_taller


@router.post("/login", response_model=schemas.Token)
@limiter.limit("5/minute")
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    fijar_tenant(db, MODO_SUPERADMIN)  # usuarios y membresías son globales
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    codigo = form_data.client_id or request.headers.get("x-taller")
    id_taller = _elegir_taller(db, user, codigo)
    if id_taller is None and not user.es_superadmin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tu usuario está desactivado o no tiene ningún taller asignado. Pide acceso al administrador.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _sesion_para(db, user, id_taller)


# --- Primera vez: el dueño registra su usuario administrador ------------------
def _taller_para_activar(db: Session, codigo_taller: str, codigo_activacion: str) -> models.Taller:
    taller = db.query(models.Taller).filter(models.Taller.codigo == codigo_taller.strip().upper()).first()
    codigo = (codigo_activacion or "").strip().upper().replace(" ", "").replace("-", "")
    if not taller or not taller.codigo_activacion or taller.codigo_activacion != codigo:
        raise HTTPException(status_code=400, detail="El código del taller o el código de activación no son correctos.")
    if db.query(models.UsuarioTaller).filter(models.UsuarioTaller.id_taller == taller.id_taller).first():
        raise HTTPException(status_code=400, detail="Este taller ya está activado. Entra con tu usuario y contraseña.")
    info = estado_taller(db, taller.id_taller)
    if info and info["bloqueado"]:
        raise HTTPException(status_code=402, detail=info["mensaje"])
    return taller


@router.post("/verificar-activacion")
@limiter.limit("10/minute")
def verificar_activacion(request: Request, payload: schemas.VerificarActivacionIn, db: Session = Depends(get_db_global)):
    taller = _taller_para_activar(db, payload.codigo_taller, payload.codigo_activacion)
    return {"id_taller": taller.id_taller, "nombre": taller.nombre_comercial, "codigo": taller.codigo}


@router.post("/activar-taller", response_model=schemas.Token)
@limiter.limit("10/minute")
def activar_taller(request: Request, payload: schemas.ActivarTallerIn, db: Session = Depends(get_db_global)):
    """La primera vez que se entra a un taller recién dado de alta: el
    dueño registra su usuario (queda como Administrador General) y entra."""
    from ..seed import rol_admin_de

    taller = _taller_para_activar(db, payload.codigo_taller, payload.codigo_activacion)
    username = payload.username.strip()
    if len(username) < 3 or " " in username:
        raise HTTPException(status_code=400, detail="El usuario debe tener al menos 3 caracteres y sin espacios.")
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres.")
    if not payload.nombre_completo.strip():
        raise HTTPException(status_code=400, detail="Escribe tu nombre completo.")
    if db.query(models.Usuario).filter(models.Usuario.username.ilike(username)).first():
        raise HTTPException(status_code=400, detail="Ese nombre de usuario ya está ocupado; elige otro.")
    rol_admin = rol_admin_de(db, taller.id_taller)
    usuario = models.Usuario(
        username=username, hashed_password=hash_password(payload.password), nombre_completo=payload.nombre_completo.strip(),
        telefono=payload.telefono or None, correo=payload.correo or None,
        id_rol_base=rol_admin.id_rol, activo=True, id_ultimo_taller=taller.id_taller,
    )
    usuario.membresias.append(models.UsuarioTaller(id_taller=taller.id_taller, id_rol=rol_admin.id_rol, activo=True))
    db.add(usuario)
    taller.codigo_activacion = None  # de un solo uso
    if not taller.contacto_nombre:
        taller.contacto_nombre = usuario.nombre_completo
    db.commit()
    db.refresh(usuario)
    return _sesion_para(db, usuario, taller.id_taller)


@router.get("/talleres", response_model=list[schemas.TallerAccesoOut])
def mis_talleres(db: Session = Depends(get_db), user=Depends(get_current_user_sin_taller)):
    return _talleres_de(db, user)


@router.post("/seleccionar-taller", response_model=schemas.Token)
def seleccionar_taller(payload: schemas.SeleccionarTallerIn, db: Session = Depends(get_db), user=Depends(get_current_user_sin_taller)):
    m = user.membresia(payload.id_taller)
    if m is None or not m.activo or not m.taller or not m.taller.activo:
        raise HTTPException(status_code=403, detail="No tienes acceso a ese taller.")
    info = estado_taller(db, payload.id_taller)
    if info and info["bloqueado"]:
        raise HTTPException(status_code=402, detail=info["mensaje"])
    return _sesion_para(db, user, payload.id_taller)


@router.get("/me", response_model=schemas.PerfilOut)
def me(db: Session = Depends(get_db), user=Depends(get_current_user_sin_taller)):
    tid = taller_actual(db)
    info = db.info.get("estado_suscripcion")
    perfil = schemas.PerfilOut.model_validate(user)
    perfil.permisos = _permisos_efectivos(user, info)
    perfil.id_taller = tid
    m = user.membresia(tid) if tid else None
    perfil.taller = m.taller.nombre_comercial if m and m.taller else None
    perfil.codigo_taller = m.taller.codigo if m and m.taller else None
    perfil.qr_taller = contenido_qr(perfil.codigo_taller)
    perfil.talleres = _talleres_de(db, user)
    perfil.estado_suscripcion = _estado_out(info)
    return perfil


@router.get("/estado-suscripcion", response_model=schemas.EstadoSuscripcionOut)
def estado_suscripcion(db: Session = Depends(get_db), user=Depends(get_current_user_sin_taller)):
    return _estado_out(db.info.get("estado_suscripcion")) or schemas.EstadoSuscripcionOut()


@router.post("/push-token")
def registrar_push_token(payload: schemas.PushTokenIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """La app del taller llama esto al iniciar sesión, para poder avisarle
    aquí (aviso urgente de un cliente, mensaje nuevo) aunque tenga la app
    cerrada."""
    user.push_token = payload.push_token
    db.commit()
    return {"status": "ok"}


@router.put("/password")
def cambiar_password(payload: schemas.PasswordChange, db: Session = Depends(get_db), user=Depends(get_current_user_sin_taller)):
    if not verify_password(payload.password_actual, user.hashed_password):
        raise HTTPException(status_code=400, detail="La contraseña actual no es correcta")
    if len(payload.password_nueva) < 6:
        raise HTTPException(status_code=400, detail="La nueva contraseña debe tener al menos 6 caracteres")
    user.hashed_password = hash_password(payload.password_nueva)
    db.commit()
    return {"status": "ok"}


# --- Administración de usuarios ---------------------------------------------
# (mismas reglas que /api/usuarios — ver routers/usuarios.py)
@router.get("/usuarios", response_model=list[schemas.UsuarioOut])
def listar_usuarios(db: Session = Depends(get_db), user=Depends(require_permission("usuarios.ver"))):
    return _listar_usuarios(db=db, user=user)


@router.post("/usuarios", response_model=schemas.UsuarioOut, status_code=201)
def crear_usuario(payload: schemas.UsuarioCreate, db: Session = Depends(get_db), user=Depends(require_permission("usuarios.crear"))):
    return _crear_usuario(payload=payload, db=db, user=user)


@router.put("/usuarios/{usuario_id}", response_model=schemas.UsuarioOut)
def actualizar_usuario(usuario_id: int, payload: schemas.UsuarioUpdate, db: Session = Depends(get_db), user=Depends(require_permission("usuarios.editar"))):
    return _actualizar_usuario(usuario_id=usuario_id, payload=payload, db=db, user=user)


@router.put("/usuarios/{usuario_id}/desactivar", response_model=schemas.UsuarioOut)
def desactivar_usuario(usuario_id: int, db: Session = Depends(get_db), user=Depends(require_permission("usuarios.eliminar"))):
    objetivo = usuarios_del_taller(db).filter(models.Usuario.id_usuario == usuario_id).first()
    if not objetivo:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if objetivo.id_usuario == user.id_usuario:
        raise HTTPException(status_code=400, detail="No puedes desactivar tu propia cuenta")
    objetivo.membresia().activo = False
    if not es_compartido(objetivo, taller_actual(db)):
        objetivo.activo = False
    db.commit()
    db.refresh(objetivo)
    return objetivo


# --- Roles y permisos --------------------------------------------------------
@router.get("/permisos", response_model=list[schemas.PermisoOut])
def listar_permisos(db: Session = Depends(get_db), user=Depends(require_permission("roles.ver"))):
    return db.query(models.Permiso).order_by(models.Permiso.modulo, models.Permiso.clave).all()


@router.get("/roles", response_model=list[schemas.RolOut])
def listar_roles(db: Session = Depends(get_db), user=Depends(require_permission("roles.ver"))):
    return db.query(models.Rol).options(joinedload(models.Rol.permisos)).order_by(models.Rol.nombre).all()


@router.post("/roles", response_model=schemas.RolOut, status_code=201)
def crear_rol(payload: schemas.RolCreate, db: Session = Depends(get_db), user=Depends(require_permission("roles.editar"))):
    if db.query(models.Rol).filter(models.Rol.nombre == payload.nombre).first():
        raise HTTPException(status_code=400, detail="Ya existe un rol con ese nombre")
    permisos = db.query(models.Permiso).filter(models.Permiso.clave.in_(payload.permisos)).all()
    rol = models.Rol(nombre=payload.nombre, descripcion=payload.descripcion, es_sistema=False, permisos=permisos)
    db.add(rol)
    db.commit()
    db.refresh(rol)
    return rol


@router.put("/roles/{rol_id}", response_model=schemas.RolOut)
def actualizar_rol(rol_id: int, payload: schemas.RolUpdate, db: Session = Depends(get_db), user=Depends(require_permission("roles.editar"))):
    rol = db.query(models.Rol).filter(models.Rol.id_rol == rol_id).first()
    if not rol:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    datos = payload.model_dump(exclude_unset=True)
    if "nombre" in datos and datos["nombre"]:
        rol.nombre = datos["nombre"]
    if "descripcion" in datos:
        rol.descripcion = datos["descripcion"]
    if "permisos" in datos and datos["permisos"] is not None:
        rol.permisos = db.query(models.Permiso).filter(models.Permiso.clave.in_(datos["permisos"])).all()
    db.commit()
    db.refresh(rol)
    return rol


@router.delete("/roles/{rol_id}", status_code=204)
def eliminar_rol(rol_id: int, db: Session = Depends(get_db), user=Depends(require_permission("roles.editar"))):
    rol = db.query(models.Rol).filter(models.Rol.id_rol == rol_id).first()
    if not rol:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    if rol.es_sistema:
        raise HTTPException(status_code=400, detail="Los roles base (Dueño/Hijo/Ayudante) no se pueden eliminar, solo editar sus permisos.")
    if db.query(models.UsuarioTaller).filter(models.UsuarioTaller.id_rol == rol_id).first():
        raise HTTPException(status_code=400, detail="Hay usuarios con este rol asignado; cámbialos de rol antes de eliminarlo.")
    db.delete(rol)
    db.commit()
    return None


# --- Recuperación de contraseña ---------------------------------------------
# No hay proveedor de correo/SMS conectado, así que en vez de mandar un
# enlace mágico, el sistema deja la solicitud visible para el dueño/quien
# tenga el permiso (y si hay SMTP configurado, además le manda un correo).
# Esa persona genera una contraseña temporal y se la hace llegar al usuario
# por su cuenta (llamada, WhatsApp, en persona); el usuario debe cambiarla
# al entrar.
@router.post("/recuperar-password")
@limiter.limit("5/minute")
def solicitar_recuperacion(request: Request, payload: schemas.RecuperacionRequest, db: Session = Depends(get_db)):
    fijar_tenant(db, MODO_SUPERADMIN)  # el usuario puede estar en cualquier taller
    identificador = payload.identificador.strip()
    usuario = (
        db.query(models.Usuario)
        .filter(
            (models.Usuario.username == identificador)
            | (models.Usuario.correo == identificador)
            | (models.Usuario.telefono == identificador)
        )
        .first()
    )
    # Respuesta genérica siempre, exista o no el usuario: así nadie puede
    # usar este endpoint para averiguar qué usuarios/correos existen.
    respuesta = {"detail": "Si los datos coinciden con una cuenta, se avisó a quien administra el sistema para que te ayude a recuperar el acceso."}
    if not usuario or not usuario.activo:
        return respuesta

    # Se avisa en CADA taller al que pertenece el usuario (quien lo
    # administre ahí lo ve en su campanita / en Usuarios).
    for m in usuario.membresias:
        if not m.activo:
            continue
        db.add(models.SolicitudRecuperacion(id_usuario=usuario.id_usuario, identificador_usado=identificador, id_taller=m.id_taller))
        db.add(models.Notificacion(
            id_taller=m.id_taller,
            tipo="recuperacion_password",
            titulo=f"Recuperación de acceso: {usuario.nombre_completo}",
            mensaje=f'Usuario "{usuario.username}" pidió ayuda para entrar (dato usado: {identificador}).',
        ))
        admin = (
            db.query(models.Usuario).join(models.UsuarioTaller)
            .join(models.Rol, models.Rol.id_rol == models.UsuarioTaller.id_rol)
            .filter(
                models.UsuarioTaller.id_taller == m.id_taller, models.UsuarioTaller.activo == True,
                models.Rol.nombre == "Administrador General", models.Usuario.correo.isnot(None),
            ).first()
        )
        if admin:
            notificar_admin_recuperacion(admin.correo, usuario.nombre_completo, identificador)
    db.commit()
    return respuesta


@router.get("/solicitudes-recuperacion", response_model=list[schemas.SolicitudRecuperacionOut])
def listar_solicitudes_recuperacion(
    solo_pendientes: bool = True, db: Session = Depends(get_db), user=Depends(require_permission("usuarios.ver"))
):
    query = db.query(models.SolicitudRecuperacion).options(joinedload(models.SolicitudRecuperacion.usuario))
    if solo_pendientes:
        query = query.filter(models.SolicitudRecuperacion.atendida == False)
    return query.order_by(models.SolicitudRecuperacion.fecha_solicitud.desc()).all()


@router.post("/solicitudes-recuperacion/{solicitud_id}/resolver", response_model=schemas.TempPasswordOut)
def resolver_solicitud_recuperacion(solicitud_id: int, db: Session = Depends(get_db), user=Depends(require_permission("usuarios.editar"))):
    from datetime import datetime as dt

    solicitud = (
        db.query(models.SolicitudRecuperacion)
        .filter(models.SolicitudRecuperacion.id_solicitud == solicitud_id)
        .first()
    )
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    objetivo = usuarios_del_taller(db).filter(models.Usuario.id_usuario == solicitud.id_usuario).first()
    if not objetivo:
        raise HTTPException(status_code=404, detail="El usuario de esta solicitud ya no existe en este taller")
    if es_compartido(objetivo, taller_actual(db)):
        raise HTTPException(status_code=403, detail="Este usuario también tiene acceso a otros talleres; su contraseña solo la puede restablecer ALDM (súper administrador).")

    password_temporal = generar_password_temporal()
    objetivo.hashed_password = hash_password(password_temporal)

    solicitud.atendida = True
    solicitud.fecha_atencion = dt.utcnow()
    solicitud.atendida_por = user.username

    db.commit()
    return schemas.TempPasswordOut(username=objetivo.username, password_temporal=password_temporal)
