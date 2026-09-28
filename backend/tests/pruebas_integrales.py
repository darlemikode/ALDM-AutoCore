"""Pruebas integrales del backend ALDM AutoCore (API real + base de datos real).

Recorre los flujos completos del taller y de la app de clientes contra el
servidor FastAPI levantado sobre la COPIA QA de la base (nunca la real).

Uso (PowerShell, desde backend/):
  1) Ventana 1 — servidor sobre la copia QA:
       .\\venv\\Scripts\\Activate.ps1
       $env:DATABASE_URL = "sqlite:///D:/dev/sistema-mecanico/_qa_tmp/qa_copy.db"
       uvicorn app.main:app --port 8001
  2) Ventana 2 — pruebas:
       .\\venv\\Scripts\\Activate.ps1
       python tests\\pruebas_integrales.py --usuario admin --password TU_PASSWORD

Resultado: consola + tests\\reporte_pruebas_integrales.json (se anexa al
documento de Pruebas Integrales). Todo lo que crea lleva el prefijo "QA-PI".
Por seguridad se niega a correr contra el puerto 8000 (servidor normal).
"""
import argparse
import json
import sys
import time
from datetime import datetime, timedelta

import httpx

p = argparse.ArgumentParser()
p.add_argument("--url", default="http://127.0.0.1:8001/api")
p.add_argument("--usuario", default="admin")
p.add_argument("--password", required=True)
p.add_argument("--permitir-puerto-8000", action="store_true", help="solo si de verdad apunta a una base de pruebas")
args = p.parse_args()
if ":8000" in args.url and not args.permitir_puerto_8000:
    sys.exit("Alto: el puerto 8000 es el servidor normal. Levanta la copia QA en el 8001 (ver instrucciones arriba).")

SUFIJO = datetime.now().strftime("%m%d%H%M%S")
cli = httpx.Client(base_url=args.url, timeout=30)
resultados = []
contexto = {}


class Caso:
    def __init__(self, clave, nombre, hu):
        self.clave, self.nombre, self.hu, self.pasos = clave, nombre, hu, []

    def ok(self, cond, desc, detalle=""):
        self.pasos.append({"paso": desc, "ok": bool(cond), "detalle": "" if cond else str(detalle)[:400]})
        return bool(cond)

    def __enter__(self):
        self.inicio = time.time()
        return self

    def __exit__(self, tipo, err, tb):
        if err is not None:
            self.pasos.append({"paso": "excepción", "ok": False, "detalle": f"{tipo.__name__}: {err}"[:400]})
        estado = "OK" if self.pasos and all(x["ok"] for x in self.pasos) else "FALLA"
        resultados.append({"clave": self.clave, "nombre": self.nombre, "hu": self.hu, "estado": estado,
                           "segundos": round(time.time() - self.inicio, 2), "pasos": self.pasos})
        print(f"{'✓' if estado == 'OK' else '✗'} {self.clave} {self.nombre} ({sum(x['ok'] for x in self.pasos)}/{len(self.pasos)})")
        for x in self.pasos:
            if not x["ok"]:
                print(f"     FALLA: {x['paso']} -> {x['detalle']}")
        return True  # sigue con el siguiente caso


def H(token):
    return {"Authorization": f"Bearer {token}"}


def req(metodo, ruta, token=None, **kw):
    headers = kw.pop("headers", {})
    if token:
        headers.update(H(token))
    return cli.request(metodo, ruta, headers=headers, **kw)


def j(r):
    try:
        return r.json()
    except Exception:
        return {}


# ---------------------------------------------------------------------------
with Caso("PI-01", "Autenticación del personal", "HU-SEG-01") as c:
    r = cli.post("/auth/login", data={"username": args.usuario, "password": args.password})
    c.ok(r.status_code == 200 and j(r).get("access_token"), "login con usuario y contraseña (form OAuth2)", r.text)
    T = j(r).get("access_token")
    contexto["T"] = T
    c.ok(len(j(r).get("permisos", [])) > 0, "el token trae los permisos del rol")
    r = req("GET", "/auth/me", T)
    c.ok(r.status_code == 200 and j(r).get("username") == args.usuario, "GET /auth/me devuelve el perfil", r.text)
    r = cli.post("/auth/login", data={"username": args.usuario, "password": "contraseña-incorrecta"})
    c.ok(r.status_code == 401, "contraseña incorrecta → 401", r.status_code)
    r = cli.get("/clientes/")
    c.ok(r.status_code == 401, "endpoint protegido sin token → 401", r.status_code)

