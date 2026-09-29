"""
Manejo de conexiones WebSocket para tiempo real de verdad (chat y cambios
de estatus) — no es "actualizar cada rato", los mensajes se empujan al
instante a quien esté viendo esa orden de servicio (cliente y/o taller).

Diseño simple a propósito: los mensajes se ENVÍAN por un POST normal (REST)
que los guarda en la base y luego los reparte a todos los que estén
conectados por WebSocket a esa orden. El WebSocket solo se usa para
ESCUCHAR (recibir en vivo) — así cualquier cliente (web, app del taller,
app de clientes) puede mandar mensajes sin tener que implementar el lado
"enviar" de un WebSocket, que es la parte más propensa a errores.
"""
import asyncio
import json
import os
from collections import defaultdict

from fastapi import WebSocket


# --- Bus Redis (opcional) ---------------------------------------------------
# Con REDIS_URL, cada aviso se publica en Redis y TODAS las instancias lo
# reparten a sus WebSockets locales; así el chat y los refrescos funcionan
# con varias instancias. Sin REDIS_URL todo sigue en memoria (una instancia).
REDIS_URL = os.getenv("REDIS_URL")
_CANAL = "aldm_ws"
_redis = None


def _cliente():
    global _redis
    if _redis is None:
        import redis.asyncio as aioredis

        _redis = aioredis.from_url(REDIS_URL, decode_responses=True)
    return _redis


async def _publicar(tipo: str, clave, mensaje: dict) -> bool:
    if not REDIS_URL:
        return False
    try:
        await _cliente().publish(_CANAL, json.dumps({"t": tipo, "k": clave, "m": mensaje}))
        return True
    except Exception:  # noqa: BLE001 — si Redis falla, se reparte solo a esta instancia
        return False


async def escuchar_bus():
    """Tarea de fondo: recibe avisos de Redis y los reparte localmente."""
    while True:
        try:
            pubsub = _cliente().pubsub()
            await pubsub.subscribe(_CANAL)
            async for item in pubsub.listen():
                if item.get("type") != "message":
                    continue
                datos = json.loads(item["data"])
                if datos["t"] == "servicio":
                    await manager._difundir_local(datos["k"], datos["m"])
                else:
                    await manager_global._difundir_local(datos["m"], datos["k"])
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            await asyncio.sleep(5)


class ConnectionManager:
    def __init__(self):
        self.conexiones_por_servicio: dict[int, list[WebSocket]] = defaultdict(list)

    async def conectar(self, servicio_id: int, websocket: WebSocket):
        await websocket.accept()
        self.conexiones_por_servicio[servicio_id].append(websocket)

    def desconectar(self, servicio_id: int, websocket: WebSocket):
        if websocket in self.conexiones_por_servicio[servicio_id]:
            self.conexiones_por_servicio[servicio_id].remove(websocket)
        if not self.conexiones_por_servicio[servicio_id]:
            del self.conexiones_por_servicio[servicio_id]

    async def difundir(self, servicio_id: int, mensaje: dict):
        if not await _publicar("servicio", servicio_id, mensaje):
            await self._difundir_local(servicio_id, mensaje)

    async def _difundir_local(self, servicio_id: int, mensaje: dict):
        """Manda `mensaje` (ya serializable a JSON) a todos los conectados
        a esa orden de servicio. Si una conexión ya se cayó, se limpia sola."""
        caidas = []
        for ws in self.conexiones_por_servicio.get(servicio_id, []):
            try:
                await ws.send_json(mensaje)
            except Exception:
                caidas.append(ws)
        for ws in caidas:
            self.desconectar(servicio_id, ws)


manager = ConnectionManager()


class ConnectionManagerGlobal:
    """Canal de "algo cambió" POR TALLER: no manda datos sensibles, solo un
    avisito {tabla, accion} para que cualquier pantalla que tenga esa tabla
    en la mano sepa que debe volver a pedir sus datos. Cada conexión queda
    ligada a su taller y solo recibe los avisos de ese taller."""

    def __init__(self):
        self.conexiones: list[tuple[WebSocket, int]] = []

    async def conectar(self, websocket: WebSocket, id_taller: int):
        await websocket.accept()
        self.conexiones.append((websocket, id_taller))

    def desconectar(self, websocket: WebSocket):
        self.conexiones = [(ws, t) for ws, t in self.conexiones if ws is not websocket]

    async def difundir(self, mensaje: dict, id_taller: int | None):
        if id_taller is None:
            return
        if not await _publicar("global", id_taller, mensaje):
            await self._difundir_local(mensaje, id_taller)

    async def _difundir_local(self, mensaje: dict, id_taller: int | None):
        caidas = []
        for ws, t in list(self.conexiones):
            if t != id_taller:
                continue
            try:
                await ws.send_json(mensaje)
            except Exception:
                caidas.append(ws)
        for ws in caidas:
            self.desconectar(ws)


manager_global = ConnectionManagerGlobal()
