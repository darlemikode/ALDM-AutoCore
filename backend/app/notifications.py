"""
Notificaciones del sistema.

Por defecto, el sistema NO envía correos ni SMS reales — no hay
credenciales de un proveedor (SMTP, Twilio, etc.) configuradas. Lo que sí
hace siempre es dejar la solicitud visible para el administrador dentro del
panel (tabla `solicitudes_recuperacion`), para el flujo asistido antiguo.

El acceso ahora es por correo electrónico: el alta de un usuario y el
"olvidé mi contraseña" (self-service) mandan un enlace de un solo uso al
correo del usuario (ver password_tokens.py). Para que esos correos
realmente salgan hace falta definir SMTP_HOST / SMTP_PORT / SMTP_USER /
SMTP_PASSWORD / SMTP_FROM en el .env — esta función lo detecta solo y
empieza a mandar los correos. Si no están definidas, las funciones no
truenan, solo se omite el envío (el enlace nunca llega).
"""
import logging
import os
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from . import password_tokens

logger = logging.getLogger("aldm.correo")


def _smtp_configurado() -> bool:
    return all(os.getenv(k) for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"))


def _url_frontend() -> str:
    """Dónde vive el panel web (web-admin) al que apuntan los enlaces de
    correo. Se configura con FRONTEND_URL; si no está, se usa URL_PUBLICA
    (la misma dirección del sistema desplegado, que ya se usa para los QR)
    antes de caer al servidor de desarrollo local. Sin ese respaldo, un
    despliegue sin FRONTEND_URL manda correos con enlaces a localhost."""
    for var in ("FRONTEND_URL", "URL_PUBLICA"):
        valor = (os.getenv(var) or "").strip()
        if valor:
            return valor.rstrip("/")
    return "http://localhost:5173"


def _enlace_password(token: str) -> str:
    return f"{_url_frontend()}/establecer-password?token={token}"


def _plantilla_html(nombre: str, titulo: str, parrafos: list[str], boton_texto: str | None = None, boton_enlace: str | None = None, nota: str | None = None) -> str:
    """Plantilla de correo compartida: tarjeta centrada con el estilo de
    ALDM AutoCore y, si se manda boton_enlace, un botón grande (además del
    enlace de texto, por si el cliente de correo bloquea el botón)."""
    cuerpo_parrafos = "".join(f'<p style="margin:0 0 16px;color:#3a3a3d;font-size:15px;line-height:1.6;">{p}</p>' for p in parrafos)
    boton_html = ""
    enlace_html = ""
    if boton_enlace:
        boton_html = (
            '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">'
            '<tr><td style="border-radius:10px;background:linear-gradient(135deg,#e10600 0%,#ff4136 100%);">'
            f'<a href="{boton_enlace}" target="_blank" '
            'style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;'
            'font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">'
            f'{boton_texto or "Continuar"}</a></td></tr></table>'
        )
        enlace_html = (
            '<p style="margin:0 0 4px;color:#8a8a92;font-size:12.5px;">¿El botón no funciona? Copia y pega este enlace:</p>'
            f'<p style="margin:0 0 16px;word-break:break-all;"><a href="{boton_enlace}" style="color:#e10600;font-size:12.5px;">{boton_enlace}</a></p>'
        )
    nota_html = f'<p style="margin:20px 0 0;color:#8a8a92;font-size:12.5px;line-height:1.5;">{nota}</p>' if nota else ""
    return f"""\
<!doctype html>
<html><body style="margin:0;padding:0;background:#f0f0f1;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f1;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:14px;overflow:hidden;">
<tr><td style="background:#050506;padding:22px 28px;">
<span style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:800;letter-spacing:.02em;color:#ffffff;">ALDM <span style="color:#ff4136;">AutoCore</span></span>
</td></tr>
<tr><td style="padding:28px;">
<h1 style="margin:0 0 16px;font-size:19px;color:#141414;">{titulo}</h1>
<p style="margin:0 0 16px;color:#3a3a3d;font-size:15px;">Hola <b>{nombre}</b>:</p>
{cuerpo_parrafos}
{boton_html}
{enlace_html}
{nota_html}
</td></tr>
<tr><td style="padding:16px 28px;background:#f7f7f8;color:#9a9894;font-size:11.5px;text-align:center;">Administración de talleres mecánicos</td></tr>
</table>
</td></tr>
</table>
</body></html>"""


def notificar_admin_recuperacion(admin_correo: str, nombre_usuario: str, identificador_usado: str) -> None:
    """Flujo asistido antiguo: avisa al admin por correo que alguien pidió
    ayuda para entrar. Sigue disponible como respaldo (por ejemplo, si el
    usuario no tiene correo registrado); el flujo normal ahora es el
    self-service de enviar_correo_restablecer."""
    if not _smtp_configurado() or not admin_correo:
        return
    try:
        _enviar_correo(
            destinatario=admin_correo,
            asunto="Sistema Mecánico: solicitud de recuperación de acceso",
            cuerpo=(
                f"El usuario '{nombre_usuario}' solicitó recuperar su contraseña "
                f"(escribió: {identificador_usado}). Entra al panel, sección "
                f"Usuarios, para generarle una contraseña temporal."
            ),
        )
    except Exception:
        logger.exception("No se pudo enviar el aviso de recuperación a %s", admin_correo)


def enviar_correo_bienvenida(correo: str, nombre: str, token: str) -> None:
    """Alta de un usuario nuevo (personal del taller o súper admin): se le
    manda un enlace para que él mismo cree su contraseña. Válido por
    SETUP_TOKEN_HOURS horas."""
    if not _smtp_configurado() or not correo:
        return
    enlace = _enlace_password(token)
    horas = password_tokens.SETUP_TOKEN_HOURS
    texto = (
        f"Hola {nombre}:\n\n"
        f"Se creó tu acceso a ALDM AutoCore. Entra a este enlace para crear tu "
        f"contraseña (válido por {horas} horas):\n{enlace}\n\n"
        f"Después de crearla, entra con tu correo y tu nueva contraseña."
    )
    html = _plantilla_html(
        nombre, "Crea tu contraseña",
        [f"Se creó tu acceso a <b>ALDM AutoCore</b>. Da clic en el botón para crear tu contraseña (válido por {horas} horas)."],
        boton_texto="Crear mi contraseña", boton_enlace=enlace,
        nota="Después de crearla, entra con tu correo y tu nueva contraseña.",
    )
    try:
        _enviar_correo(destinatario=correo, asunto="Crea tu contraseña — ALDM AutoCore", cuerpo=texto, html=html)
    except Exception:
        logger.exception("No se pudo enviar el correo de bienvenida a %s", correo)


def enviar_correo_bienvenida_taller(correo: str, nombre_taller: str, token: str) -> None:
    """Alta de un taller nuevo: en vez de compartir un código a mano, se
    manda este enlace al correo del taller para que su dueño cree su
    usuario y contraseña — queda automáticamente como Administrador
    General. Válido por SETUP_TOKEN_HOURS horas."""
    if not _smtp_configurado() or not correo:
        return
    enlace = _enlace_password(token)
    horas = password_tokens.SETUP_TOKEN_HOURS
    texto = (
        f"Hola:\n\n"
        f"Ya dimos de alta tu taller \"{nombre_taller}\" en ALDM AutoCore. Entra a "
        f"este enlace para crear tu usuario y contraseña de administrador "
        f"(válido por {horas} horas):\n{enlace}\n\n"
        f"Después de crear tu contraseña, entra con este correo."
    )
    html = _plantilla_html(
        nombre_taller, "Bienvenido a ALDM AutoCore",
        [f"Ya dimos de alta tu taller <b>{nombre_taller}</b>. Da clic en el botón para crear tu usuario y contraseña de administrador (válido por {horas} horas)."],
        boton_texto="Crear mi usuario y contraseña", boton_enlace=enlace,
        nota="Después de crearla, entra con este correo y tu nueva contraseña.",
    )
    try:
        _enviar_correo(destinatario=correo, asunto=f"Bienvenido a ALDM AutoCore — {nombre_taller}", cuerpo=texto, html=html)
    except Exception:
        logger.exception("No se pudo enviar el correo de bienvenida de taller a %s", correo)


def enviar_correo_restablecer(correo: str, nombre: str, token: str) -> None:
    """Self-service: "olvidé mi contraseña". Enlace directo al correo del
    usuario, válido por RESET_TOKEN_HOURS horas."""
    if not _smtp_configurado() or not correo:
        return
    enlace = _enlace_password(token)
    horas = password_tokens.RESET_TOKEN_HOURS
    texto = (
        f"Hola {nombre}:\n\n"
        f"Pediste restablecer tu contraseña en ALDM AutoCore. Entra a este "
        f"enlace para crear una nueva (válido por {horas} horas):\n{enlace}\n\n"
        f"Si no fuiste tú, ignora este correo — tu contraseña actual sigue funcionando."
    )
    html = _plantilla_html(
        nombre, "Restablece tu contraseña",
        [f"Pediste restablecer tu contraseña en <b>ALDM AutoCore</b>. Da clic en el botón para crear una nueva (válido por {horas} horas)."],
        boton_texto="Restablecer mi contraseña", boton_enlace=enlace,
        nota="Si no fuiste tú, ignora este correo — tu contraseña actual sigue funcionando.",
    )
    try:
        _enviar_correo(destinatario=correo, asunto="Restablece tu contraseña — ALDM AutoCore", cuerpo=texto, html=html)
    except Exception:
        logger.exception("No se pudo enviar el correo de restablecimiento a %s", correo)


def enviar_correo_password_cambiada(correo: str, nombre: str) -> None:
    """Confirmación después de crear/cambiar la contraseña por enlace —
    nunca lleva la contraseña escrita."""
    if not _smtp_configurado() or not correo:
        return
    texto = (
        f"Hola {nombre}:\n\n"
        f"Tu contraseña de ALDM AutoCore se cambió correctamente. Si no fuiste "
        f"tú, avisa de inmediato a quien administra tu taller."
    )
    html = _plantilla_html(
        nombre, "Tu contraseña cambió",
        ["Tu contraseña de <b>ALDM AutoCore</b> se cambió correctamente. Si no fuiste tú, avisa de inmediato a quien administra tu taller."],
    )
    try:
        _enviar_correo(destinatario=correo, asunto="Tu contraseña cambió — ALDM AutoCore", cuerpo=texto, html=html)
    except Exception:
        logger.exception("No se pudo enviar el aviso de cambio de contraseña a %s", correo)


def enviar_nota_al_cliente(correo: str, nombre: str, nombre_taller: str, servicio_id: int,
                           total: float, pdf: bytes) -> bool:
    """Al finalizar una orden, le manda al cliente su nota de remisión en PDF.
    Regresa True solo si el correo salió de verdad: lo que se envió se le
    informa al taller en la pantalla de finalizar, así que no puede mentir."""
    if not _smtp_configurado() or not correo:
        return False
    total_txt = f"${total:,.2f}"
    texto = (
        f"Hola {nombre}:\n\n"
        f"Tu servicio en {nombre_taller} quedó listo. Adjuntamos la nota de "
        f"remisión de tu orden #{servicio_id}, por un total de {total_txt}.\n\n"
        f"¡Gracias por tu preferencia!"
    )
    html = _plantilla_html(
        nombre, "Tu servicio está listo",
        [
            f"Tu servicio en <b>{nombre_taller}</b> quedó listo.",
            f"Adjuntamos la nota de remisión de tu orden <b>#{servicio_id}</b>, por un total de <b>{total_txt}</b>.",
            "¡Gracias por tu preferencia!",
        ],
        nota="La nota de remisión va adjunta a este correo en formato PDF.",
    )
    try:
        _enviar_correo(
            destinatario=correo,
            asunto=f"Nota de remisión — Orden #{servicio_id} · {nombre_taller}",
            cuerpo=texto, html=html,
            adjunto=(f"nota-remision-{servicio_id}.pdf", pdf),
        )
        return True
    except Exception:
        logger.exception("No se pudo enviar la nota de remisión de la orden %s a %s", servicio_id, correo)
        return False


def _enviar_correo(destinatario: str, asunto: str, cuerpo: str, html: str | None = None,
                   adjunto: tuple[str, bytes] | None = None) -> None:
    """adjunto: (nombre_del_archivo, contenido_en_bytes) — se manda como PDF."""
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")
    remitente = os.getenv("SMTP_FROM")

    if html:
        contenido = MIMEMultipart("alternative")
        contenido.attach(MIMEText(cuerpo, "plain"))
        contenido.attach(MIMEText(html, "html"))
    else:
        contenido = MIMEText(cuerpo)

    if adjunto:
        # Con archivo adjunto el mensaje va en "mixed": el cuerpo por dentro y
        # el PDF como parte aparte.
        nombre_archivo, datos = adjunto
        msg = MIMEMultipart("mixed")
        msg.attach(contenido)
        parte = MIMEApplication(datos, _subtype="pdf")
        parte.add_header("Content-Disposition", "attachment", filename=nombre_archivo)
        msg.attach(parte)
    else:
        msg = contenido
    msg["Subject"] = asunto
    msg["From"] = remitente
    msg["To"] = destinatario

    # Puerto 465 = SSL directo (no se puede hacer STARTTLS ahí, truena); el
    # resto (587, 25, etc.) usa STARTTLS normal. Varios proveedores de
    # correo (Hostinger, cPanel, algunos de Office365) dan 465 por
    # defecto — sin esto, el correo se queda sin enviar en silencio.
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=10) as server:
            server.login(user, password)
            server.sendmail(remitente, [destinatario], msg.as_string())
    else:
        with smtplib.SMTP(host, port, timeout=10) as server:
            server.starttls()
            server.login(user, password)
            server.sendmail(remitente, [destinatario], msg.as_string())
