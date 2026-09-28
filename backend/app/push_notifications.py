"""
Notificaciones push a través del servicio de Expo — es gratis, no requiere
ninguna cuenta ni credencial de pago (a diferencia de SMS): mientras la app
(del taller o de clientes) se haya construido con Expo y el dispositivo
tenga un `push_token` registrado, esto simplemente funciona.

Si algo falla al mandar la notificación (sin internet, token inválido,
etc.), se ignora en silencio — nunca debe tumbar la acción principal
(mandar un mensaje de chat, cambiar una etapa) solo porque la notificación
no se pudo entregar.
"""
import httpx

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def enviar_push(push_token: str | None, titulo: str, cuerpo: str, datos: dict | None = None):
    if not push_token:
        return
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(EXPO_PUSH_URL, json={
                "to": push_token,
                "title": titulo,
                "body": cuerpo,
                "data": datos or {},
                "sound": "default",
            })
    except Exception:
        pass  # ver nota arriba — no debe romper el flujo principal
