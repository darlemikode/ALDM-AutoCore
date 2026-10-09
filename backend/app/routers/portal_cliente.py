"""
Endpoints para la app de clientes — cuentas separadas de los usuarios del
taller (ver security.py: get_current_cliente / create_client_access_token).

El cliente NUNCA se registra solo: alguien del taller genera su código de
invitación desde el panel/app (ver POST /api/clientes/{id}/invitar), y el
cliente lo usa aquí una sola vez para activar su cuenta con una contraseña
propia.
"""
from datetime import datetime
import html
import io
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..rate_limit import limiter
from ..database import get_db, get_db_global
from ..tenancy import MODO_TALLER, fijar_tenant, taller_actual
from ..security import (
    create_client_access_token, get_current_cliente, hash_password, verify_password,
)

router = APIRouter(prefix="/api/portal-cliente", tags=["portal de clientes"])


def _buscar_por_identificador(db: Session, identificador: str):
    identificador = identificador.strip()
    filtro = or_(models.Cliente.telefono1 == identificador, models.Cliente.correo_cliente == identificador)
    if taller_actual(db) is not None:
        return db.query(models.Cliente).filter(filtro).first()
    # Sin código de taller (app sin QR): si el teléfono/correo existe en UN
    # solo taller, se entra a ese; si está en varios, hace falta el QR.
    candidatos = db.query(models.Cliente).execution_options(sin_filtro_taller=True).filter(filtro).limit(2).all()
    if len(candidatos) > 1:
        raise HTTPException(status_code=409, detail="Tus datos están registrados en más de un taller. Escanea el código QR de tu taller para continuar.")
    if candidatos:
        fijar_tenant(db, MODO_TALLER, candidatos[0].id_taller)
        from ..suscripciones import estado_taller

        info = estado_taller(db, candidatos[0].id_taller)
        if info and info["bloqueado"]:
            raise HTTPException(status_code=402, detail=info["mensaje"])
        return db.query(models.Cliente).filter(models.Cliente.id_cliente == candidatos[0].id_cliente).first()
    return None


@router.get("/qr/{codigo}", response_class=HTMLResponse, include_in_schema=False)
def pagina_qr(codigo: str, db: Session = Depends(get_db_global)):
    """A esta página lleva el QR del taller: cualquier cámara de celular la
    abre. Desde aquí se abre la app de clientes ya ligada a ese taller (o
    se muestra el código para escribirlo a mano)."""
    taller = db.query(models.Taller).filter(models.Taller.codigo == codigo.strip().upper()).first()
    if not taller:
        return HTMLResponse("<h2 style='font-family:sans-serif'>Código de taller no válido.</h2>", status_code=404)
    nombre = html.escape(taller.nombre_comercial)
    cod = html.escape(taller.codigo)
    enlace = f"aldmcliente://taller/{cod}"
    return HTMLResponse(f"""<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>{nombre}</title>
<style>body{{font-family:system-ui,sans-serif;background:#132a33;color:#f3f9fa;margin:0;padding:32px 20px;text-align:center}}
.card{{max-width:420px;margin:0 auto;background:#1b3a46;border-radius:18px;padding:28px 22px}}
a.btn{{display:block;background:#2fd3c4;color:#0b1416;font-weight:700;text-decoration:none;padding:15px;border-radius:12px;margin:22px 0 10px}}
.codigo{{font-size:30px;letter-spacing:4px;font-weight:800;margin:10px 0;user-select:all}}
p{{color:#9fb3ba;line-height:1.45}}</style></head><body><div class="card">
<p>Te damos la bienvenida a</p><h1>{nombre}</h1>
<a class="btn" href="{enlace}">Abrir en la app Mi Taller</a>
<p>Si la app no se abre, instálala y escribe este código de taller:</p>
<div class="codigo">{cod}</div></div>
<script>setTimeout(function(){{location.href="{enlace}";}},400);</script></body></html>""")


@router.get("/taller", response_model=schemas.TallerPublicoOut)
def taller_por_codigo(db: Session = Depends(get_db)):
    """Datos públicos del taller del QR (se manda el código en X-Taller o
    ?taller=), para que la app de clientes confirme a qué taller entra."""
    tid = taller_actual(db)
    if tid is None:
        raise HTTPException(status_code=404, detail="Escanea el código QR de tu taller para continuar.")
    taller = db.query(models.Taller).filter(models.Taller.id_taller == tid).first()
    datos = db.query(models.ConfiguracionTaller).first()
    info = db.info.get("estado_suscripcion") or {}
    return schemas.TallerPublicoOut(
        id_taller=taller.id_taller, codigo=taller.codigo,
        nombre=(datos.nombre_taller if datos and datos.nombre_taller else taller.nombre_comercial),
        telefono=(datos.telefono if datos else None) or taller.telefono,
        direccion=datos.direccion if datos else None,
        ruta_logo=datos.ruta_logo if datos else None,
        app_habilitada=info.get("modulos") is None or "app_movil" in info.get("modulos"),
        disponible=not info.get("bloqueado", False),
    )


