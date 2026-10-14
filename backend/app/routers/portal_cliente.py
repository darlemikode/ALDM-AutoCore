"""
Endpoints para la app de clientes — cuentas separadas de los usuarios del
taller (ver security.py: get_current_cliente / create_client_access_token).

El cliente NUNCA se registra solo: alguien del taller genera su código de
invitación desde el panel/app (ver POST /api/clientes/{id}/invitar), y el
cliente lo usa aquí una sola vez para activar su cuenta con una contraseña
propia.
"""
from datetime import datetime
import io
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..push_notifications import enviar_push
from ..security import (
    create_client_access_token, get_current_cliente, hash_password, verify_password,
)

router = APIRouter(prefix="/api/portal-cliente", tags=["portal de clientes"])


def _buscar_por_identificador(db: Session, identificador: str):
    identificador = identificador.strip()
    return (
        db.query(models.Cliente)
        .filter(or_(models.Cliente.telefono1 == identificador, models.Cliente.correo_cliente == identificador))
        .first()
    )


@router.post("/activar", response_model=schemas.ClienteTokenOut)
def activar_cuenta(payload: schemas.ActivarCuentaIn, db: Session = Depends(get_db)):
    cliente = _buscar_por_identificador(db, payload.identificador)
    if not cliente or not cliente.codigo_invitacion:
        raise HTTPException(status_code=400, detail="No encontramos una invitación pendiente con esos datos. Pide al taller que te genere una nueva.")
    if cliente.codigo_invitacion != payload.codigo_invitacion.strip():
        raise HTTPException(status_code=400, detail="El código no coincide.")
    if len(payload.password_nueva) < 6:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres.")

    cliente.hashed_password = hash_password(payload.password_nueva)
    cliente.cuenta_activada = True
    cliente.codigo_invitacion = None  # de un solo uso
    db.commit()

    token = create_client_access_token(cliente.id_cliente)
    return schemas.ClienteTokenOut(access_token=token, id_cliente=cliente.id_cliente, nombre_cliente=cliente.nombre_cliente)


@router.post("/login", response_model=schemas.ClienteTokenOut)
def login(payload: schemas.ClienteLoginIn, db: Session = Depends(get_db)):
    cliente = _buscar_por_identificador(db, payload.identificador)
    if not cliente or not cliente.cuenta_activada or not cliente.hashed_password:
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")
    if not verify_password(payload.password, cliente.hashed_password):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")

    token = create_client_access_token(cliente.id_cliente)
    return schemas.ClienteTokenOut(access_token=token, id_cliente=cliente.id_cliente, nombre_cliente=cliente.nombre_cliente)


@router.get("/me", response_model=schemas.ClientePerfilOut)
def me(cliente: models.Cliente = Depends(get_current_cliente)):
    return cliente


@router.post("/push-token")
def registrar_push_token(payload: schemas.PushTokenIn, db: Session = Depends(get_db), cliente: models.Cliente = Depends(get_current_cliente)):
    cliente.push_token = payload.push_token
    db.commit()
    return {"status": "ok"}


@router.get("/mis-vehiculos", response_model=list[schemas.VehiculoOut])
def mis_vehiculos(db: Session = Depends(get_db), cliente: models.Cliente = Depends(get_current_cliente)):
    return db.query(models.Vehiculo).filter(models.Vehiculo.id_cliente == cliente.id_cliente).all()


@router.get("/mis-servicios", response_model=list[schemas.ServicioCompletoOut])
def mis_servicios(db: Session = Depends(get_db), cliente: models.Cliente = Depends(get_current_cliente)):
    servicios = (
        db.query(models.Servicio)
        .options(
            joinedload(models.Servicio.detalles), joinedload(models.Servicio.vehiculo),
            joinedload(models.Servicio.historial_etapas),
        )
        .filter(models.Servicio.id_cliente == cliente.id_cliente)
        .order_by(models.Servicio.fecha_entrada_servicio.desc())
        .all()
    )
    # Sin costos calculados aquí a propósito — el cliente no necesita ver
    # el desglose de precios en la lista, solo el estatus. El detalle sí
    # los trae (ver /mis-servicios/{id}).
    return servicios


@router.get("/mis-servicios/{servicio_id}", response_model=schemas.ServicioCompletoOut)
def mi_servicio_detalle(servicio_id: int, db: Session = Depends(get_db), cliente: models.Cliente = Depends(get_current_cliente)):
    from .servicios import _con_costos  # import diferido: evita ciclos entre routers

    servicio = (
        db.query(models.Servicio)
        .options(
            joinedload(models.Servicio.detalles), joinedload(models.Servicio.abonos),
            joinedload(models.Servicio.vehiculo), joinedload(models.Servicio.historial_etapas),
        )
        .filter(models.Servicio.id_servicio == servicio_id)
        .first()
    )
    if not servicio or servicio.id_cliente != cliente.id_cliente:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    return _con_costos(servicio)


