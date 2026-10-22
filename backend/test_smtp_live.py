import smtplib, sys
from email.mime.text import MIMEText

host = "live.smtp.mailtrap.io"
port = 587
user = "api"
password = "b792f3a72f13e0aa45e822e1b87ab8b3"
remitente = "soporte@aldmautocore.com"
destinatario = sys.argv[1] if len(sys.argv) > 1 else "darlemikode@gmail.com"

msg = MIMEText("Correo de prueba ALDM AutoCore (live)")
msg["Subject"] = "Prueba SMTP live"
msg["From"] = remitente
msg["To"] = destinatario

try:
    with smtplib.SMTP(host, port, timeout=10) as server:
        server.set_debuglevel(1)
        server.starttls()
        server.login(user, password)
        server.sendmail(remitente, [destinatario], msg.as_string())
    print("OK: correo enviado")
except Exception as e:
    print("ERROR:", repr(e))