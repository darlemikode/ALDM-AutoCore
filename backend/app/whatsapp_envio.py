"""Envío automático de WhatsApp (WhatsApp Cloud API de Meta) en segundo plano.

Se activa solo si el servidor tiene estas variables de entorno (Azure > Configuración):
  WHATSAPP_TOKEN                token permanente de la app de Meta
  WHATSAPP_PHONE_ID             «Phone number ID» del número que envía
  WHATSAPP_PLANTILLA_CLIENTE    (opcional) plantilla aprobada; parámetros: nombre, orden, dirección, código
  WHATSAPP_PLANTILLA_MECANICO   (opcional) plantilla aprobada; parámetros: servicio, dirección, enlace
  WHATSAPP_IDIOMA               (opcional) idioma de las plantillas, por omisión es_MX
  WHATSAPP_API_VERSION          (opcional) por omisión v21.0

Sin plantilla se manda texto libre, que Meta solo entrega si la persona escribió al número en las últimas 24 h;
para avisar a un cliente que no ha escrito se necesita una plantilla aprobada. Si no hay credenciales no se envía
nada y la pantalla conserva los botones manuales de WhatsApp.
"""
import logging
import os
import re
from typing import Optional, Sequence

import httpx

log = logging.getLogger("whatsapp_envio")


def configurado() -> bool:
    return bool((os.getenv("WHATSAPP_TOKEN") or "").strip() and (os.getenv("WHATSAPP_PHONE_ID") or "").strip())


def _numero(telefono: Optional[str]) -> Optional[str]:
    d = re.sub(r"\D", "", telefono or "")
    return f"52{d[-10:]}" if len(d) >= 10 else None


def enviar(telefono: Optional[str], texto: str, plantilla: Optional[str] = None, parametros: Sequence[str] = ()) -> bool:
    """Manda un mensaje. Pensada para BackgroundTasks: nunca lanza excepciones, solo registra el resultado."""
    destino = _numero(telefono)
    if not destino or not configurado():
        return False
    version = (os.getenv("WHATSAPP_API_VERSION") or "v21.0").strip()
    url = f"https://graph.facebook.com/{version}/{os.getenv('WHATSAPP_PHONE_ID').strip()}/messages"
    if plantilla:
        cuerpo = {
            "messaging_product": "whatsapp", "to": destino, "type": "template",
            "template": {
                "name": plantilla.strip(), "language": {"code": (os.getenv("WHATSAPP_IDIOMA") or "es_MX").strip()},
                "components": [{"type": "body", "parameters": [{"type": "text", "text": str(p)[:1000]} for p in parametros]}],
            },
        }
    else:
        cuerpo = {"messaging_product": "whatsapp", "to": destino, "type": "text", "text": {"body": texto[:4000], "preview_url": True}}
    try:
        r = httpx.post(url, json=cuerpo, headers={"Authorization": f"Bearer {os.getenv('WHATSAPP_TOKEN').strip()}"}, timeout=10)
        if r.status_code >= 300:
            log.warning("WhatsApp no envió el mensaje a ...%s: HTTP %s %s", destino[-4:], r.status_code, r.text[:300])
            return False
        return True
    except Exception as e:  # noqa: BLE001
        log.warning("WhatsApp no envió el mensaje a ...%s: %s", destino[-4:], e)
        return False
