"""Pago de la suscripción en línea con Mercado Pago (Checkout Pro).

Flujo: el taller elige su tipo de cobro -> /checkout crea la preferencia y
regresa la liga de pago -> el taller paga (tarjeta, OXXO, SPEI…) -> Mercado
Pago llama /webhook -> se consulta el pago a su API (así no se puede falsificar)
y, si está aprobado, se registra la renovación igual que un pago manual del
súper admin (metodo_pago="mercadopago", referencia="MP-<id>", sin duplicar).

Variables de entorno: MP_ACCESS_TOKEN (credencial de producción de Mercado
Pago) y PUBLIC_URL (dirección pública del sistema, para regresos y webhook).
"""
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db, sesion_global
from ..security import get_current_user_sin_taller
from ..suscripciones import precio_periodo, registrar_renovacion
from ..tenancy import tenant_de

router = APIRouter(prefix="/api/pagos-en-linea", tags=["pagos en línea"])
MP_API = "https://api.mercadopago.com"


def _token() -> str | None:
    return os.getenv("MP_ACCESS_TOKEN") or None


def _url_publica(request: Request) -> str:
    return (os.getenv("PUBLIC_URL") or str(request.base_url)).rstrip("/")


def _taller_de_sesion(db: Session, user) -> int:
    _, tid = tenant_de(db)
    m = user.membresia(tid) if tid else None
    if not tid or not m or not m.activo:
        raise HTTPException(status_code=403, detail="Entra a un taller para pagar su suscripción.")
    return tid


@router.get("/opciones")
def opciones(db: Session = Depends(get_db), user=Depends(get_current_user_sin_taller)):
    """Tipos de cobro y precio que le corresponde a este taller."""
    tid = _taller_de_sesion(db, user)
    g = sesion_global()
    try:
        taller = g.get(models.Taller, tid)
        susc = taller.suscripcion if taller else None
        if not susc:
            return {"disponible": False, "opciones": []}
        tipos = g.query(models.TipoCobro).filter(models.TipoCobro.activo == True).order_by(models.TipoCobro.orden).all()  # noqa: E712
        return {
            "disponible": bool(_token()),
            "paquete": susc.paquete.nombre if susc.paquete else None,
            "id_tipo_cobro_actual": susc.id_tipo_cobro,
            "opciones": [{"id_tipo_cobro": t.id_tipo_cobro, "nombre": t.nombre, "meses": t.meses,
                          "monto": round(precio_periodo(susc.paquete, t, susc.precio_pactado), 2)} for t in tipos],
        }
    finally:
        g.close()


@router.get("/mi-suscripcion")
def mi_suscripcion(db: Session = Depends(get_db), user=Depends(get_current_user_sin_taller)):
    """Todo lo que el taller necesita ver de su suscripción: paquete, fechas,
    módulos incluidos y disponibles, historial de pagos y otros paquetes."""
    from datetime import date

    tid = _taller_de_sesion(db, user)
    g = sesion_global()
    try:
        taller = g.get(models.Taller, tid)
        susc = taller.suscripcion if taller else None
        if not susc:
            return {"tiene": False}
        paquete = susc.paquete
        catalogo = g.query(models.Modulo).order_by(models.Modulo.orden, models.Modulo.nombre).all()
        incluidos_ids = {m.id_modulo for m in (paquete.modulos if paquete else [])}
        mod = lambda m: {"clave": m.clave, "nombre": m.nombre, "descripcion": m.descripcion, "icono": m.icono}  # noqa: E731
        hoy = date.today()
        dias = (susc.fecha_vencimiento - hoy).days if susc.fecha_vencimiento else None
        tipos = g.query(models.TipoCobro).filter(models.TipoCobro.activo == True).order_by(models.TipoCobro.orden).all()  # noqa: E712
        otros = g.query(models.Paquete).filter(models.Paquete.activo == True).order_by(models.Paquete.precio_mensual).all()  # noqa: E712
        return {
            "tiene": True,
            "estado": susc.estado,
            "fecha_inicio": susc.fecha_inicio,
            "fecha_vencimiento": susc.fecha_vencimiento,
            "dias_restantes": dias,
            "paquete": {
                "nombre": paquete.nombre if paquete else None,
                "descripcion": paquete.descripcion if paquete else None,
                "precio_mensual": paquete.precio_mensual if paquete else 0,
                "limite_usuarios": paquete.limite_usuarios if paquete else None,
            },
            "tipo_cobro": susc.tipo_cobro.nombre if susc.tipo_cobro else None,
            "monto_periodo": round(precio_periodo(paquete, susc.tipo_cobro, susc.precio_pactado), 2),
            "pago_en_linea": bool(_token()),
            "modulos_incluidos": [mod(m) for m in catalogo if m.id_modulo in incluidos_ids],
            "modulos_disponibles": [mod(m) for m in catalogo if m.id_modulo not in incluidos_ids],
            "pagos": [
                {"fecha": p.fecha_pago, "monto": p.monto, "metodo": p.metodo_pago, "periodo_desde": p.periodo_desde, "periodo_hasta": p.periodo_hasta}
                for p in (susc.pagos or [])[:8]
            ],
            "otros_paquetes": [
                {"nombre": x.nombre, "descripcion": x.descripcion, "precio_mensual": x.precio_mensual, "actual": bool(paquete and x.id_paquete == paquete.id_paquete),
                 "modulos": [m.nombre for m in x.modulos]}
                for x in otros
            ],
            "tipos_cobro": [{"nombre": x.nombre, "meses": x.meses, "descuento": x.descuento_porcentaje} for x in tipos],
        }
    finally:
        g.close()


