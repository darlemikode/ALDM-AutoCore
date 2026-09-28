"""Pruebas de multi-taller: aislamiento de datos entre talleres, usuarios en
varios talleres, suscripción (prueba, gracia, vencida, renovación,
suspensión), módulos por paquete y súper administración.

Uso (desde backend/, con el servidor levantado sobre una base de PRUEBAS):
  python tests/pruebas_multitaller.py --url http://127.0.0.1:8001/api --usuario admin --password TU_PASSWORD
Todo lo que crea lleva el prefijo "QA-MT".
"""
import argparse
import sys
from datetime import date, timedelta, datetime

import httpx

p = argparse.ArgumentParser()
p.add_argument("--url", default="http://127.0.0.1:8001/api")
p.add_argument("--usuario", default="admin")
p.add_argument("--password", required=True)
args = p.parse_args()
if ":8000" in args.url:
    sys.exit("Alto: el puerto 8000 es el servidor normal.")

S = datetime.now().strftime("%m%d%H%M%S")
cli = httpx.Client(base_url=args.url, timeout=30)
ok_total, fallas = 0, []


def check(cond, desc, detalle=""):
    global ok_total
    if cond:
        ok_total += 1
        print(f"  ✓ {desc}")
    else:
        fallas.append(desc)
        print(f"  ✗ {desc} -> {str(detalle)[:300]}")
    return cond


def h(token, **extra):
    d = {"Authorization": f"Bearer {token}"}
    d.update(extra)
    return d


def login(usuario, password, **kw):
    r = cli.post("/auth/login", data={"username": usuario, "password": password, **kw})
    return r


print("1. Súper administrador")
r = login(args.usuario, args.password)
check(r.status_code == 200, "login admin", r.text)
A = r.json()
TA = A["access_token"]
check(A.get("es_superadmin") and A.get("id_taller"), "admin es súper admin y entra a su taller", A)
ID_A = A["id_taller"]
r = cli.get("/superadmin/configuracion", headers=h(TA))
check(r.status_code == 200 and "dias_prueba" in r.json(), "leer configuración de días", r.text)
cfg_original = r.json()
r = cli.put("/superadmin/configuracion", headers=h(TA), json={**cfg_original, "dias_prueba": 10, "dias_gracia": 3, "dias_conservacion": 60, "dias_aviso_vencimiento": 5})
check(r.status_code == 200 and r.json()["dias_prueba"] == 10, "días de prueba/gracia/conservación capturables", r.text)
r = cli.post("/superadmin/tipos-cobro", headers=h(TA), json={"nombre": f"QA-MT Bimestral {S}", "meses": 2, "descuento_porcentaje": 3})
check(r.status_code == 201, "tipo de cobro capturable", r.text)
TIPO_BIM = r.json().get("id_tipo_cobro")
paquetes = cli.get("/superadmin/paquetes", headers=h(TA)).json()
basico = next(p for p in paquetes if p["nombre"] == "Básico")
premium = max(paquetes, key=lambda p: p["precio_mensual"])

print("2. Alta de un taller nuevo (en prueba)")
r = cli.post("/superadmin/talleres", headers=h(TA), json={
    "nombre_comercial": f"QA-MT Taller B {S}", "telefono": "4770000000", "id_paquete": premium["id_paquete"], "en_prueba": True,
    "admin": {"nombre_completo": "Admin B", "username": f"qamtb{S}", "password": "secretoB1"},
})
check(r.status_code == 201, "crear taller B con su administrador", r.text)
B = r.json()
ID_B, COD_B = B.get("id_taller"), B.get("codigo")
check(B.get("estado", {}).get("estado") == "prueba", "B arranca en prueba", B.get("estado"))
check(B.get("suscripcion", {}).get("fecha_vencimiento") == str(date.today() + timedelta(days=10)), "prueba vence en los días configurados", B.get("suscripcion"))
check(bool(COD_B), "B tiene código para su QR", B)

r = login(f"qamtb{S}", "secretoB1")
check(r.status_code == 200 and r.json()["id_taller"] == ID_B, "admin B entra directo a su taller", r.text)
TB = r.json()["access_token"]
check(r.json()["estado_suscripcion"]["estado"] == "prueba", "B ve su estado de prueba", r.json().get("estado_suscripcion"))
check("proveedores.ver" in r.json()["permisos"], "B tiene todos los permisos del paquete Premium")
r = cli.get("/superadmin/talleres", headers=h(TB))
check(r.status_code == 403, "un taller NO puede entrar a súper administración", r.status_code)