T = contexto.get("T")
if not T:
    print("\nSin sesión no se pueden correr los demás casos. Revisa usuario/contraseña.")
    sys.exit(1)

with Caso("PI-02", "Catálogos precargados y códigos postales", "HU-CAT-01") as c:
    for ruta, minimo in [("/tipos-servicio/", 1), ("/colores-vehiculos/", 1), ("/vehiculos-marcas/", 1), ("/estados/", 32)]:
        r = req("GET", ruta, T)
        c.ok(r.status_code == 200 and len(j(r)) >= minimo, f"GET {ruta} con al menos {minimo} registros", f"{r.status_code} {len(j(r)) if isinstance(j(r), list) else r.text}")
    marcas = j(req("GET", "/vehiculos-marcas/", T))
    marca = next((m for m in marcas if m.get("nombre_marca") == "Nissan"), marcas[0] if marcas else None)
    contexto["marca"] = marca
    if marca:
        modelos = j(req("GET", f"/vehiculos-modelos/?id_marca_vehiculo={marca['id_marca_vehiculo']}", T))
        c.ok(isinstance(modelos, list) and all(m["id_marca_vehiculo"] == marca["id_marca_vehiculo"] for m in modelos), "modelos filtrados por marca")
        contexto["modelo"] = modelos[0] if modelos else None
    colores = j(req("GET", "/colores-vehiculos/", T))
    contexto["color"] = colores[0] if colores else None
    r = req("GET", "/codigos-postales/37000", T)
    c.ok(r.status_code == 200 and j(r).get("colonias"), "CP 37000 autollenado (estado, municipio, colonias)", r.text)
    r = req("GET", "/codigos-postales/99999", T)
    c.ok(r.status_code == 404, "CP inexistente → 404", r.status_code)

with Caso("PI-03", "Alta de cliente y vehículo con cuenta única", "HU-CLI-01, HU-VEH-01") as c:
    r = req("POST", "/clientes/", T, json={"nombre_cliente": f"QA-PI Cliente {SUFIJO}", "paterno_cliente": "Prueba",
                                            "telefono1": f"477{SUFIJO[-7:]}", "correo_cliente": f"qa{SUFIJO}@taller.test", "cp_cliente": "37000"})
    cliente = j(r)
    c.ok(r.status_code == 201 and str(cliente.get("numero_cuenta", "")).startswith("CTE-"), "cliente creado con número de cuenta CTE-…", r.text)
    contexto["cliente"] = cliente
    m, mo, co = contexto.get("marca"), contexto.get("modelo"), contexto.get("color")
    vin = f"QAPI{SUFIJO}VIN"
    r = req("POST", "/vehiculos/", T, json={"id_cliente": cliente.get("id_cliente"), "placas_vehiculo": f"QA-{SUFIJO[-4:]}", "numserie_vehiculo": vin,
                                             "id_marca_vehiculo": m and m["id_marca_vehiculo"], "id_modelo_vehiculo": mo and mo["id_modelo_vehiculo"],
                                             "id_color": co and co["id_color"], "id_year_vehiculo": "2020", "km_vehiculo": "45000"})
    veh = j(r)
    c.ok(r.status_code == 201 and str(veh.get("numero_cuenta", "")).startswith(cliente.get("numero_cuenta", "?")), "vehículo casado a la cuenta del cliente (CTE-…-01)", r.text)
    contexto["vehiculo"], contexto["vin"] = veh, vin
    r = req("GET", f"/clientes/{cliente.get('id_cliente')}/vehiculos", T)
    c.ok(r.status_code == 200 and len(j(r)) == 1, "listar vehículos del cliente", r.text)
    r = req("GET", f"/clientes/?q={SUFIJO}", T)
    c.ok(r.status_code == 200, "búsqueda de clientes responde", r.status_code)

cliente, veh = contexto.get("cliente", {}), contexto.get("vehiculo", {})

