"""
Reglas de la suscripción de cada taller: estado efectivo (vigente, en
gracia, vencida…), módulos que incluye su paquete y cómo eso se traduce en
permisos. Todo lo "capturable" (días de prueba, gracia, conservación)
vive en ConfiguracionSaaS y se edita desde la app de súper administración.
"""
import time
from datetime import date, timedelta

from sqlalchemy.orm import Session

from . import models

# Qué módulo del paquete "habilita" cada grupo de permisos. Lo que no está
# aquí (usuarios, empleados, catálogos, configuración, panel) siempre está
# disponible — es lo mínimo para operar cualquier taller.
MODULO_POR_PERMISO = {
    "servicios": "ordenes_servicio",
    "cotizaciones": "cotizaciones",
    "refacciones": "inventario",
    "herramientas": "herramientas",
    "clientes": "clientes_vehiculos",
    "vehiculos": "clientes_vehiculos",
    "proveedores": "proveedores",
    "catalogos": "catalogos",
    "empleados": "empleados",
    "nomina": "nomina",
    "roles": "roles_permisos",
    "facturacion": "facturacion",
    "promociones": "app_movil",
}

ESTADOS_MANUALES = ("prueba", "activa", "suspendida", "cancelada")


def permiso_en_modulos(clave: str, modulos: set) -> bool:
    modulo = MODULO_POR_PERMISO.get(clave.split(".", 1)[0])
    return modulo is None or modulo in modulos


def obtener_config(db: Session) -> models.ConfiguracionSaaS:
    config = db.query(models.ConfiguracionSaaS).first()
    if not config:
        config = models.ConfiguracionSaaS()
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


def calcular_estado(taller: models.Taller, config: models.ConfiguracionSaaS, hoy: date | None = None) -> dict:
    hoy = hoy or date.today()
    susc = taller.suscripcion
    info = {
        "id_taller": taller.id_taller,
        "estado": "activa",
        "estado_manual": susc.estado if susc else None,
        "bloqueado": False,
        "solo_lectura": False,
        "dias_restantes": None,
        "fecha_vencimiento": susc.fecha_vencimiento if susc else None,
        "fin_gracia": None,
        "fecha_depuracion": None,
        "para_depurar": False,
        "paquete": susc.paquete.nombre if susc and susc.paquete else None,
        "modulos": set(m.clave for m in susc.paquete.modulos) if susc and susc.paquete else None,
        "mensaje": None,
    }
    if not taller.activo:
        info.update(estado="suspendida", bloqueado=True, mensaje="El acceso de este taller está suspendido. Contacta a ALDM AutoCore.")
        return info
    if not susc:
        return info  # sin suscripción registrada: sin restricciones (instalación de un solo taller)
    if susc.estado in ("suspendida", "cancelada"):
        base = susc.fecha_suspension or susc.fecha_vencimiento or hoy
        info["fecha_depuracion"] = base + timedelta(days=config.dias_conservacion or 0)
        info["para_depurar"] = hoy > info["fecha_depuracion"]
        info.update(estado=susc.estado, bloqueado=True, mensaje="El acceso de este taller está suspendido. Contacta a ALDM AutoCore para reactivarlo.")
        return info
    venc = susc.fecha_vencimiento
    if venc is None:
        info["estado"] = susc.estado
        return info
    fin_gracia = venc + timedelta(days=config.dias_gracia or 0)
    info["fin_gracia"] = fin_gracia
    info["fecha_depuracion"] = fin_gracia + timedelta(days=config.dias_conservacion or 0)
    info["dias_restantes"] = (venc - hoy).days
    if hoy <= venc:
        info["estado"] = susc.estado  # prueba | activa
        if info["dias_restantes"] <= (config.dias_aviso_vencimiento or 0):
            info["mensaje"] = f"Tu {'periodo de prueba' if susc.estado == 'prueba' else 'suscripción'} vence el {venc.strftime('%d/%m/%Y')}."
    elif hoy <= fin_gracia:
        info.update(
            estado="gracia", solo_lectura=True,
            mensaje=f"Tu suscripción venció el {venc.strftime('%d/%m/%Y')}. Solo puedes consultar hasta el {fin_gracia.strftime('%d/%m/%Y')}; renueva para seguir capturando.",
        )
    else:
        info.update(estado="vencida", bloqueado=True, mensaje="Tu suscripción venció. Contacta a ALDM AutoCore para renovarla.")
        info["para_depurar"] = hoy > info["fecha_depuracion"]
    return info