print("3. Aislamiento de datos")
vin = f"QAMTVIN{S}"
ca = cli.post("/clientes/", headers=h(TA), json={"nombre_cliente": f"QA-MT Cliente A {S}", "telefono1": f"55{S}"}).json()
va = cli.post("/vehiculos/", headers=h(TA), json={"id_cliente": ca["id_cliente"], "numserie_vehiculo": vin}).json()
check("id_vehiculo" in va, "A registra vehículo con VIN", va)
cb = cli.post("/clientes/", headers=h(TB), json={"nombre_cliente": f"QA-MT Cliente B {S}", "telefono1": f"55{S}"})
check(cb.status_code == 201, "B registra un cliente", cb.text)
cb = cb.json()
vb = cli.post("/vehiculos/", headers=h(TB), json={"id_cliente": cb["id_cliente"], "numserie_vehiculo": vin})
check(vb.status_code == 201, "B puede registrar el MISMO VIN (otro taller)", vb.text)
vb = vb.json()
ids_a = {c["id_cliente"] for c in cli.get("/clientes/", headers=h(TA)).json()}
ids_b = {c["id_cliente"] for c in cli.get("/clientes/", headers=h(TB)).json()}
check(ca["id_cliente"] in ids_a and cb["id_cliente"] not in ids_a, "A no ve clientes de B")
check(ids_b == {cb["id_cliente"]}, "B solo ve sus clientes", ids_b)
check(cli.get(f"/clientes/{ca['id_cliente']}", headers=h(TB)).status_code == 404, "B no puede abrir un cliente de A por id")
check(cli.put(f"/clientes/{ca['id_cliente']}", headers=h(TB), json={"nombre_cliente": "hack"}).status_code == 404, "B no puede editar un cliente de A")
check(cli.delete(f"/clientes/{ca['id_cliente']}", headers=h(TB)).status_code == 404, "B no puede borrar un cliente de A")
check(cli.get(f"/clientes/{ca['id_cliente']}", headers=h(TB, **{"X-Taller": A.get("codigo_taller") or ""})).status_code == 404,
      "el encabezado X-Taller no permite brincar a otro taller")
sb = cli.post("/servicios/", headers=h(TB), json={"id_cliente": cb["id_cliente"], "id_vehiculo": vb["id_vehiculo"], "nombre_servicio": "QA-MT servicio B"})
check(sb.status_code == 201, "B abre una orden", sb.text)
sb = sb.json()
check(all(s["id_servicio"] != sb["id_servicio"] for s in cli.get("/servicios/", headers=h(TA)).json()), "A no ve órdenes de B")
check(cli.get(f"/servicios/{sb['id_servicio']}", headers=h(TA)).status_code == 404, "A no abre la orden de B")
x = cli.post("/servicios/", headers=h(TB), json={"id_cliente": ca["id_cliente"], "id_vehiculo": va["id_vehiculo"], "nombre_servicio": "QA-MT cruzado"})
check(x.status_code in (400, 404), "B no puede abrir orden con cliente/vehículo de A", x.status_code)
roles_b = cli.get("/roles/", headers=h(TB)).json()
roles_a = cli.get("/roles/", headers=h(TA)).json()
check({r["id_rol"] for r in roles_b}.isdisjoint({r["id_rol"] for r in roles_a}), "cada taller tiene sus propios roles")
check(any(r["nombre"] == "Administrador General" for r in roles_b), "B tiene sus roles base")
usuarios_b = cli.get("/usuarios/", headers=h(TB)).json()
check([u["username"] for u in usuarios_b] == [f"qamtb{S}"], "B solo ve sus usuarios", [u["username"] for u in usuarios_b])
check(all(u["username"] != f"qamtb{S}" for u in cli.get("/usuarios/", headers=h(TA)).json()), "A no ve usuarios de B")
d_b = cli.get("/dashboard/resumen", headers=h(TB))
check(d_b.status_code == 200 and d_b.json().get("total_clientes") == 1, "el panel de B cuenta solo lo de B", d_b.text[:200])
cfg_b = cli.get("/configuracion-taller/", headers=h(TB)).json()
check(cfg_b.get("nombre_taller") == f"QA-MT Taller B {S}", "B tiene su propia configuración de taller", cfg_b)

