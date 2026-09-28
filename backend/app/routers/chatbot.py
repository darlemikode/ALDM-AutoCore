"""
Chatbot de respuestas automáticas por menú (no es lenguaje libre a
propósito — son respuestas fijas y confiables a 5 preguntas concretas).

Flujo:
  1. POST /verificar — el cliente da su número de cuenta + el VIN de su
     vehículo. Si coinciden, se le da una sesión de chatbot de 20 minutos
     (no es su contraseña — así alguien puede usar el chatbot para dar de
     alta su cuenta la primera vez, sin tener credenciales todavía).
  2. GET /opcion/{clave} — con esa sesión, pide una de las 5 respuestas:
     alta, servicio, reclamacion, seguimiento, facturacion.

Nota de seguridad: como no pide contraseña, en producción conviene ponerle
un límite de intentos (rate limit) al endpoint /verificar para que no se
preste a adivinar números de cuenta al azar — aquí no se implementó ese
límite todavía.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..tenancy import MODO_TALLER, fijar_tenant, taller_actual
from ..security import (
    SECRET_KEY, ALGORITHM, create_chatbot_session_token, generar_codigo_invitacion,
)
from .servicios import ETAPAS_SERVICIO

router = APIRouter(prefix="/api/chatbot", tags=["chatbot"])

ETIQUETAS_ETAPA = dict(ETAPAS_SERVICIO)


def _token_de_header(authorization: str = Header(...)) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Falta la sesión del chatbot — verifica tu identidad de nuevo.")
    return authorization.split(" ", 1)[1]


def _cliente_de_sesion(token: str, db: Session) -> models.Cliente:
    credenciales_invalidas = HTTPException(status_code=401, detail="Tu sesión con el chatbot expiró — verifica tu identidad de nuevo.")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub: str = payload.get("sub", "")
        if not sub.startswith("chatbot:"):
            raise credenciales_invalidas
        id_cliente = int(sub.split(":", 1)[1])
    except (JWTError, ValueError):
        raise credenciales_invalidas

    cliente = db.query(models.Cliente).filter(models.Cliente.id_cliente == id_cliente).first()
    if not cliente:
        raise credenciales_invalidas
    return cliente


@router.post("/verificar", response_model=schemas.ChatbotSesionOut)
def verificar_identidad(payload: schemas.ChatbotVerificarIn, db: Session = Depends(get_db)):
    numero_cuenta = payload.numero_cuenta.strip().upper()
    vin = payload.vin.strip().upper()

    cliente = db.query(models.Cliente).filter(models.Cliente.numero_cuenta == numero_cuenta).first()
    if not cliente and taller_actual(db) is None:
        # Sin código de taller: el número de cuenta es único en todo el
        # sistema, así que de él sale el taller.
        cliente = (
            db.query(models.Cliente).execution_options(sin_filtro_taller=True)
            .filter(models.Cliente.numero_cuenta == numero_cuenta).first()
        )
        if cliente:
            fijar_tenant(db, MODO_TALLER, cliente.id_taller)
    if not cliente:
        raise HTTPException(status_code=404, detail="No encontramos esa cuenta. Revisa el número (ej. CTE-000001) e intenta de nuevo.")

    vehiculos = db.query(models.Vehiculo).filter(models.Vehiculo.id_cliente == cliente.id_cliente).all()
    coincide = any((v.numserie_vehiculo or "").strip().upper() == vin for v in vehiculos)
    if not coincide:
        raise HTTPException(status_code=404, detail="El VIN no coincide con ningún vehículo de esa cuenta. Revísalo e intenta de nuevo.")

    token = create_chatbot_session_token(cliente.id_cliente, cliente.id_taller)
    return schemas.ChatbotSesionOut(token=token, nombre_cliente=cliente.nombre_cliente, cuenta_activada=cliente.cuenta_activada)


def _respuesta_alta(cliente: models.Cliente, db: Session) -> schemas.ChatbotRespuestaOut:
    if cliente.cuenta_activada:
        return schemas.ChatbotRespuestaOut(texto="Ya tienes tu cuenta activa ✅. Entra a la app con tu teléfono o correo registrado y tu contraseña.")

    codigo = generar_codigo_invitacion()
    cliente.codigo_invitacion = codigo
    cliente.fecha_invitacion = datetime.utcnow()
    db.commit()
    return schemas.ChatbotRespuestaOut(
        texto=(
            f"Tu código para activar tu cuenta es: {codigo}\n\n"
            "Ábrelo en la app, ve a la pestaña 'Activar cuenta', y usa tu teléfono o correo "
            "registrado junto con este código para crear tu contraseña."
        ),
        datos={"codigo_invitacion": codigo},
    )


def _respuesta_seguimiento(cliente: models.Cliente, db: Session) -> schemas.ChatbotRespuestaOut:
    abiertos = (
        db.query(models.Servicio)
        .filter(models.Servicio.id_cliente == cliente.id_cliente, models.Servicio.status == "abierto")
        .all()
    )
    if not abiertos:
        return schemas.ChatbotRespuestaOut(texto="No tienes ningún servicio abierto en este momento.")

    lineas = []
    for s in abiertos:
        placas = s.vehiculo.placas_vehiculo if s.vehiculo else "tu vehículo"
        etiqueta = ETIQUETAS_ETAPA.get(s.etapa, s.etapa)
        lineas.append(f"• {placas} (orden #{s.id_servicio}): {etiqueta}")
    return schemas.ChatbotRespuestaOut(texto="Así va tu servicio:\n" + "\n".join(lineas))


def _respuesta_reclamacion(cliente: models.Cliente, db: Session) -> schemas.ChatbotRespuestaOut:
    ultimo_cerrado = (
        db.query(models.Servicio)
        .filter(models.Servicio.id_cliente == cliente.id_cliente, models.Servicio.status == "cerrado")
        .order_by(models.Servicio.fecha_salida_servicio.desc())
        .first()
    )
    if not ultimo_cerrado:
        return schemas.ChatbotRespuestaOut(texto="No encontramos un servicio previo entregado para poder reclamar garantía. Contacta directo al taller.")

    return schemas.ChatbotRespuestaOut(
        texto=(
            f"Para reclamar garantía de tu último servicio entregado (#{ultimo_cerrado.id_servicio} — "
            f"{ultimo_cerrado.nombre_servicio}), entra a la app, ve a 'Agendar', y cuéntanos qué volvió a fallar. "
            "El taller lo va a revisar y lo va a relacionar con esa orden."
        ),
        datos={"id_servicio_original": ultimo_cerrado.id_servicio},
    )


def _respuesta_facturacion(cliente: models.Cliente, db: Session) -> schemas.ChatbotRespuestaOut:
    servicios = db.query(models.Servicio).filter(models.Servicio.id_cliente == cliente.id_cliente).all()
    saldo_total = 0.0
    pendientes = []
    for s in servicios:
        subtotal = sum((d.costo_mano_obra or 0) + (d.costo_refaccion or 0) + (d.costo_extra or 0) for d in s.detalles)
        total = subtotal * (1 + (s.iva_porcentaje or 0) / 100)
        abonado = sum(a.monto_abono or 0 for a in s.abonos)
        saldo = max(total - abonado, 0)
        if saldo > 0.01:
            saldo_total += saldo
            pendientes.append((s, saldo))

    if not pendientes:
        return schemas.ChatbotRespuestaOut(texto="No tienes ningún saldo pendiente. ¡Estás al corriente! ✅")

    lineas = [f"• Orden #{s.id_servicio}: ${saldo:,.2f}" for s, saldo in pendientes]
    return schemas.ChatbotRespuestaOut(
        texto=f"Tienes un saldo pendiente de ${saldo_total:,.2f}:\n" + "\n".join(lineas),
        datos={"saldo_total": saldo_total},
    )


RESPUESTAS = {
    "alta": _respuesta_alta,
    "servicio": _respuesta_seguimiento,
    "seguimiento": _respuesta_seguimiento,
    "reclamacion": _respuesta_reclamacion,
    "facturacion": _respuesta_facturacion,
}


@router.get("/opcion/{clave}", response_model=schemas.ChatbotRespuestaOut)
def responder(clave: str, token: str = Depends(_token_de_header), db: Session = Depends(get_db)):
    cliente = _cliente_de_sesion(token, db)
    funcion = RESPUESTAS.get(clave)
    if not funcion:
        raise HTTPException(status_code=400, detail="Esa opción no existe.")
    return funcion(cliente, db)
