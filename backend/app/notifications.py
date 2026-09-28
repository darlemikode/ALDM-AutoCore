"""
Notificaciones del sistema.

Por defecto, el sistema NO envía correos ni SMS reales — no hay
credenciales de un proveedor (SMTP, Twilio, etc.) configuradas. Lo que sí
hace siempre es dejar la solicitud visible para el administrador dentro del
panel (tabla `solicitudes_recuperacion`).

Si en algún momento se quiere enviar el aviso también por correo, basta con
definir las variables SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD /
SMTP_FROM en el .env — esta función lo detecta solo y empieza a mandar el
correo además de guardar la notificación interna. Si no están definidas,
la función no hace nada (no truena, solo se omite el envío).
"""
import os
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def _smtp_configurado() -> bool:
    return all(os.getenv(k) for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"))


def notificar_admin_recuperacion(admin_correo: str, nombre_usuario: str, identificador_usado: str) -> None:
    """Intenta avisarle al admin por correo que alguien pidió recuperar su
    contraseña. Si no hay SMTP configurado, no hace nada (la solicitud ya
    quedó guardada en la base de datos de todas formas)."""
    if not _smtp_configurado() or not admin_correo:
        return
    try:
        _enviar_correo(
            destinatario=admin_correo,
            asunto="ALDM AutoCore: solicitud de recuperación de acceso",
            cuerpo=(
                f"El usuario '{nombre_usuario}' solicitó recuperar su contraseña "
                f"(escribió: {identificador_usado}). Entra al panel, sección "
                f"Usuarios, para generarle una contraseña temporal."
            ),
        )
    except Exception:
        # Un correo que falla no debe tumbar la solicitud; ya quedó
        # registrada para que el admin la vea dentro del panel.
        pass


def _enviar_correo(destinatario: str, asunto: str, cuerpo: str) -> None:
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")
    remitente = os.getenv("SMTP_FROM")

    msg = MIMEText(cuerpo)
    msg["Subject"] = asunto
    msg["From"] = remitente
    msg["To"] = destinatario

    with smtplib.SMTP(host, port, timeout=10) as server:
        server.starttls()
        server.login(user, password)
        server.sendmail(remitente, [destinatario], msg.as_string())


def enviar_nota_al_cliente(correo: str, nombre_cliente: str, nombre_taller: str, id_servicio: int, total: float, pdf: bytes) -> bool:
    """Manda la nota de remisión en PDF al correo del cliente. Regresa True
    si se envió; False si no hay SMTP configurado o si falló (nunca truena)."""
    if not _smtp_configurado() or not correo:
        return False
    try:
        msg = MIMEMultipart()
        msg["Subject"] = f"{nombre_taller}: tu vehículo está listo — orden #{id_servicio}"
        msg["From"] = os.getenv("SMTP_FROM")
        msg["To"] = correo
        msg.attach(MIMEText(
            f"Hola {nombre_cliente},\n\n"
            f"Tu servicio (orden #{id_servicio}) fue finalizado. Total: ${total:,.2f} MXN.\n"
            f"Te adjuntamos tu nota de remisión.\n\n"
            f"¡Gracias por tu preferencia!\n{nombre_taller}"
        ))
        adjunto = MIMEApplication(pdf, _subtype="pdf")
        adjunto.add_header("Content-Disposition", "attachment", filename=f"nota-remision-{id_servicio}.pdf")
        msg.attach(adjunto)
        with smtplib.SMTP(os.getenv("SMTP_HOST"), int(os.getenv("SMTP_PORT", "587")), timeout=15) as server:
            server.starttls()
            server.login(os.getenv("SMTP_USER"), os.getenv("SMTP_PASSWORD"))
            server.sendmail(os.getenv("SMTP_FROM"), [correo], msg.as_string())
        return True
    except Exception:
        return False