@router.get("/mis-servicios/{servicio_id}/nota-remision")
def descargar_mi_nota_remision(servicio_id: int, db: Session = Depends(get_db), cliente: models.Cliente = Depends(get_current_cliente)):
    from .servicios import _calcular_costos
    from ..nota_remision_pdf import generar_nota_remision_pdf

    servicio = db.query(models.Servicio).filter(models.Servicio.id_servicio == servicio_id).first()
    if not servicio or servicio.id_cliente != cliente.id_cliente:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    if servicio.status != "cerrado":
        raise HTTPException(status_code=400, detail="La nota de remisión solo está disponible cuando tu servicio ya fue entregado.")

    costos = _calcular_costos(servicio)
    pdf_bytes = generar_nota_remision_pdf(servicio, costos)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="nota-remision-{servicio.id_servicio}.pdf"'},
    )


# --- Chat (el cliente manda como autor_tipo="cliente") ------------------------
@router.get("/mis-servicios/{servicio_id}/chat", response_model=list[schemas.MensajeChatOut])
def chat_de_mi_servicio(servicio_id: int, db: Session = Depends(get_db), cliente: models.Cliente = Depends(get_current_cliente)):
    servicio = db.query(models.Servicio).filter(models.Servicio.id_servicio == servicio_id).first()
    if not servicio or servicio.id_cliente != cliente.id_cliente:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    return (
        db.query(models.MensajeChat)
        .filter(models.MensajeChat.id_servicio == servicio_id)
        .order_by(models.MensajeChat.fecha)
        .all()
    )


@router.post("/mis-servicios/{servicio_id}/chat", response_model=schemas.MensajeChatOut, status_code=201)
async def enviar_mensaje_cliente(servicio_id: int, payload: schemas.MensajeChatIn, db: Session = Depends(get_db), cliente: models.Cliente = Depends(get_current_cliente)):
    from ..ws_manager import manager  # import diferido: mismo motivo

    servicio = db.query(models.Servicio).filter(models.Servicio.id_servicio == servicio_id).first()
    if not servicio or servicio.id_cliente != cliente.id_cliente:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")

    mensaje = models.MensajeChat(
        id_servicio=servicio_id,
        autor_tipo="cliente",
        autor_nombre=cliente.nombre_cliente,
        tipo=payload.tipo,  # "alerta" = botón de aviso urgente al mecánico
        texto=payload.texto,
    )
    db.add(mensaje)
    db.commit()
    db.refresh(mensaje)

    await manager.difundir(servicio_id, {
        "tipo": "chat",
        "id_mensaje": mensaje.id_mensaje,
        "autor_tipo": "cliente",
        "autor_nombre": mensaje.autor_nombre,
        "mensaje_tipo": mensaje.tipo,
        "texto": mensaje.texto,
        "fecha": mensaje.fecha.isoformat(),
    })
    return mensaje


# --- Agendar servicio (el cliente propone, el taller confirma) ---------------
@router.get("/tipos-servicio")
def tipos_servicio_disponibles(db: Session = Depends(get_db), cliente: models.Cliente = Depends(get_current_cliente)):
    """El catálogo real de tipos de servicio (/api/tipos-servicio/) es solo
    para el personal del taller — esta copia de lectura es para que el
    cliente pueda elegir uno al agendar, sin darle acceso al resto del
    panel de administración."""
    return db.query(models.TipoServicio).order_by(models.TipoServicio.nombre_tipo).all()


@router.get("/mis-citas", response_model=list[schemas.CitaOut])
def mis_citas(db: Session = Depends(get_db), cliente: models.Cliente = Depends(get_current_cliente)):
    return (
        db.query(models.CitaSolicitada)
        .filter(models.CitaSolicitada.id_cliente == cliente.id_cliente)
        .order_by(models.CitaSolicitada.fecha_creacion.desc())
        .all()
    )