with Caso("PI-04", "Orden de servicio: alta, conceptos, refacciones e inventario", "HU-ORD-01, HU-ORD-02, HU-INV-01") as c:
    tipos = j(req("GET", "/tipos-servicio/", T))
    r = req("POST", "/servicios/", T, json={"id_cliente": cliente.get("id_cliente"), "id_vehiculo": veh.get("id_vehiculo"), "nombre_servicio": "QA-PI Servicio mayor",
                                             "km_llegada": "45000", "km_proximo_servicio": "50000", "diagnostico": "Ruido en frenos",
                                             "tipos_mantenimiento_ids": [t["id_tipo_servicio"] for t in tipos[:2]]})
    orden = j(r)
    c.ok(r.status_code == 201 and orden.get("status") == "abierto" and orden.get("etapa") == "recibido", "orden abierta en etapa 'recibido'", r.text)
    c.ok(len(orden.get("historial_etapas", [])) == 1, "historial de etapas inicial")
    c.ok(orden.get("iva_porcentaje") == 0 and orden.get("costos", {}).get("total") == 0, "sin IVA automático: IVA 0 y total $0")
    contexto["orden"] = orden
    r = req("PUT", f"/servicios/{orden.get('id_servicio')}", T, json={"iva_porcentaje": 16})
    c.ok(r.status_code == 200 and j(r).get("iva_porcentaje") == 16, "aplicar IVA 16% desde la orden", r.text)
    r = req("POST", "/refacciones/", T, json={"nombre_refaccion": f"QA-PI Balata {SUFIJO}", "preciocliente_refaccion": 350, "preciopropio_refaccion": 200, "cantidad_refaccion": 10})
    ref = j(r)
    c.ok(r.status_code == 201, "refacción creada con stock 10", r.text)
    contexto["refaccion"] = ref
    oid = orden.get("id_servicio")
    r = req("POST", f"/servicios/{oid}/detalles", T, json={"id_refaccion": ref.get("id_refaccion"), "descripcion": "Balatas delanteras", "cantidad": 2, "costo_refaccion": 700})
    c.ok(r.status_code == 201, "agregar refacción x2 a la orden", r.text)
    r = req("GET", f"/refacciones/{ref.get('id_refaccion')}", T)
    c.ok(j(r).get("cantidad_refaccion") == 8, "stock general descontado (10 − 2 = 8)", r.text)
    r = req("POST", f"/servicios/{oid}/detalles", T, json={"descripcion": "Mano de obra frenos", "cantidad": 1, "costo_mano_obra": 500})
    o = j(r)
    costos = o.get("costos", {})
    c.ok(r.status_code == 201 and costos.get("subtotal") == 1200 and costos.get("iva") == 192 and costos.get("total") == 1392, "subtotal 1200, IVA 192, total 1392", costos)
    detalle_mo = next((d for d in o.get("detalles", []) if d.get("descripcion") == "Mano de obra frenos"), {})
    r = req("PUT", f"/servicios/{oid}/detalles/{detalle_mo.get('id_servicio_detalle')}", T, json={"costo_mano_obra": 600})
    c.ok(r.status_code == 200 and j(r).get("costos", {}).get("total") == 1508, "editar mano de obra recalcula (1300 + IVA = 1508)", j(r).get("costos"))
    r = req("PUT", f"/servicios/{oid}/detalles/{detalle_mo.get('id_servicio_detalle')}", T, json={"costo_mano_obra": 500})
    c.ok(j(r).get("costos", {}).get("total") == 1392, "regresar a 1392")

oid = contexto.get("orden", {}).get("id_servicio")

with Caso("PI-05", "Seguimiento: etapas y chat de la orden", "HU-ORD-04, HU-ORD-05") as c:
    r = req("GET", "/servicios/etapas-disponibles", T)
    c.ok(r.status_code == 200 and len(j(r)) == 7, "7 etapas disponibles", r.text)
    r = req("PUT", f"/servicios/{oid}/etapa", T, json={"etapa": "en_reparacion", "comentario": "QA-PI cambio de balatas"})
    c.ok(r.status_code == 200 and j(r).get("etapa") == "en_reparacion" and len(j(r).get("historial_etapas", [])) == 2, "cambiar etapa guarda historial", r.text)
    ids = [h.get("id_registro") for h in j(r).get("historial_etapas", [])]
    c.ok(all(ids) and len(set(ids)) == len(ids), "cada registro del historial tiene id único")
    r = req("PUT", f"/servicios/{oid}/etapa", T, json={"etapa": "inventada"})
    c.ok(r.status_code == 400, "etapa inválida → 400", r.status_code)
    r = req("GET", f"/servicios/{oid}/chat/mensajes", T)
    c.ok(r.status_code == 200 and isinstance(j(r), list), "chat de la orden responde lista", r.text)
    r = req("POST", f"/servicios/{oid}/chat/mensajes", T, json={"texto": "QA-PI: su auto está en reparación", "tipo": "mensaje"})
    c.ok(r.status_code == 201 and j(r).get("autor_tipo") == "taller", "mensaje del taller", r.text)