print("4. Catálogos compartidos")
marcas_b = cli.get("/vehiculos-marcas/", headers=h(TB))
check(marcas_b.status_code == 200 and len(marcas_b.json()) > 10, "B ve el catálogo general de marcas", marcas_b.status_code)
base_marcas = "/vehiculos-marcas"
general = marcas_b.json()[0]
nueva = cli.post(f"{base_marcas}/", headers=h(TB), json={"nombre_marca": f"QA-MT Marca B {S}"})
check(nueva.status_code == 201, "B agrega una marca propia", nueva.text)
check(all(m["nombre_marca"] != f"QA-MT Marca B {S}" for m in cli.get(f"{base_marcas}/", headers=h(TA)).json()), "A no ve la marca propia de B")
e = cli.put(f"{base_marcas}/{general['id_marca_vehiculo']}", headers=h(TB), json={"nombre_marca": "hack"})
check(e.status_code == 403, "B no puede editar una marca del catálogo general", e.status_code)
e = cli.put(f"{base_marcas}/{general['id_marca_vehiculo']}", headers=h(TA), json={"nombre_marca": general["nombre_marca"] + " "})
check(e.status_code == 200, "el taller principal sí administra el catálogo general", e.text[:200])
cli.put(f"{base_marcas}/{general['id_marca_vehiculo']}", headers=h(TA), json={"nombre_marca": general["nombre_marca"]})

print("5. Usuario con acceso a 2 talleres")
roles_a_asesor = next(r for r in roles_a if r["nombre"].startswith("Asesor"))
r = cli.post("/superadmin/usuarios", headers=h(TA), json={
    "username": f"qamtmulti{S}", "password": "multi123", "nombre_completo": "QA-MT Multi",
    "membresias": [{"id_taller": ID_A, "id_rol": roles_a_asesor["id_rol"]}, {"id_taller": ID_B}],
})
check(r.status_code == 201 and len(r.json()["membresias"]) == 2, "súper admin crea usuario con 2 talleres", r.text)
r = login(f"qamtmulti{S}", "multi123")
M = r.json()
check(len(M.get("talleres", [])) == 2, "al entrar ve sus 2 talleres", M.get("talleres"))
r = cli.post("/auth/seleccionar-taller", headers=h(M["access_token"]), json={"id_taller": ID_A})
check(r.status_code == 200 and r.json()["rol"].startswith("Asesor") and "roles.ver" not in r.json()["permisos"], "en A es Asesor", r.text[:200])
TMA = r.json()["access_token"]
r = cli.post("/auth/seleccionar-taller", headers=h(TMA), json={"id_taller": ID_B})
check(r.status_code == 200 and r.json()["rol"] == "Administrador General", "cambia a B y ahí es Administrador", r.text[:200])
TMB = r.json()["access_token"]
check({c["id_cliente"] for c in cli.get("/clientes/", headers=h(TMB)).json()} == ids_b, "en B ve solo los clientes de B")
check(cli.post("/auth/seleccionar-taller", headers=h(TB), json={"id_taller": ID_A}).status_code == 403, "admin B no puede cambiarse a A")
upd = cli.put(f"/usuarios/{r.json().get('id_usuario', 0) or [u for u in cli.get('/usuarios/', headers=h(TB)).json() if u['username']==f'qamtmulti{S}'][0]['id_usuario']}",
              headers=h(TB), json={"nombre_completo": "cambiado por B"})
check(upd.status_code == 403, "B no puede cambiar datos personales de un usuario compartido", upd.status_code)

print("6. Módulos por paquete")
r = cli.put(f"/superadmin/talleres/{ID_B}/suscripcion", headers=h(TA), json={"id_paquete": basico["id_paquete"]})
check(r.status_code == 200, "cambiar B a paquete Básico", r.text)
import time; time.sleep(0.1)
r = cli.get("/proveedores/", headers=h(TB))
check(r.status_code == 403, "B ya no entra a Proveedores (no está en su paquete)", r.status_code)
me = cli.get("/auth/me", headers=h(TB)).json()
check("proveedores.ver" not in me["permisos"] and "clientes.ver" in me["permisos"], "/auth/me ya no trae permisos de Proveedores")
cli.put(f"/superadmin/talleres/{ID_B}/suscripcion", headers=h(TA), json={"id_paquete": premium["id_paquete"]})

