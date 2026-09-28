"""
Timbrado de CFDI 4.0 — capa que habla con el PAC.

Dos proveedores, elegidos en Configuración fiscal:

- "simulado": no sale a internet ni gasta timbres. Arma un XML con la
  estructura de un CFDI 4.0 (sin sello real) y un UUID aleatorio, para
  probar todo el flujo del taller. SIN VALIDEZ FISCAL.
- "facturapi": timbra de verdad con Facturapi (https://www.facturapi.io).
  La llave va en la variable de entorno FACTURAPI_API_KEY (nunca en la
  base de datos). Con una llave sk_test_... las facturas NO llegan al SAT;
  con sk_live_... sí. El CSD (.cer/.key) y los datos del emisor se cargan
  una sola vez en el panel de Facturapi.

Si más adelante se quiere otro PAC (SW Sapien, Finkok, Facturama…), basta
con agregar otra rama en timbrar() / cancelar() / consultar().
"""
import os
import uuid as uuidlib
from datetime import datetime
from xml.etree import ElementTree as ET

import httpx

FACTURAPI_URL = "https://www.facturapi.io/v2"
RFC_GENERICO_NACIONAL = "XAXX010101000"


class ErrorPAC(Exception):
    """Error devuelto por el PAC (datos inválidos, llave incorrecta, etc.)."""


def llave_facturapi() -> str:
    return (os.getenv("FACTURAPI_API_KEY") or "").strip()


def modo_pac(config) -> str:
    """simulado | pruebas | produccion | sin_llave"""
    if (config.proveedor or "simulado") != "facturapi":
        return "simulado"
    llave = llave_facturapi()
    if not llave:
        return "sin_llave"
    return "produccion" if llave.startswith("sk_live") else "pruebas"


# ---------------------------------------------------------------------------
# API pública
# ---------------------------------------------------------------------------
def timbrar(config, datos: dict) -> dict:
    """datos = {serie, folio, fecha, forma_pago, metodo_pago, uso_cfdi,
    iva_porcentaje, receptor{rfc,nombre,regimen_fiscal,cp,correo},
    conceptos[{descripcion, clave_prod_serv, clave_unidad, unidad, cantidad,
    precio_unitario, importe, iva}], subtotal, iva, total}

    Regresa {uuid, pac_id, total, xml (bytes), pdf (bytes|None)}."""
    if (config.proveedor or "simulado") == "facturapi":
        return _timbrar_facturapi(datos)
    return _timbrar_simulado(config, datos)


def cancelar(config, factura, motivo: str, uuid_sustitucion: str | None) -> str:
    """Regresa el nuevo estado: 'cancelada' o 'cancelacion_pendiente'
    (cuando el receptor tiene que aceptar la cancelación en el SAT)."""
    if factura.proveedor == "facturapi":
        params = {"motive": motivo}
        if uuid_sustitucion:
            params["substitution"] = uuid_sustitucion
        r = _facturapi("DELETE", f"/invoices/{factura.pac_id}", params=params)
        return _estado_desde_facturapi(r.json())
    return "cancelada"


def consultar_estado(factura) -> str | None:
    """Solo aplica a Facturapi — para refrescar cancelaciones pendientes."""
    if factura.proveedor != "facturapi" or not factura.pac_id:
        return None
    r = _facturapi("GET", f"/invoices/{factura.pac_id}")
    return _estado_desde_facturapi(r.json())


def descargar_archivo(factura, tipo: str) -> bytes:
    """tipo = 'pdf' | 'xml' — solo Facturapi (el simulado ya los guarda)."""
    r = _facturapi("GET", f"/invoices/{factura.pac_id}/{tipo}")
    return r.content