with Caso("PI-06", "Cobro: abonos y finalización de la orden", "HU-ORD-06, HU-ORD-07") as c:
    r = req("POST", f"/servicios/{oid}/abonos", T, json={"monto_abono": 500, "tipo_pago": "tarjeta"})
    o = j(r)
    c.ok(r.status_code == 201 and o.get("costos", {}).get("saldo_pendiente") == 892, "abono $500 con tarjeta deja saldo $892", o.get("costos") or r.text)
    r = req("POST", f"/servicios/{oid}/finalizar", T, json={"tipo_pago": "efectivo", "monto_recibido": 500, "notificar_cliente": False})
    c.ok(r.status_code == 400, "pago que no cubre el saldo → 400", r.status_code)
    r = req("POST", f"/servicios/{oid}/finalizar", T, json={"tipo_pago": "efectivo", "monto_recibido": 1000, "comentarios_finales": "QA-PI entregado", "notificar_cliente": False})
    f = j(r)
    s = f.get("servicio", {})
    c.ok(r.status_code == 200 and abs(f.get("cambio", -1) - 108) < 0.01, "cambio correcto ($1000 − $892 = $108)", r.text)
    c.ok(s.get("status") == "cerrado" and s.get("pagado") is True and s.get("etapa") == "listo_entrega", "orden cerrada, pagada y en 'listo para entrega'")
    c.ok(s.get("costos", {}).get("saldo_pendiente") == 0, "saldo en $0")
    r = req("POST", f"/servicios/{oid}/detalles", T, json={"descripcion": "extra", "costo_extra": 10})
    c.ok(r.status_code == 400, "orden cerrada no acepta conceptos → 400", r.status_code)
    r = req("POST", f"/servicios/{oid}/finalizar", T, json={"notificar_cliente": False})
    c.ok(r.status_code == 400, "no se puede finalizar dos veces → 400", r.status_code)

with Caso("PI-07", "Documentos PDF de la orden", "HU-DOC-01") as c:
    for ruta in (f"/servicios/{oid}/recibo", f"/servicios/{oid}/nota-remision"):
        r = req("GET", ruta, T)
        c.ok(r.status_code == 200 and r.content[:4] == b"%PDF", f"GET {ruta} genera PDF", f"{r.status_code} {r.headers.get('content-type')}")

with Caso("PI-08", "Garantía, reapertura y cancelación", "HU-ORD-08, HU-ORD-09") as c:
    r = req("POST", "/servicios/", T, json={"id_cliente": cliente.get("id_cliente"), "id_vehiculo": veh.get("id_vehiculo"), "nombre_servicio": "QA-PI Garantía frenos",
                                             "es_garantia": True, "id_servicio_original": oid, "motivo_garantia": "Rechinido"})
    g = j(r)
    c.ok(r.status_code == 201 and g.get("etapa") == "diagnostico", "orden de garantía arranca en diagnóstico", r.text)
    r = req("POST", "/servicios/", T, json={"id_cliente": cliente.get("id_cliente"), "id_vehiculo": veh.get("id_vehiculo"), "nombre_servicio": "x", "es_garantia": True})
    c.ok(r.status_code == 400, "garantía sin orden original → 400", r.status_code)
    r = req("GET", f"/servicios/{oid}/reclamaciones", T)
    c.ok(r.status_code == 200 and any(x["id_servicio"] == g.get("id_servicio") for x in j(r)), "la orden original lista su reclamación", r.text)
    r = req("PUT", f"/servicios/{oid}", T, json={"status": "abierto"})
    c.ok(r.status_code == 200 and j(r).get("status") == "abierto", "reabrir orden", r.text)
    r = req("PUT", f"/servicios/{oid}", T, json={"status": "cerrado"})
    r = req("PUT", f"/servicios/{g.get('id_servicio')}", T, json={"status": "cancelado"})
    c.ok(r.status_code == 200 and j(r).get("status") == "cancelado", "cancelar orden de garantía", r.text)
    contexto["garantia"] = g