print("7. Suscripción: gracia, vencida, renovación, suspensión")
ayer = str(date.today() - timedelta(days=1))
r = cli.put(f"/superadmin/talleres/{ID_B}/suscripcion", headers=h(TA), json={"estado": "activa", "fecha_vencimiento": ayer})
check(r.status_code == 200 and r.json()["estado"]["estado"] == "gracia", "vencida ayer → periodo de gracia", r.json().get("estado"))
check(cli.get("/clientes/", headers=h(TB)).status_code == 200, "en gracia puede consultar")
r = cli.post("/clientes/", headers=h(TB), json={"nombre_cliente": "QA-MT no debe"})
check(r.status_code == 402, "en gracia NO puede capturar", r.status_code)
check(cli.get("/auth/me", headers=h(TB)).json()["estado_suscripcion"]["solo_lectura"], "/auth/me avisa solo lectura")
hace_mucho = str(date.today() - timedelta(days=30))
cli.put(f"/superadmin/talleres/{ID_B}/suscripcion", headers=h(TA), json={"fecha_vencimiento": hace_mucho})
r = cli.get("/clientes/", headers=h(TB))
check(r.status_code == 402, "vencida después de la gracia → bloqueado", r.status_code)
check(cli.get("/auth/me", headers=h(TB)).status_code == 200, "aun bloqueado puede ver su estado en /auth/me")
r = cli.post(f"/superadmin/talleres/{ID_B}/renovar", headers=h(TA), json={"id_tipo_cobro": TIPO_BIM, "metodo_pago": "transferencia", "referencia": "QA-MT"})
check(r.status_code == 201, "registrar pago/renovación", r.text)
pago = r.json()
esperado = round(premium["precio_mensual"] * 2 * 0.97, 2)
check(abs(pago["monto"] - esperado) < 0.01, "monto = precio mensual × meses − descuento", (pago["monto"], esperado))
check(pago["periodo_desde"] == str(date.today()), "vencida: el nuevo periodo empieza hoy", pago)
check(cli.post("/clientes/", headers=h(TB), json={"nombre_cliente": f"QA-MT tras renovar {S}"}).status_code == 201, "renovado: vuelve a capturar")
r = cli.post(f"/superadmin/talleres/{ID_B}/renovar", headers=h(TA), json={"metodo_pago": "efectivo"})
check(r.status_code == 201 and r.json()["periodo_desde"] == str(date.fromisoformat(pago["periodo_hasta"]) + timedelta(days=1)),
      "vigente: la renovación se suma al final (no pierde días)", r.text[:200])
r = cli.post(f"/superadmin/talleres/{ID_B}/suspender", headers=h(TA), json={"motivo": "QA-MT"})
check(r.status_code == 200 and r.json()["estado"]["bloqueado"], "suspender taller", r.text[:200])
check(cli.get("/clientes/", headers=h(TB)).status_code == 402, "suspendido → sin acceso")
check(cli.post(f"/superadmin/talleres/{ID_A}/suspender", headers=h(TA), json={}).status_code == 400, "el taller principal no se puede suspender")
r = cli.post(f"/superadmin/talleres/{ID_B}/reactivar", headers=h(TA))
check(r.status_code == 200 and not r.json()["estado"]["bloqueado"], "reactivar", r.text[:200])
check(cli.get("/clientes/", headers=h(TB)).status_code == 200, "reactivado → acceso normal")

print("8. App de clientes por QR")
r = cli.get("/portal-cliente/taller", headers={"X-Taller": COD_B})
check(r.status_code == 200 and r.json()["id_taller"] == ID_B, "el QR (código) identifica al taller", r.text)
check(cli.get("/portal-cliente/taller", headers={"X-Taller": "NOEXISTE999"}).status_code == 404, "código inválido → 404")
inv = cli.post(f"/clientes/{cb['id_cliente']}/invitar", headers=h(TB))
check(inv.status_code == 200, "B genera invitación", inv.text)
codigo_inv = inv.json().get("codigo_invitacion")
r = cli.post("/portal-cliente/activar", headers={"X-Taller": COD_B}, json={"identificador": f"55{S}", "codigo_invitacion": codigo_inv, "password_nueva": "cliente1"})
check(r.status_code == 200, "cliente de B activa su cuenta con el código del QR (mismo teléfono existe en A)", r.text)
TC = r.json().get("access_token")
r = cli.post("/portal-cliente/login", headers={"X-Taller": COD_B}, json={"identificador": f"55{S}", "password": "cliente1"})
check(r.status_code == 200 and r.json()["id_cliente"] == cb["id_cliente"], "login del cliente en su taller", r.text)
mis = cli.get("/portal-cliente/mis-servicios", headers=h(TC)).json()
check([s["id_servicio"] for s in mis] == [sb["id_servicio"]], "el cliente ve solo sus órdenes de B", mis)
r = cli.post("/portal-cliente/login", headers={"X-Taller": A.get("codigo_taller")}, json={"identificador": f"55{S}", "password": "cliente1"})
check(r.status_code == 401, "con el QR de A no entra (su cuenta es de B)", r.status_code)