# ---------------------------------------------------------------------------
# Facturapi
# ---------------------------------------------------------------------------
def _facturapi(metodo: str, ruta: str, **kwargs) -> httpx.Response:
    llave = llave_facturapi()
    if not llave:
        raise ErrorPAC("Falta la variable de entorno FACTURAPI_API_KEY en el servidor (backend/.env).")
    try:
        r = httpx.request(
            metodo, f"{FACTURAPI_URL}{ruta}",
            headers={"Authorization": f"Bearer {llave}"}, timeout=45, **kwargs,
        )
    except httpx.HTTPError as exc:
        raise ErrorPAC(f"No se pudo conectar con Facturapi: {exc}") from exc
    if r.status_code >= 400:
        try:
            mensaje = r.json().get("message") or r.text
        except ValueError:
            mensaje = r.text
        raise ErrorPAC(f"Facturapi rechazó la solicitud: {mensaje}")
    return r


def _estado_desde_facturapi(inv: dict) -> str:
    if inv.get("status") == "canceled":
        return "cancelada"
    if inv.get("cancellation_status") in ("pending", "accepted_pending"):
        return "cancelacion_pendiente"
    return "timbrada"


def _timbrar_facturapi(datos: dict) -> dict:
    tasa = (datos["iva_porcentaje"] or 0) / 100
    rec = datos["receptor"]
    items = []
    for c in datos["conceptos"]:
        producto = {
            "description": c["descripcion"],
            "product_key": c["clave_prod_serv"],
            "unit_key": c["clave_unidad"],
            "price": c["precio_unitario"],
            "tax_included": False,
        }
        if c.get("unidad"):
            producto["unit_name"] = c["unidad"]
        if tasa > 0:
            producto["taxes"] = [{"type": "IVA", "rate": round(tasa, 6)}]
        else:
            producto["taxability"] = "01"  # no objeto de impuesto
            producto["taxes"] = []
        items.append({"quantity": c["cantidad"], "product": producto})

    payload = {
        "customer": {
            "legal_name": rec["nombre"],
            "tax_id": rec["rfc"],
            "tax_system": rec["regimen_fiscal"],
            "address": {"zip": rec["cp"]},
        },
        "items": items,
        "payment_form": datos["forma_pago"],
        "payment_method": datos["metodo_pago"],
        "use": datos["uso_cfdi"],
        "series": datos["serie"],
        "folio_number": datos["folio"],
    }
    if rec.get("correo"):
        payload["customer"]["email"] = rec["correo"]
    if rec["rfc"] == RFC_GENERICO_NACIONAL and rec["nombre"].strip().upper() == "PUBLICO EN GENERAL":
        hoy = datos["fecha"]
        payload["global"] = {"periodicity": "day", "months": f"{hoy.month:02d}", "year": hoy.year}

    inv = _facturapi("POST", "/invoices", json=payload).json()
    xml = descargar_bytes_facturapi(inv["id"], "xml")
    pdf = descargar_bytes_facturapi(inv["id"], "pdf")
    return {"uuid": inv.get("uuid"), "pac_id": inv["id"], "total": inv.get("total", datos["total"]), "xml": xml, "pdf": pdf}


def descargar_bytes_facturapi(pac_id: str, tipo: str) -> bytes:
    return _facturapi("GET", f"/invoices/{pac_id}/{tipo}").content


# ---------------------------------------------------------------------------
# Simulado
# ---------------------------------------------------------------------------
NS_CFDI = "http://www.sat.gob.mx/cfd/4"
NS_TFD = "http://www.sat.gob.mx/TimbreFiscalDigital"
ET.register_namespace("cfdi", NS_CFDI)
ET.register_namespace("tfd", NS_TFD)


def _m(n: float) -> str:
    return f"{n:.2f}"


def _m6(n: float) -> str:
    """Valor unitario: hasta 6 decimales (el SAT lo permite), mínimo 2."""
    txt = f"{n:.6f}".rstrip("0")
    entero, _, dec = txt.partition(".")
    return f"{entero}.{dec.ljust(2, '0')}"