with Caso("PI-09", "Inspección digital", "HU-INS-01") as c:
    items = j(req("GET", "/inspecciones/items", T))
    c.ok(isinstance(items, list) and len(items) >= 20, "catálogo de puntos de inspección", len(items) if isinstance(items, list) else items)
    r = req("POST", "/inspecciones/", T, json={"id_vehiculo": veh.get("id_vehiculo"), "id_servicio": oid, "comentario_general": "QA-PI",
                                                "resultados": [{"id_item": items[0]["id_item"], "estado": "mal", "comentario": "desgaste"}]})
    ins = j(r)
    c.ok(r.status_code in (200, 201) and ins.get("id_inspeccion"), "crear inspección ligada a la orden", r.text)
    r = req("PUT", f"/inspecciones/{ins.get('id_inspeccion')}", T, json={"id_vehiculo": veh.get("id_vehiculo"), "id_servicio": oid, "comentario_general": "QA-PI autosave",
                                                                         "resultados": [{"id_item": it["id_item"], "estado": "bien"} for it in items[:3]]})
    c.ok(r.status_code == 200 and len(j(r).get("resultados", [])) == 3, "autosave (PUT) reemplaza resultados", r.text)

with Caso("PI-10", "Cotizaciones", "HU-COT-01") as c:
    r = req("POST", "/cotizaciones/", T, json={"titulo": f"QA-PI Cotización {SUFIJO}"})
    cot = j(r)
    c.ok(r.status_code == 201, "crear cotización", r.text)
    r = req("POST", f"/cotizaciones/{cot.get('id_cotizacion')}/detalles", T, json={"descripcion": "Afinación", "costo_mano_obra": 1000})
    c.ok(r.status_code in (200, 201) and j(r).get("costos", {}).get("total") == 1160, "costos de la cotización (1000 + IVA)", r.text)
    stock_antes = j(req("GET", f"/refacciones/{contexto.get('refaccion', {}).get('id_refaccion')}", T)).get("cantidad_refaccion")
    req("POST", f"/cotizaciones/{cot.get('id_cotizacion')}/detalles", T, json={"id_refaccion": contexto.get("refaccion", {}).get("id_refaccion"), "cantidad": 1, "costo_refaccion": 350})
    stock_despues = j(req("GET", f"/refacciones/{contexto.get('refaccion', {}).get('id_refaccion')}", T)).get("cantidad_refaccion")
    c.ok(stock_antes == stock_despues, "cotizar no descuenta inventario", f"{stock_antes} → {stock_despues}")
    r = req("GET", f"/cotizaciones/{cot.get('id_cotizacion')}/pdf", T)
    c.ok(r.status_code == 200 and r.content[:4] == b"%PDF", "PDF de la cotización", r.status_code)
    r = req("DELETE", f"/cotizaciones/{cot.get('id_cotizacion')}", T)
    c.ok(r.status_code in (200, 204), "eliminar cotización", r.status_code)

with Caso("PI-11", "Proveedores, productos y deudas", "HU-PRO-01") as c:
    r = req("POST", "/proveedores/", T, json={"nombre_proveedor": f"QA-PI Proveedor {SUFIJO}", "telefono1_proveedor": "4771112233"})
    prov = j(r)
    c.ok(r.status_code == 201, "crear proveedor", r.text)
    pid = prov.get("id_proveedor")
    r = req("POST", f"/proveedores/{pid}/productos", T, json={"nombre_producto": "Balatas cerámicas", "comentario": "QA-PI"})
    prod = j(r)
    c.ok(r.status_code == 201, "producto del proveedor", r.text)
    r = req("POST", f"/proveedores/{pid}/deudas", T, json={"id_producto_proveedor": prod.get("id_producto_proveedor"), "monto_total": 1500, "saldo_total": 1500, "cantidad_producto": 5})
    c.ok(r.status_code == 201, "registrar deuda", r.text)
    r = req("GET", "/proveedores/deudas/pendientes", T)
    c.ok(r.status_code == 200 and isinstance(j(r), list), "deudas pendientes", r.text)
    contexto["proveedor"] = prov

with Caso("PI-12", "Panel (dashboard)", "HU-DSH-01") as c:
    for ruta in ("/dashboard/resumen", "/dashboard/servicios-por-estado", "/dashboard/servicios-mensuales", "/dashboard/refacciones-bajo-stock-top", "/dashboard/proximos-servicios"):
        r = req("GET", ruta, T)
        c.ok(r.status_code == 200, f"GET {ruta}", f"{r.status_code} {r.text[:200]}")
    res = j(req("GET", "/dashboard/resumen", T))
    c.ok(res.get("total_clientes", 0) >= 1, "resumen cuenta clientes")

