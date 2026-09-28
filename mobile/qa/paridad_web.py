"""Paridad de campos web -> mobile.
Toma cada campo de formulario de las páginas del panel web (name: "campo" en
FormModal / fields) y verifica que la pantalla equivalente de la app del taller
lo maneje (el nombre del campo aparece en su código). Uso: python qa/paridad_web.py"""
import re, os, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
WEB = os.path.join(RAIZ, "web-admin", "src", "pages")
MOB = os.path.join(RAIZ, "mobile", "src", "screens")
MAPA = {
    "../components/ClienteFormModal.jsx": ["ClienteFormScreen.js"],
    "Clientes.jsx": ["ClienteFormScreen.js", "ClientesScreen.js", "ClienteDetalleScreen.js"],
    "Vehiculos.jsx": ["VehiculoFormScreen.js", "VehiculosScreen.js"],
    "Servicios.jsx": ["NuevaOrdenScreen.js", "ServiciosScreen.js"],
    "ServicioDetalle.jsx": ["ServicioDetalleScreen.js"],
    "Refacciones.jsx": ["RefaccionesScreen.js"],
    "Inventario.jsx": ["InventarioDetalleScreen.js", "InventarioListaScreen.js"],
    "Herramientas.jsx": ["HerramientasScreen.js"],
    "Proveedores.jsx": ["ProveedoresScreen.js", "ProveedorDetalleScreen.js"],
    "ProveedorDetalle.jsx": ["ProveedorDetalleScreen.js"],
    "Empleados.jsx": ["EmpleadosScreen.js"],
    "Usuarios.jsx": ["UsuariosScreen.js"],
    "Promociones.jsx": ["PromocionesScreen.js"],
    "Comisiones.jsx": ["ComisionesScreen.js"],
    "ConfiguracionTaller.jsx": ["DatosTallerScreen.js"],
    "Citas.jsx": ["CitasScreen.js"],
    "Catalogos.jsx": ["CatalogosScreen.js"],
}
SIN_PANTALLA = ["Cotizaciones.jsx", "CotizacionDetalle.jsx", "Facturacion.jsx", "Sincronizacion.jsx", "AsignacionRoles.jsx", "SuperAdmin.jsx", "ConfiguracionInicio.jsx"]
IGNORAR = {"fotos_temp"}  # se revisan aparte (flujo de fotos propio de mobile)
# Mismo dato con otro nombre de variable en mobile
ALIAS = {
    "anticipo_tipo_pago": "anticipoTipo", "anticipo_monto": "anticipoMonto",
    "anticipo_efectivo": "anticipoEfectivo", "anticipo_tarjeta": "anticipoTarjeta",
    "estado_texto": "setEstado", "ciudad_cliente": "setMunicipio",  # mobile resuelve estado/ciudad a id igual que la web
}
PATRONES = [r'name:\s*"([a-z_0-9]+)"', r'update\("([a-z_0-9]+)"', r'\.\.\.data,\s*([a-z_0-9]+):', r'values\.([a-z_0-9]+)\b']
NO_CAMPOS = {"id", "length", "map", "filter", "tipo_pago"}

total, faltantes = 0, {}
for web, moviles in MAPA.items():
    ruta = os.path.join(WEB, web)
    if not os.path.exists(ruta): continue
    texto = open(ruta, encoding="utf-8").read()
    campos = sorted(set(c for p in PATRONES for c in re.findall(p, texto)) - IGNORAR - NO_CAMPOS)
    codigo = "".join(open(os.path.join(MOB, m), encoding="utf-8").read() for m in moviles if os.path.exists(os.path.join(MOB, m)))
    falta = [c for c in campos if c not in codigo and ALIAS.get(c, "\0") not in codigo]
    total += len(campos)
    if falta: faltantes[web] = falta
    print(f"{'✓' if not falta else '✗'} {web:<26} {len(campos) - len(falta):>3}/{len(campos):<3} -> {', '.join(moviles)}")
print("\nCampos de la web que la app todavía no maneja:")
for w, f in faltantes.items(): print(f"  {w}: {', '.join(f)}")
print("\nPáginas web sin pantalla en la app del taller:", ", ".join(p for p in SIN_PANTALLA if os.path.exists(os.path.join(WEB, p))))
n = sum(len(v) for v in faltantes.values())
print(f"\nParidad: {total - n}/{total} campos")
sys.exit(1 if n else 0)