# --- Caché corta: cada petición del taller consulta su estado ---------------
_CACHE: dict[int, tuple[float, dict]] = {}
_TTL = 30


def invalidar(id_taller: int | None = None):
    if id_taller is None:
        _CACHE.clear()
    else:
        _CACHE.pop(id_taller, None)


def estado_taller(db: Session, id_taller: int) -> dict | None:
    ahora = time.time()
    guardado = _CACHE.get(id_taller)
    if guardado and ahora - guardado[0] < _TTL:
        return guardado[1]
    taller = db.query(models.Taller).filter(models.Taller.id_taller == id_taller).first()
    if not taller:
        return None
    info = calcular_estado(taller, obtener_config(db))
    _CACHE[id_taller] = (ahora, info)
    return info


def precio_periodo(paquete: models.Paquete | None, tipo: models.TipoCobro | None, precio_pactado: float | None = None) -> float:
    if precio_pactado is not None:
        return round(precio_pactado, 2)
    if not paquete:
        return 0.0
    if tipo is not None:
        for p in paquete.precios:
            if p.id_tipo_cobro == tipo.id_tipo_cobro and p.precio is not None:
                return round(p.precio, 2)
    meses = tipo.meses if tipo else 1
    descuento = (tipo.descuento_porcentaje or 0) if tipo else 0
    return round((paquete.precio_mensual or 0) * meses * (1 - descuento / 100), 2)


def sumar_meses(fecha: date, meses: int) -> date:
    mes = fecha.month - 1 + meses
    anio = fecha.year + mes // 12
    mes = mes % 12 + 1
    dias_mes = [31, 29 if anio % 4 == 0 and (anio % 100 != 0 or anio % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1]
    return date(anio, mes, min(fecha.day, dias_mes))


def contenido_qr(codigo: str | None) -> str | None:
    """Lo que va dentro del QR del taller. Con URL_PUBLICA (la dirección
    del servidor en internet) es una página que abre la app desde cualquier
    cámara; sin ella, el enlace directo a la app de clientes."""
    import os

    if not codigo:
        return None
    base = (os.getenv("URL_PUBLICA") or "").strip().rstrip("/")
    return f"{base}/api/portal-cliente/qr/{codigo}" if base else f"aldmcliente://taller/{codigo}"


def registrar_renovacion(db: Session, taller: "models.Taller", tipo: "models.TipoCobro", monto: float | None,
                         metodo_pago: str, referencia: str | None, notas: str | None, registrado_por: str) -> "models.PagoSuscripcion":
    """Registra un pago y recorre el vencimiento: si seguía vigente, el nuevo
    periodo empieza al terminar el actual; si ya había vencido, empieza hoy."""
    susc = taller.suscripcion
    hoy = date.today()
    desde = susc.fecha_vencimiento + timedelta(days=1) if susc.fecha_vencimiento and susc.fecha_vencimiento >= hoy and susc.estado == "activa" else hoy
    hasta = sumar_meses(desde, tipo.meses) - timedelta(days=1)
    if monto is None:
        monto = precio_periodo(susc.paquete, tipo, susc.precio_pactado)
    pago = models.PagoSuscripcion(
        id_suscripcion=susc.id_suscripcion, id_taller=taller.id_taller, id_paquete=susc.id_paquete, id_tipo_cobro=tipo.id_tipo_cobro,
        monto=monto, metodo_pago=metodo_pago, referencia=referencia, notas=notas,
        periodo_desde=desde, periodo_hasta=hasta, registrado_por=registrado_por,
    )
    db.add(pago)
    susc.id_tipo_cobro = tipo.id_tipo_cobro
    susc.estado = "activa"
    susc.fecha_vencimiento = hasta
    susc.fecha_suspension = None
    taller.activo = True
    db.commit()
    invalidar(taller.id_taller)
    return pago