with Caso("PI-13", "App de clientes: invitación, activación y seguimiento", "HU-APC-01..05") as c:
    r = req("POST", f"/clientes/{cliente.get('id_cliente')}/invitar", T)
    inv = j(r)
    c.ok(r.status_code == 200 and inv.get("codigo_invitacion"), "el taller genera código de invitación", r.text)
    ident = cliente.get("telefono1")
    r = cli.post("/portal-cliente/activar", json={"identificador": ident, "codigo_invitacion": "XXXXXX", "password_nueva": "secreta1"})
    c.ok(r.status_code == 400, "código incorrecto → 400", r.status_code)
    r = cli.post("/portal-cliente/activar", json={"identificador": ident, "codigo_invitacion": inv.get("codigo_invitacion", ""), "password_nueva": "secreta1"})
    c.ok(r.status_code == 200 and j(r).get("access_token"), "activar cuenta con el código", r.text)
    r = cli.post("/portal-cliente/login", json={"identificador": ident, "password": "secreta1"})
    TC = j(r).get("access_token")
    c.ok(r.status_code == 200 and TC, "login del cliente", r.text)
    contexto["TC"] = TC
    r = req("GET", "/portal-cliente/me", TC)
    c.ok(r.status_code == 200 and j(r).get("id_cliente") == cliente.get("id_cliente"), "perfil del cliente", r.text)
    r = req("GET", "/portal-cliente/mis-servicios", TC)
    c.ok(r.status_code == 200 and any(s["id_servicio"] == oid for s in j(r)), "mis servicios incluye la orden", r.text[:200])
    r = req("GET", f"/portal-cliente/mis-servicios/{oid}", TC)
    c.ok(r.status_code == 200 and j(r).get("costos", {}).get("total") == 1392, "detalle con costos", r.text[:200])
    r = req("GET", f"/portal-cliente/mis-servicios/{oid}/nota-remision", TC)
    c.ok(r.status_code == 200 and r.content[:4] == b"%PDF", "nota de remisión descargable por el cliente", r.status_code)
    r = req("POST", f"/portal-cliente/mis-servicios/{oid}/chat", TC, json={"texto": "QA-PI gracias", "tipo": "mensaje"})
    c.ok(r.status_code == 201 and j(r).get("autor_tipo") == "cliente", "mensaje del cliente en el chat", r.text)
    r = req("GET", f"/portal-cliente/mis-servicios/{oid}/inspeccion", TC)
    c.ok(r.status_code == 200, "el cliente ve su inspección (solo lectura)", r.status_code)
    r = req("GET", "/portal-cliente/mis-vehiculos", TC)
    c.ok(r.status_code == 200 and len(j(r)) == 1, "mis vehículos", r.text[:200])
    r = req("GET", "/portal-cliente/promociones", TC)
    c.ok(r.status_code == 200, "promociones vigentes", r.status_code)

with Caso("PI-14", "Citas: el cliente solicita y el taller confirma", "HU-APC-06, HU-CIT-01") as c:
    TC = contexto.get("TC")
    manana = (datetime.now() + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0).isoformat()
    r = req("POST", "/portal-cliente/mis-citas", TC, json={"id_vehiculo": veh.get("id_vehiculo"), "descripcion": "QA-PI revisión", "fecha_propuesta": manana})
    cita = j(r)
    c.ok(r.status_code == 201 and cita.get("estado") == "pendiente", "cliente solicita cita con fecha propuesta", r.text)
    r = req("GET", "/citas/?estado=pendiente", T)
    c.ok(any(x["id_cita"] == cita.get("id_cita") for x in j(r)), "el taller la ve en pendientes", r.text[:200])
    r = req("PUT", f"/citas/{cita.get('id_cita')}/confirmar", T)
    c.ok(r.status_code == 200 and j(r).get("estado") == "confirmada" and j(r).get("confirmada_por"), "el taller la confirma", r.text)
    r = req("GET", "/portal-cliente/mis-citas", TC)
    c.ok(any(x["id_cita"] == cita.get("id_cita") and x["estado"] == "confirmada" for x in j(r)), "el cliente ve su cita confirmada", r.text[:200])