def _timbrar_simulado(config, datos: dict) -> dict:
    uuid = str(uuidlib.uuid4()).upper()
    tasa = (datos["iva_porcentaje"] or 0) / 100
    rec = datos["receptor"]
    c = lambda tag: f"{{{NS_CFDI}}}{tag}"  # noqa: E731

    comprobante = ET.Element(c("Comprobante"), {
        "Version": "4.0",
        "Serie": datos["serie"],
        "Folio": str(datos["folio"]),
        "Fecha": datos["fecha"].strftime("%Y-%m-%dT%H:%M:%S"),
        "Sello": "SIMULADO-SIN-VALIDEZ-FISCAL",
        "FormaPago": datos["forma_pago"],
        "NoCertificado": "00000000000000000000",
        "Certificado": "",
        "SubTotal": _m(datos["subtotal"]),
        "Moneda": "MXN",
        "Total": _m(datos["total"]),
        "TipoDeComprobante": "I",
        "Exportacion": "01",
        "MetodoPago": datos["metodo_pago"],
        "LugarExpedicion": config.cp_expedicion or "",
    })
    ET.SubElement(comprobante, c("Emisor"), {
        "Rfc": config.rfc_emisor or "",
        "Nombre": config.razon_social_emisor or "",
        "RegimenFiscal": config.regimen_fiscal_emisor or "",
    })
    ET.SubElement(comprobante, c("Receptor"), {
        "Rfc": rec["rfc"],
        "Nombre": rec["nombre"],
        "DomicilioFiscalReceptor": rec["cp"],
        "RegimenFiscalReceptor": rec["regimen_fiscal"],
        "UsoCFDI": datos["uso_cfdi"],
    })
    conceptos = ET.SubElement(comprobante, c("Conceptos"))
    for cp in datos["conceptos"]:
        nodo = ET.SubElement(conceptos, c("Concepto"), {
            "ClaveProdServ": cp["clave_prod_serv"],
            "Cantidad": f"{cp['cantidad']:g}",
            "ClaveUnidad": cp["clave_unidad"],
            "Unidad": cp.get("unidad") or "",
            "Descripcion": cp["descripcion"],
            "ValorUnitario": _m6(cp["precio_unitario"]),
            "Importe": _m(cp["importe"]),
            "ObjetoImp": "02" if tasa > 0 else "01",
        })
        if tasa > 0:
            imp = ET.SubElement(nodo, c("Impuestos"))
            tr = ET.SubElement(imp, c("Traslados"))
            ET.SubElement(tr, c("Traslado"), {
                "Base": _m(cp["importe"]), "Impuesto": "002", "TipoFactor": "Tasa",
                "TasaOCuota": f"{tasa:.6f}", "Importe": _m(cp["iva"]),
            })
    if tasa > 0:
        imp = ET.SubElement(comprobante, c("Impuestos"), {"TotalImpuestosTrasladados": _m(datos["iva"])})
        tr = ET.SubElement(imp, c("Traslados"))
        ET.SubElement(tr, c("Traslado"), {
            "Base": _m(datos["subtotal"]), "Impuesto": "002", "TipoFactor": "Tasa",
            "TasaOCuota": f"{tasa:.6f}", "Importe": _m(datos["iva"]),
        })
    complemento = ET.SubElement(comprobante, c("Complemento"))
    ET.SubElement(complemento, f"{{{NS_TFD}}}TimbreFiscalDigital", {
        "Version": "1.1",
        "UUID": uuid,
        "FechaTimbrado": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "RfcProvCertif": "SIMULADO",
        "SelloCFD": "SIMULADO",
        "NoCertificadoSAT": "00000000000000000000",
        "SelloSAT": "SIMULADO",
    })
    xml = ET.tostring(comprobante, encoding="utf-8", xml_declaration=True)
    return {"uuid": uuid, "pac_id": None, "total": datos["total"], "xml": xml, "pdf": None}