@router.post("/activar", response_model=schemas.ClienteTokenOut)
@limiter.limit("5/minute")
def activar_cuenta(request: Request, payload: schemas.ActivarCuentaIn, db: Session = Depends(get_db)):
    cliente = _buscar_por_identificador(db, payload.identificador)
    if not cliente or not cliente.codigo_invitacion:
        raise HTTPException(status_code=400, detail="No encontramos una invitación pendiente con esos datos. Pide al taller que te genere una nueva.")
    # El código de invitación caduca a las 72 horas (antes no caducaba nunca)
    if cliente.fecha_invitacion and (datetime.utcnow() - cliente.fecha_invitacion).total_seconds() > 72 * 3600:
        raise HTTPException(status_code=400, detail="El código ya caducó. Pide al taller que te genere uno nuevo.")
    if cliente.codigo_invitacion != payload.codigo_invitacion.strip():
        raise HTTPException(status_code=400, detail="El código no coincide.")
    if len(payload.password_nueva) < 6:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres.")

    cliente.hashed_password = hash_password(payload.password_nueva)
    cliente.cuenta_activada = True
    cliente.codigo_invitacion = None  # de un solo uso
    db.commit()

    token = create_client_access_token(cliente.id_cliente, cliente.id_taller)
    return schemas.ClienteTokenOut(access_token=token, id_cliente=cliente.id_cliente, nombre_cliente=cliente.nombre_cliente)


@router.post("/login", response_model=schemas.ClienteTokenOut)
@limiter.limit("10/minute")
def login(request: Request, payload: schemas.ClienteLoginIn, db: Session = Depends(get_db)):
    cliente = _buscar_por_identificador(db, payload.identificador)
    if cliente and not cliente.cuenta_activada and cliente.codigo_invitacion:
        # Tiene una invitación con código pendiente (la generó el taller con
        # "Invitar a la app") en vez de un acceso directo — aquí no hay
        # nada que pueda entrar todavía, así que se le manda a "Activar
        # cuenta" en vez del genérico "usuario o contraseña incorrectos".
        raise HTTPException(status_code=401, detail='Tu cuenta todavía no está activada. Usa "Activar cuenta" con el código de 6 dígitos que te dio el taller.')
    if not cliente or not cliente.cuenta_activada or not cliente.hashed_password:
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")
    if not verify_password(payload.password, cliente.hashed_password):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")

    token = create_client_access_token(cliente.id_cliente, cliente.id_taller)
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
    taller = db.query(models.ConfiguracionTaller).first()
    from ..inspeccion_pdf import inspeccion_de_servicio
    pdf_bytes = generar_nota_remision_pdf(servicio, costos, taller, inspeccion_de_servicio(db, models, servicio_id))
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


def _crear_notificacion_chat(db: Session, cliente: models.Cliente, servicio_id: int, tipo_mensaje: str, texto: str):
    """El taller antes solo se enteraba de un mensaje del cliente si alguien
    ya tenía esa orden abierta en ese momento (el WebSocket es por orden,
    ver ws_manager.py) — esto deja un registro que la campanita (mobile y
    web) puede leer aunque nadie haya estado viendo la orden."""
    es_alerta = tipo_mensaje == "alerta"
    db.add(models.Notificacion(
        tipo="alerta_cliente" if es_alerta else "chat_cliente",
        titulo=f"{'⚠️ Alerta urgente' if es_alerta else 'Mensaje'} de {cliente.nombre_cliente}",
        mensaje=(texto or "")[:280],
        id_servicio=servicio_id,
    ))


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
    _crear_notificacion_chat(db, cliente, servicio_id, payload.tipo, payload.texto)
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


@router.post("/mis-servicios/{servicio_id}/chat/foto", response_model=schemas.MensajeChatOut, status_code=201)
async def enviar_foto_cliente(
    servicio_id: int,
    archivo: UploadFile = File(...),
    texto: str = Form(None),
    db: Session = Depends(get_db),
    cliente: models.Cliente = Depends(get_current_cliente),
):
    from ..ws_manager import manager
    from .servicios import guardar_foto_chat

    servicio = db.query(models.Servicio).filter(models.Servicio.id_servicio == servicio_id).first()
    if not servicio or servicio.id_cliente != cliente.id_cliente:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    nombre = await guardar_foto_chat(archivo)
    mensaje = models.MensajeChat(
        id_servicio=servicio_id, autor_tipo="cliente", autor_nombre=cliente.nombre_cliente,
        tipo="foto", texto=(texto or "").strip() or "📷 Foto", ruta_foto=nombre,
    )
    db.add(mensaje)
    _crear_notificacion_chat(db, cliente, servicio_id, "foto", mensaje.texto)
    db.commit()
    db.refresh(mensaje)
    await manager.difundir(servicio_id, {
        "tipo": "chat", "id_mensaje": mensaje.id_mensaje, "autor_tipo": "cliente", "autor_nombre": mensaje.autor_nombre,
        "mensaje_tipo": mensaje.tipo, "texto": mensaje.texto, "ruta_foto": mensaje.ruta_foto, "fecha": mensaje.fecha.isoformat(),
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
def solicitar_cita(payload: schemas.CitaIn, db: Session = Depends(get_db), cliente: models.Cliente = Depends(get_current_cliente)):
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
    db.commit()
    db.refresh(cita)
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
        .filter(models.Promocion.activa == True)
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