with Caso("PI-15", "Asistente (chatbot) sin sesión", "HU-APC-07") as c:
    r = cli.post("/chatbot/verificar", json={"numero_cuenta": cliente.get("numero_cuenta", ""), "vin": "VIN-EQUIVOCADO"})
    c.ok(r.status_code in (400, 401, 404), "VIN incorrecto se rechaza", r.status_code)
    r = cli.post("/chatbot/verificar", json={"numero_cuenta": cliente.get("numero_cuenta", ""), "vin": contexto.get("vin", "")})
    tb = j(r).get("token")
    c.ok(r.status_code == 200 and tb, "verificar identidad con cuenta + VIN", r.text)
    r = req("GET", "/chatbot/opcion/servicio", tb)
    c.ok(r.status_code == 200 and j(r).get("texto"), "respuesta 'Estatus de mi servicio'", r.text[:200])
    r = req("GET", "/chatbot/opcion/inventada", tb)
    c.ok(r.status_code == 400, "opción inexistente → 400", r.status_code)

with Caso("PI-16", "Seguridad: roles, permisos y aislamiento de tokens", "HU-SEG-02, HU-SEG-03") as c:
    TC = contexto.get("TC")
    r = req("GET", "/clientes/", TC)
    c.ok(r.status_code in (401, 403), "token de cliente no entra al panel del taller", r.status_code)
    r = req("GET", "/portal-cliente/me", T)
    c.ok(r.status_code == 401, "token del personal no entra a la app de clientes", r.status_code)
    r = req("POST", "/auth/roles", T, json={"nombre": f"QA-PI Rol {SUFIJO}", "descripcion": "solo ver clientes", "permisos": ["clientes.ver"]})
    rol = j(r)
    c.ok(r.status_code == 201 and len(rol.get("permisos", [])) == 1, "crear rol con 1 permiso", r.text)
    r = req("POST", "/auth/roles", T, json={"nombre": f"QA-PI Rol {SUFIJO}"})
    c.ok(r.status_code == 400, "rol duplicado → 400", r.status_code)
    usuario = f"qapi{SUFIJO}"
    r = req("POST", "/auth/usuarios", T, json={"username": usuario, "password": "secreta1", "nombre_completo": "QA-PI Usuario", "id_rol": rol.get("id_rol")})
    u = j(r)
    c.ok(r.status_code == 201 and "password" not in u and "hashed_password" not in u, "crear usuario sin exponer contraseña", r.text)
    r = cli.post("/auth/login", data={"username": usuario, "password": "secreta1"})
    TU = j(r).get("access_token")
    c.ok(r.status_code == 200 and TU, "el nuevo usuario inicia sesión", r.text)
    c.ok(req("GET", "/clientes/", TU).status_code == 200, "con 'clientes.ver' sí lista clientes")
    c.ok(req("POST", "/servicios/", TU, json={"id_cliente": 1, "id_vehiculo": 1, "nombre_servicio": "x"}).status_code == 403, "sin 'servicios.crear' → 403")
    r = req("DELETE", f"/auth/roles/{rol.get('id_rol')}", T)
    c.ok(r.status_code == 400, "rol con usuarios no se elimina → 400", r.status_code)
    r = req("PUT", f"/auth/usuarios/{u.get('id_usuario')}/desactivar", T)
    c.ok(r.status_code == 200 and j(r).get("activo") is False, "desactivar usuario", r.text)
    r = cli.post("/auth/login", data={"username": usuario, "password": "secreta1"})
    c.ok(r.status_code == 401, "usuario desactivado ya no entra → 401", r.status_code)

# ---------------------------------------------------------------------------
total = len(resultados)
ok = sum(1 for x in resultados if x["estado"] == "OK")
pasos = sum(len(x["pasos"]) for x in resultados)
pasos_ok = sum(p["ok"] for x in resultados for p in x["pasos"])
reporte = {"fecha": datetime.now().isoformat(timespec="seconds"), "url": args.url, "casos": total, "casos_ok": ok,
           "pasos": pasos, "pasos_ok": pasos_ok, "resultados": resultados}
import os
salida = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reporte_pruebas_integrales.json")
with open(salida, "w", encoding="utf-8") as fh:
    json.dump(reporte, fh, ensure_ascii=False, indent=2)
print(f"\nCasos OK: {ok}/{total} · Pasos OK: {pasos_ok}/{pasos}")
print(f"Reporte: {salida}")
sys.exit(0 if ok == total else 1)
