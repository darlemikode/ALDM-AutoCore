from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from .security import SECRET_KEY, ALGORITHM
from .sesion_taller import sesion_desde_token
from . import models
from .ws_manager import manager, manager_global

router = APIRouter()


def _sub(token: str) -> str | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM]).get("sub", "")
    except JWTError:
        return None


def _validar_acceso(token: str, servicio_id: int, db: Session, id_taller: int | None) -> bool:
    """Un cliente solo puede conectarse a SU PROPIO servicio; alguien del
    taller puede conectarse a cualquiera DE SU TALLER, si tiene permiso de
    ver órdenes."""
    sub = _sub(token)
    if not sub or id_taller is None:
        return False
    servicio = db.query(models.Servicio).filter(models.Servicio.id_servicio == servicio_id).first()  # acotado al taller
    if not servicio:
        return False
    if sub.startswith("cliente:"):
        try:
            id_cliente = int(sub.split(":", 1)[1])
        except ValueError:
            return False
        cliente = db.query(models.Cliente).filter(models.Cliente.id_cliente == id_cliente).first()
        return bool(cliente and cliente.cuenta_activada and servicio.id_cliente == id_cliente)
    usuario = db.query(models.Usuario).filter(models.Usuario.username == sub).first()
    return bool(usuario and usuario.activo and usuario.activo_en_taller and usuario.tiene_permiso("servicios.ver"))


@router.websocket("/api/ws/servicio/{servicio_id}")
async def ws_servicio(websocket: WebSocket, servicio_id: int, token: str = Query(...)):
    """El navegador/app se conecta aquí para recibir en vivo los mensajes
    de chat y los cambios de etapa de una orden — nada se manda desde este
    canal, solo se recibe (ver ws_manager.py para el porqué)."""
    db, id_taller = sesion_desde_token(token)
    try:
        autorizado = _validar_acceso(token, servicio_id, db, id_taller)
    finally:
        db.close()

    if not autorizado:
        await websocket.close(code=4401)
        return

    await manager.conectar(servicio_id, websocket)
    try:
        while True:
            # No hace nada con lo que llegue — solo mantiene la conexión
            # viva para poder seguir empujando mensajes desde el servidor.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.desconectar(servicio_id, websocket)


def _token_valido(token: str, db: Session, id_taller: int | None) -> bool:
    sub = _sub(token)
    if not sub or id_taller is None:
        return False
    if sub.startswith("cliente:"):
        try:
            id_cliente = int(sub.split(":", 1)[1])
        except ValueError:
            return False
        cliente = db.query(models.Cliente).filter(models.Cliente.id_cliente == id_cliente).first()
        return bool(cliente and cliente.cuenta_activada)
    usuario = db.query(models.Usuario).filter(models.Usuario.username == sub).first()
    return bool(usuario and usuario.activo and usuario.activo_en_taller)


@router.websocket("/api/ws/global")
async def ws_global(websocket: WebSocket, token: str = Query(...)):
    """Canal de "algo cambió en la base de datos" del taller — lo usa el
    panel web, la app del taller y la app de clientes para refrescar
    listas/pantallas solas (ver ws_manager.py: ConnectionManagerGlobal)."""
    db, id_taller = sesion_desde_token(token)
    try:
        autorizado = _token_valido(token, db, id_taller)
    finally:
        db.close()

    if not autorizado:
        await websocket.close(code=4401)
        return

    await manager_global.conectar(websocket, id_taller)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager_global.desconectar(websocket)