print("9. Taller sin administrador: el dueño lo registra al entrar la primera vez")
r = cli.post("/superadmin/talleres", headers=h(TA), json={"nombre_comercial": f"QA-MT Taller C {S}", "id_paquete": premium["id_paquete"], "en_prueba": True})
check(r.status_code == 201 and r.json()["pendiente_activacion"] and r.json()["codigo_activacion"], "alta sin administrador genera código de activación", r.text[:300])
C = r.json()
check(cli.post("/auth/verificar-activacion", json={"codigo_taller": C["codigo"], "codigo_activacion": "MALO1234"}).status_code == 400, "código de activación incorrecto → 400")
check(cli.post("/auth/verificar-activacion", json={"codigo_taller": COD_B, "codigo_activacion": C["codigo_activacion"]}).status_code == 400, "código de otro taller → 400")
r = cli.post("/auth/verificar-activacion", json={"codigo_taller": C["codigo"].lower(), "codigo_activacion": C["codigo_activacion"].lower()})
check(r.status_code == 200 and r.json()["nombre"] == C["nombre_comercial"], "verificar muestra el taller", r.text)
base = {"codigo_taller": C["codigo"], "codigo_activacion": C["codigo_activacion"]}
check(cli.post("/auth/activar-taller", json={**base, "nombre_completo": "X", "username": f"qamtb{S}", "password": "secreto1"}).status_code == 400, "no deja usar un usuario ya ocupado")
r = cli.post("/auth/activar-taller", json={**base, "nombre_completo": "Dueño C", "username": f"qamtc{S}", "password": "secretoC1"})
check(r.status_code == 200 and r.json()["id_taller"] == C["id_taller"] and r.json()["rol"] == "Administrador General", "el dueño registra su usuario y entra como Administrador", r.text[:300])
TCC = r.json().get("access_token")
check(cli.get("/clientes/", headers=h(TCC)).json() == [], "entra a SU taller vacío")
check(cli.post("/auth/activar-taller", json={**base, "nombre_completo": "Otro", "username": f"qamtc2{S}", "password": "secretoC1"}).status_code == 400, "el código ya no sirve una segunda vez")
check(login(f"qamtc{S}", "secretoC1").status_code == 200, "después entra con usuario y contraseña")
r = cli.get(f"/superadmin/talleres/{C['id_taller']}", headers=h(TA)).json()
check(not r["pendiente_activacion"] and r["codigo_activacion"] is None, "ya no aparece pendiente de activar", r.get("pendiente_activacion"))
check(cli.post(f"/superadmin/talleres/{C['id_taller']}/codigo-activacion", headers=h(TA)).status_code == 400, "no se regenera código si ya tiene administrador")

print("10. Estadísticas")
r = cli.get("/superadmin/resumen", headers=h(TA))
check(r.status_code == 200 and r.json()["total_talleres"] >= 2 and len(r.json()["ingresos_por_mes"]) == 6, "resumen con estadísticas", r.text[:300])
check(r.json()["ingresos_mes"] >= esperado, "ingresos del mes incluyen las renovaciones", r.json()["ingresos_mes"])
r = cli.get(f"/superadmin/talleres/{ID_B}", headers=h(TA))
check(r.json()["uso"]["clientes"] == 2 and r.json()["uso"]["ordenes_total"] == 1, "uso del taller (clientes, órdenes)", r.json().get("uso"))
check(len(cli.get(f"/superadmin/pagos?id_taller={ID_B}", headers=h(TA)).json()) == 2, "historial de pagos del taller")

cli.put("/superadmin/configuracion", headers=h(TA), json=cfg_original)
print(f"\nOK: {ok_total} · Fallas: {len(fallas)}")
for f in fallas:
    print("  ✗", f)
sys.exit(1 if fallas else 0)
