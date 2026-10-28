"""Pruebas del seguimiento público de órdenes (enlace / QR).

Uso (desde backend/, con el servidor levantado sobre una base de PRUEBAS):
  python tests/pruebas_seguimiento.py --url http://127.0.0.1:8001/api --usuario admin --password TU_PASSWORD
Todo lo que crea lleva el prefijo "QA-SEG".
"""
import argparse
import sys
from datetime import datetime

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


def h(token):
    return {"Authorization": f"Bearer {token}"}


def token_de(url: str) -> str:
    return url.rstrip("/").split("/seguimiento/")[-1]


print("1. Preparación")
r = cli.post("/auth/login", data={"username": args.usuario, "password": args.password})
check(r.status_code == 200, "login admin", r.text)
T = r.json()["access_token"]
c = cli.post("/clientes/", headers=h(T), json={"nombre_cliente": f"QA-SEG Cliente {S}", "telefono1": f"55{S}"}).json()
v = cli.post("/vehiculos/", headers=h(T), json={"id_cliente": c["id_cliente"], "numserie_vehiculo": f"QASEG{S}", "placas_vehiculo": "ABC1234"}).json()
s = cli.post("/servicios/", headers=h(T), json={"id_cliente": c["id_cliente"], "id_vehiculo": v["id_vehiculo"], "nombre_servicio": f"QA-SEG servicio {S}"})
check(s.status_code == 201, "se abre una orden", s.text)
ID = s.json()["id_servicio"]
d = cli.post(f"/servicios/{ID}/detalles", headers=h(T), json={"descripcion": "Balatas delanteras", "cantidad": 1, "costo_mano_obra": 300, "costo_refaccion": 700})
check(d.status_code == 201, "se agrega un concepto con refacción", d.text)

print("2. Generar el enlace")
r = cli.post(f"/seguimiento-orden/{ID}", headers=h(T))
check(r.status_code == 200 and r.json()["activo"] and "/seguimiento/" in (r.json()["url"] or ""), "se genera el enlace", r.text)
URL = r.json()["url"]
TOK = token_de(URL)
check(len(TOK) == 43, "el token es largo y aleatorio (256 bits)", len(TOK))
r2 = cli.post(f"/seguimiento-orden/{ID}", headers=h(T))
check(token_de(r2.json()["url"]) == TOK, "pedirlo otra vez devuelve el mismo (no se duplica)")
check(token_de(cli.get(f"/seguimiento-orden/{ID}", headers=h(T)).json()["url"]) == TOK, "el panel puede volver a mostrar el enlace")

print("3. Consulta pública (sin login)")
pub = httpx.Client(base_url=args.url, timeout=30)  # sin Authorization ni X-Taller
r = pub.get(f"/seguimiento/{TOK}")
check(r.status_code == 200, "el cliente ve el seguimiento sin sesión", r.text)
J = r.json()
check(J["orden"]["folio"] == ID and J["montos"]["total"] == 1000 and J["montos"]["saldo"] == 1000, "muestra folio, total y saldo", J.get("montos"))
check(any(x["descripcion"] == "Balatas delanteras" and x["es_refaccion"] for x in J["conceptos"]), "lista la refacción", J.get("conceptos"))
texto = r.text
check("QA-SEG Cliente" not in texto and f"55{S}" not in texto and f"QASEG{S}" not in texto and "ABC1234" not in texto,
      "NO expone nombre, teléfono, VIN ni placas completas")
check(J["orden"]["placas"] == "••••234", "las placas salen enmascaradas", J["orden"]["placas"])
check("no-store" in r.headers.get("cache-control", "") and "noindex" in r.headers.get("x-robots-tag", ""), "sin caché y sin indexar")

print("4. Tokens inválidos")
check(pub.get("/seguimiento/" + "A" * 43).status_code == 404, "token inventado -> 404")
check(pub.get("/seguimiento/corto").status_code == 404, "token con formato malo -> 404")
check(pub.get(f"/seguimiento/{TOK[:-1]}x").status_code == 404, "token alterado -> 404")

print("5. Cambia de etapa (sigue activo)")
for etapa in ("en_reparacion", "espera_refacciones", "listo_entrega"):
    cli.put(f"/servicios/{ID}/etapa", headers=h(T), json={"etapa": etapa})
    r = pub.get(f"/seguimiento/{TOK}")
    check(r.status_code == 200 and r.json()["orden"]["etapa"] == etapa, f"sigue activo en «{etapa}»", r.text)
check(len(pub.get(f"/seguimiento/{TOK}").json()["historial"]) >= 3, "muestra el historial de avance")

print("6. Finalizar la orden apaga el enlace al instante")
r = cli.post(f"/servicios/{ID}/finalizar", headers=h(T), json={"tipo_pago": "efectivo", "monto_recibido": 1000, "notificar_cliente": False})
check(r.status_code == 200, "se finaliza la orden", r.text)
r = pub.get(f"/seguimiento/{TOK}")
check(r.status_code == 410 and r.json()["codigo"] == "finalizada" and "finalizada" in r.json()["mensaje"], "consulta -> 410 con el aviso amable", r.text)
check("montos" not in r.json() and "conceptos" not in r.json(), "ya no entrega ningún dato de la orden")
r = cli.post(f"/seguimiento-orden/{ID}/regenerar", headers=h(T))
check(r.status_code == 400, "no se puede generar enlace nuevo para una orden finalizada", r.text)

print("7. Regenerar y apagar a mano (con otra orden)")
s2 = cli.post("/servicios/", headers=h(T), json={"id_cliente": c["id_cliente"], "id_vehiculo": v["id_vehiculo"], "nombre_servicio": f"QA-SEG servicio 2 {S}"}).json()
ID2 = s2["id_servicio"]
URL2 = cli.post(f"/seguimiento-orden/{ID2}", headers=h(T)).json()["url"]
TOK2 = token_de(URL2)
check(pub.get(f"/seguimiento/{TOK2}").status_code == 200, "el enlace de la orden 2 funciona")
nuevo = token_de(cli.post(f"/seguimiento-orden/{ID2}/regenerar", headers=h(T)).json()["url"])
check(nuevo != TOK2 and pub.get(f"/seguimiento/{TOK2}").status_code == 404, "al regenerar, el enlace/QR anterior deja de servir")
check(pub.get(f"/seguimiento/{nuevo}").status_code == 200, "el nuevo sí funciona")
r = cli.delete(f"/seguimiento-orden/{ID2}", headers=h(T))
check(r.status_code == 200 and not r.json()["existe"], "se apaga a mano", r.text)
check(pub.get(f"/seguimiento/{nuevo}").status_code == 404, "apagado -> 404")

print("8. Orden reabierta: el mismo enlace revive")
URL3 = cli.post(f"/seguimiento-orden/{ID2}", headers=h(T)).json()["url"]
T3 = token_de(URL3)
cli.put(f"/servicios/{ID2}/etapa", headers=h(T), json={"etapa": "cerrado"})
check(pub.get(f"/seguimiento/{T3}").status_code == 410, "etapa «cerrado» también apaga el enlace")
cli.put(f"/servicios/{ID2}/etapa", headers=h(T), json={"etapa": "en_reparacion"})
check(pub.get(f"/seguimiento/{T3}").status_code == 200, "al volver a «en reparación» el enlace vuelve a servir")

print("9. Permisos")
check(cli.get(f"/seguimiento-orden/{ID2}").status_code in (401, 403), "sin sesión no se administra el enlace")

print(f"\n{ok_total} pruebas correctas, {len(fallas)} fallas")
if fallas:
    print("FALLAS:", *fallas, sep="\n  - ")
    sys.exit(1)