@router.post("/mis-citas", response_model=schemas.CitaOut, status_code=201)
async def solicitar_cita(payload: schemas.CitaIn, db: Session = Depends(get_db), cliente: models.Cliente = Depends(get_current_cliente)):
    if payload.id_vehiculo:
        vehiculo = db.query(models.Vehiculo).filter(models.Vehiculo.id_vehiculo == payload.id_vehiculo).first()
        if not vehiculo or vehiculo.id_cliente != cliente.id_cliente:
            raise HTTPException(status_code=400, detail="Ese vehículo no pertenece a tu cuenta.")

    cita = models.CitaSolicitada(
        id_cliente=cliente.id_cliente,
        id_vehiculo=payload.id_vehiculo,
        id_tipo_servicio=payload.id_tipo_servicio,
        descripcion=payload.descripcion,
        fecha_propuesta=payload.fecha_propuesta,
    )
    db.add(cita)

    # Aviso al taller: campanita (web y app) + push a quien tenga la app con
    # permiso de crear servicios (antes esto no avisaba a nadie, la cita
    # solo se veía si alguien entraba a revisar la lista manualmente).
    resumen = cliente.nombre_cliente + (f" · {payload.descripcion}" if payload.descripcion else "")
    db.add(models.Notificacion(
        id_taller=cliente.id_taller, tipo="cita_solicitada",
        titulo=f"Nueva cita: {cliente.nombre_cliente}"[:150], mensaje=resumen[:300],
    ))
    tokens = [u.push_token for u in (
        db.query(models.Usuario).join(models.UsuarioTaller)
        .filter(
            models.UsuarioTaller.id_taller == cliente.id_taller, models.UsuarioTaller.activo == True,
            models.Usuario.activo == True, models.Usuario.push_token.isnot(None),
        ).all()
    )]  # noqa: E712

    db.commit()
    db.refresh(cita)

    for token in set(tokens):
        await enviar_push(token, "Nueva solicitud de cita", resumen, {"tipo": "cita_solicitada"})

    return cita


# --- Inspección digital (solo lectura para el cliente, nunca editable) ------
@router.get("/mis-servicios/{servicio_id}/inspeccion", response_model=Optional[schemas.InspeccionOut])
def mi_inspeccion(servicio_id: int, db: Session = Depends(get_db), cliente: models.Cliente = Depends(get_current_cliente)):
    servicio = db.query(models.Servicio).filter(models.Servicio.id_servicio == servicio_id).first()
    if not servicio or servicio.id_cliente != cliente.id_cliente:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")

    inspeccion = (
        db.query(models.Inspeccion)
        .options(joinedload(models.Inspeccion.resultados).joinedload(models.InspeccionResultado.item))
        .filter(models.Inspeccion.id_servicio == servicio_id)
        .order_by(models.Inspeccion.fecha.desc())
        .first()
    )
    return inspeccion  # None si todavía no le han hecho una — no es un error


@router.get("/inspecciones/{inspeccion_id}/fotos", response_model=list[schemas.FotoOut])
def fotos_de_mi_inspeccion(inspeccion_id: int, db: Session = Depends(get_db), cliente: models.Cliente = Depends(get_current_cliente)):
    """Solo lectura — el cliente ve las fotos que el taller subió durante
    la inspección de su propio vehículo, nunca puede subir ni borrar."""
    inspeccion = db.query(models.Inspeccion).filter(models.Inspeccion.id_inspeccion == inspeccion_id).first()
    if not inspeccion or not inspeccion.vehiculo or inspeccion.vehiculo.id_cliente != cliente.id_cliente:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")

    return (
        db.query(models.Foto)
        .filter(models.Foto.entidad_tipo == "inspeccion", models.Foto.entidad_id == inspeccion_id)
        .order_by(models.Foto.fecha.desc())
        .all()
    )


# --- Promociones (solo lectura, para el inicio de la app) -------------------
@router.get("/promociones", response_model=list[schemas.PromocionOut])
def promociones_vigentes(db: Session = Depends(get_db), cliente: models.Cliente = Depends(get_current_cliente)):
    hoy = datetime.utcnow().date()
    promos = (
        db.query(models.Promocion)
        .filter(models.Promocion.activa.is_(True))
        .order_by(models.Promocion.orden, models.Promocion.fecha_creacion.desc())
        .all()
    )

    # "Nuevo cliente" = nunca ha tenido un servicio en el taller todavía —
    # así una promo de "10% en tu primer servicio" no se le sigue mostrando
    # a alguien que ya es cliente frecuente.
    es_cliente_nuevo = db.query(models.Servicio).filter(models.Servicio.id_cliente == cliente.id_cliente).first() is None

    # Filtra por vigencia y por "solo nuevos clientes" aquí (no en SQL) para
    # poder tratar fechas nulas como "sin límite" de forma simple.
    vigentes = [
        p for p in promos
        if (not p.fecha_inicio or p.fecha_inicio <= hoy)
        and (not p.fecha_fin or p.fecha_fin >= hoy)
        and (not p.solo_nuevos_clientes or es_cliente_nuevo)
    ]
    return vigentes