@router.post("/solicitar-modulos")
def solicitar_modulos(payload: dict, db: Session = Depends(get_db), user=Depends(get_current_user_sin_taller)):
    """El taller pide módulos extra o un cambio de paquete: llega a ALDM como
    una solicitud (el pago en línea de módulos sueltos aún no existe)."""
    tid = _taller_de_sesion(db, user)
    modulos = [str(x)[:40] for x in (payload.get("modulos") or [])][:12]
    paquete = str(payload.get("paquete") or "")[:40]
    if not modulos and not paquete:
        raise HTTPException(status_code=400, detail="Elige al menos un módulo o un paquete.")
    g = sesion_global()
    try:
        taller = g.get(models.Taller, tid)
        partes = []
        if paquete:
            partes.append(f"Cambiar a paquete {paquete}")
        if modulos:
            partes.append("Módulos: " + ", ".join(modulos))
        g.add(models.SolicitudContacto(
            negocio=(taller.nombre_comercial if taller else "Taller")[:120], nombre=(user.nombre_completo or user.username)[:120],
            telefono=(user.telefono or "Sin teléfono")[:30], correo=(user.correo or None), mensaje=" · ".join(partes)[:280],
        ))
        g.commit()
        return {"ok": True}
    finally:
        g.close()


@router.post("/checkout")
def checkout(payload: dict, request: Request, db: Session = Depends(get_db), user=Depends(get_current_user_sin_taller)):
    token = _token()
    if not token:
        raise HTTPException(status_code=503, detail="El pago en línea todavía no está configurado.")
    tid = _taller_de_sesion(db, user)
    g = sesion_global()
    try:
        taller = g.get(models.Taller, tid)
        susc = taller.suscripcion if taller else None
        tipo = g.get(models.TipoCobro, int(payload.get("id_tipo_cobro") or 0))
        if not susc or not tipo or not tipo.activo:
            raise HTTPException(status_code=400, detail="Elige un tipo de cobro válido.")
        monto = round(precio_periodo(susc.paquete, tipo, susc.precio_pactado), 2)
        if monto <= 0:
            raise HTTPException(status_code=400, detail="Este plan no tiene precio; contacta a ALDM.")
        base = _url_publica(request)
        preferencia = {
            "items": [{
                "title": f"ALDM AutoCore · {susc.paquete.nombre if susc.paquete else 'Suscripción'} · {tipo.nombre}",
                "quantity": 1, "unit_price": monto, "currency_id": "MXN",
            }],
            "payer": {"email": user.correo} if user.correo else {},
            "external_reference": f"{tid}:{tipo.id_tipo_cobro}",
            "notification_url": f"{base}/api/pagos-en-linea/webhook",
            "back_urls": {"success": f"{base}/?pago=aprobado", "pending": f"{base}/?pago=pendiente", "failure": f"{base}/?pago=rechazado"},
            "auto_return": "approved",
            "statement_descriptor": "ALDM AUTOCORE",
        }
        r = httpx.post(f"{MP_API}/checkout/preferences", json=preferencia, headers={"Authorization": f"Bearer {token}"}, timeout=20)
        if r.status_code >= 300:
            raise HTTPException(status_code=502, detail="Mercado Pago no respondió; intenta de nuevo en un momento.")
        return {"url": r.json().get("init_point"), "monto": monto}
    finally:
        g.close()


@router.post("/webhook")
async def webhook(request: Request):
    """Aviso de Mercado Pago. Siempre responde 200 para que no reintente sin
    fin; el pago se valida consultándolo directo a su API."""
    token = _token()
    try:
        cuerpo = await request.json()
    except Exception:
        cuerpo = {}
    q = request.query_params
    tipo_aviso = cuerpo.get("type") or q.get("type") or q.get("topic")
    id_pago = (cuerpo.get("data") or {}).get("id") or q.get("data.id") or q.get("id")
    if not token or tipo_aviso != "payment" or not id_pago:
        return {"ok": True}
    r = httpx.get(f"{MP_API}/v1/payments/{id_pago}", headers={"Authorization": f"Bearer {token}"}, timeout=20)
    if r.status_code != 200:
        return {"ok": True}
    pago = r.json()
    if pago.get("status") != "approved":
        return {"ok": True}
    try:
        tid, id_tipo = (int(x) for x in str(pago.get("external_reference", "")).split(":"))
    except ValueError:
        return {"ok": True}
    referencia = f"MP-{pago['id']}"
    g = sesion_global()
    try:
        if g.query(models.PagoSuscripcion).filter(models.PagoSuscripcion.referencia == referencia).first():
            return {"ok": True}  # ya registrado (Mercado Pago avisa más de una vez)
        taller = g.get(models.Taller, tid)
        tipo = g.get(models.TipoCobro, id_tipo)
        if taller and taller.suscripcion and tipo:
            registrar_renovacion(g, taller, tipo, float(pago.get("transaction_amount") or 0), "mercadopago", referencia,
                                 f"Pago en línea ({pago.get('payment_method_id') or 'Mercado Pago'})", "mercadopago")
    finally:
        g.close()
    return {"ok": True}
