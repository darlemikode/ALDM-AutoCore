"""
Diagnóstico por código de falla (OBD-II) para el asistente del taller.

Entrada: texto libre, p. ej. "Nissan Versa 2016 P0420". Se extrae el código y,
si hay ANTHROPIC_API_KEY, se consulta a Claude para una respuesta específica al
vehículo. Sin llave (o si falla) se responde con la tabla local de códigos
comunes: significado, causas probables y qué revisar, en orden.
"""
import base64
import json
import os
import re

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session
from pydantic import BaseModel

from .. import almacenamiento, models
from ..database import get_db
from ..rate_limit import limiter
from ..security import require_permission
from ..subida_archivos import leer_y_validar_imagen, nombre_unico

router = APIRouter(prefix="/api/asistente", tags=["asistente"])

RE_CODIGO = re.compile(r"\b([PBCU][0-9A-F]{4})\b", re.I)

# código: (significado, [causas en orden de probabilidad], [revisión sugerida])
TABLA = {
    "P0300": ("Falla de encendido aleatoria / múltiple", ["Bujías o bobinas desgastadas", "Fuga de vacío", "Inyectores sucios", "Baja compresión"], ["Cambiar/revisar bujías y bobinas", "Buscar fugas de vacío", "Revisar presión de combustible"]),
    "P0301": ("Falla de encendido cilindro 1", ["Bujía o bobina del cilindro 1", "Inyector del cilindro 1", "Compresión baja"], ["Intercambiar bobina con otro cilindro y ver si la falla se mueve", "Revisar bujía e inyector"]),
    "P0302": ("Falla de encendido cilindro 2", ["Bujía o bobina del cilindro 2", "Inyector del cilindro 2"], ["Intercambiar bobina con otro cilindro", "Revisar bujía e inyector"]),
    "P0303": ("Falla de encendido cilindro 3", ["Bujía o bobina del cilindro 3", "Inyector del cilindro 3"], ["Intercambiar bobina con otro cilindro", "Revisar bujía e inyector"]),
    "P0304": ("Falla de encendido cilindro 4", ["Bujía o bobina del cilindro 4", "Inyector del cilindro 4"], ["Intercambiar bobina con otro cilindro", "Revisar bujía e inyector"]),
    "P0171": ("Mezcla pobre (banco 1)", ["Fuga de vacío o de admisión", "Sensor MAF sucio", "Bomba/filtro de combustible débil", "Sensor O2"], ["Limpiar MAF", "Prueba de humo en admisión", "Medir presión de combustible"]),
    "P0172": ("Mezcla rica (banco 1)", ["Inyectores con goteo", "Sensor MAF defectuoso", "Regulador de presión", "Filtro de aire tapado"], ["Revisar filtro de aire", "Revisar MAF y presión de combustible"]),
    "P0174": ("Mezcla pobre (banco 2)", ["Fuga de vacío", "MAF sucio", "Presión de combustible baja"], ["Prueba de humo", "Limpiar MAF"]),
    "P0420": ("Eficiencia del catalizador baja (banco 1)", ["Catalizador degradado", "Sensor O2 trasero defectuoso", "Fuga en el escape", "Fallas de encendido previas"], ["Comparar señal de sensores O2 delantero/trasero", "Revisar fugas de escape antes de cambiar el catalizador"]),
    "P0430": ("Eficiencia del catalizador baja (banco 2)", ["Catalizador degradado", "Sensor O2 trasero", "Fuga en el escape"], ["Comparar sensores O2", "Revisar fugas de escape"]),
    "P0440": ("Falla en el sistema EVAP", ["Tapón de gasolina flojo o dañado", "Manguera EVAP rota", "Válvula de purga"], ["Revisar/cambiar tapón", "Inspeccionar mangueras y válvulas EVAP"]),
    "P0442": ("Fuga pequeña en el sistema EVAP", ["Tapón de gasolina", "Manguera o conexión EVAP", "Válvula de purga/ventilación"], ["Cambiar tapón y borrar código", "Prueba de humo EVAP"]),
    "P0455": ("Fuga grande en el sistema EVAP", ["Tapón de gasolina suelto/ausente", "Manguera desconectada", "Canister dañado"], ["Verificar tapón", "Inspeccionar mangueras"]),
    "P0128": ("Termostato / temperatura del motor por debajo de lo esperado", ["Termostato abierto", "Sensor ECT defectuoso", "Bajo nivel de refrigerante"], ["Revisar nivel de refrigerante", "Cambiar termostato"]),
    "P0113": ("Sensor de temperatura de aire de admisión (IAT) señal alta", ["Sensor IAT", "Conector o cableado abierto"], ["Revisar conector y cableado", "Probar/cambiar sensor"]),
    "P0101": ("Sensor MAF fuera de rango", ["MAF sucio", "Fuga de aire después del MAF", "Filtro de aire tapado"], ["Limpiar MAF con limpiador específico", "Revisar mangueras de admisión"]),
    "P0102": ("Sensor MAF señal baja", ["MAF defectuoso", "Cableado/conector"], ["Revisar conector", "Cambiar MAF"]),
    "P0113": ("Sensor IAT señal alta", ["Sensor IAT", "Cableado abierto"], ["Revisar conector", "Cambiar sensor"]),
    "P0121": ("Sensor de posición del acelerador (TPS) fuera de rango", ["Cuerpo de aceleración sucio", "Sensor TPS", "Cableado"], ["Limpiar cuerpo de aceleración", "Reaprender posición del acelerador"]),
    "P0131": ("Sensor O2 (banco 1, sensor 1) voltaje bajo", ["Sensor O2", "Fuga de escape", "Mezcla pobre"], ["Revisar fugas de escape", "Cambiar sensor O2"]),
    "P0135": ("Falla en calefactor del sensor O2 (B1S1)", ["Calefactor del sensor", "Fusible", "Cableado"], ["Revisar fusible y conector", "Cambiar sensor O2"]),
    "P0141": ("Falla en calefactor del sensor O2 (B1S2)", ["Calefactor del sensor", "Fusible", "Cableado"], ["Revisar fusible y conector", "Cambiar sensor O2"]),
    "P0335": ("Sensor de posición del cigüeñal (CKP) – falla del circuito", ["Sensor CKP", "Cableado/conector", "Rueda dentada"], ["Revisar conector", "Medir resistencia/señal del sensor"]),
    "P0340": ("Sensor de posición del árbol de levas (CMP) – falla del circuito", ["Sensor CMP", "Cableado", "Distribución desfasada"], ["Revisar conector", "Verificar sincronía de la distribución"]),
    "P0351": ("Falla en bobina de encendido A", ["Bobina", "Conector", "Módulo de encendido"], ["Cambiar/intercambiar bobina"]),
    "P0401": ("Flujo insuficiente de EGR", ["Válvula EGR carbonizada", "Conductos tapados", "Solenoide EGR"], ["Limpiar válvula y conductos EGR"]),
    "P0402": ("Flujo excesivo de EGR", ["Válvula EGR pegada abierta", "Sensor DPFE"], ["Limpiar/cambiar válvula EGR"]),
    "P0500": ("Falla del sensor de velocidad del vehículo (VSS)", ["Sensor VSS", "Cableado", "Tablero"], ["Revisar sensor y conector"]),
    "P0505": ("Falla del control de marcha mínima (ralentí)", ["Cuerpo de aceleración sucio", "Válvula IAC", "Fuga de vacío"], ["Limpiar cuerpo de aceleración", "Buscar fugas de vacío"]),
    "P0507": ("Ralentí más alto de lo esperado", ["Fuga de vacío", "Cuerpo de aceleración sucio", "Válvula IAC"], ["Buscar fugas de vacío", "Limpiar cuerpo de aceleración"]),
    "P0562": ("Voltaje del sistema bajo", ["Batería débil", "Alternador", "Conexiones flojas o sulfatadas"], ["Probar batería y alternador", "Limpiar bornes"]),
    "P0700": ("Falla en el sistema de control de transmisión", ["Falla guardada en el TCM", "Solenoides", "Nivel/estado del aceite ATF"], ["Leer códigos del módulo de transmisión", "Revisar nivel y condición del ATF"]),
    "P0715": ("Sensor de velocidad de entrada de la transmisión", ["Sensor de velocidad", "Cableado", "ATF contaminado"], ["Revisar conector y ATF"]),
    "P0741": ("Convertidor de par – embrague sin acople", ["Solenoide TCC", "ATF degradado", "Convertidor desgastado"], ["Revisar/cambiar ATF", "Probar solenoide TCC"]),
    "P2096": ("Sistema de mezcla post-catalizador pobre (banco 1)", ["Fuga de escape", "Sensor O2 trasero", "Mezcla pobre"], ["Revisar fugas de escape", "Revisar sensor O2 trasero"]),
    "P2195": ("Sensor O2 (B1S1) atorado en pobre", ["Sensor O2 envejecido", "Fuga de vacío"], ["Cambiar sensor O2", "Revisar fugas"]),
    "P0011": ("Sincronía del árbol de levas (admisión) adelantada", ["Aceite sucio o bajo", "Válvula VVT/OCV", "Cadena estirada"], ["Cambiar aceite y filtro", "Revisar/limpiar válvula VVT"]),
    "P0016": ("Correlación cigüeñal–árbol de levas", ["Cadena/banda de distribución estirada o saltada", "Sensores CKP/CMP"], ["Verificar marcas de distribución", "Revisar sensores"]),
    "P0087": ("Presión de riel de combustible demasiado baja", ["Filtro de combustible", "Bomba de combustible", "Regulador"], ["Medir presión", "Cambiar filtro"]),
}
from .codigos_extra import cargar as _extra
for _k, _v in _extra().items():
    TABLA.setdefault(_k, _v)

_FICHAS = []
try:
    with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), "datos_vehiculos.json"), encoding="utf-8") as _f:
        _FICHAS = json.load(_f)
except Exception:
    _FICHAS = []


def _ficha(mensaje: str) -> str:
    """Datos de ficha técnica oficial del modelo mencionado (si lo tenemos)."""
    m = mensaje.lower().replace("-", "").replace(" ", "")
    for f in _FICHAS:
        if f["modelo"].lower().replace("-", "").replace(" ", "") in m:
            etq = [("motor", "Motor"), ("aceite_l", "Aceite (L)"), ("tanque_l", "Tanque (L)"), ("neumaticos", "Neumáticos"), ("combustible", "Combustible")]
            lineas = [f"• {n}: {f[k]}" for k, n in etq if f.get(k)]
            return f"\n\nFicha oficial {f['marca']} {f['modelo']} {f['anio']}:\n" + "\n".join(lineas) + f"\nFuente: {f['fuente']}\n(Verifica siempre en el manual de tu versión.)"
    return ""


SIN_TABLA_PREFIJO = {"P": "motor / transmisión", "B": "carrocería (airbag, confort)", "C": "chasis (ABS, frenos, suspensión)", "U": "comunicación de red (CAN)"}


class DiagIn(BaseModel):
    mensaje: str


def _local(codigo: str, vehiculo: str) -> str:
    cab = f"{vehiculo}  ·  {codigo}" if vehiculo else codigo
    if codigo in TABLA:
        sig, causas, rev = TABLA[codigo]
        return (
            f"{cab}\n\nSignificado: {sig}.\n\nCausas probables (de más a menos común):\n"
            + "\n".join(f"{i}. {c}" for i, c in enumerate(causas, 1))
            + "\n\nQué revisar:\n" + "\n".join(f"• {r}" for r in rev)
            + "\n\nSugerencia: confirma con un escáner (datos en vivo) antes de cambiar piezas, y borra el código para ver si regresa."
        )
    area = SIN_TABLA_PREFIJO.get(codigo[0], "general")
    return (
        f"{cab}\n\nEl código {codigo} pertenece al sistema de {area}, pero no está en mi tabla local.\n\n"
        "Sugerencia: lee los datos congelados (freeze frame) con el escáner, revisa conectores y cableado del circuito indicado, "
        "y consulta el manual de servicio de la marca para ese código específico."
    )


def _con_claude(mensaje: str, codigo: str, vehiculo: str) -> str | None:
    llave = os.getenv("ANTHROPIC_API_KEY")
    if not llave:
        return None
    try:
        r = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": llave, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={
                "model": os.getenv("ASISTENTE_MODELO", "claude-sonnet-4-5"),
                "max_tokens": 700,
                "system": (
                    "Eres un asistente de diagnóstico para mecánicos en un taller de México. Responde en español, breve y práctico. "
                    "Formato: 1) Significado del código; 2) Causas probables en orden de probabilidad, específicas al vehículo si aplica; "
                    "3) Pasos de revisión; 4) Refacciones que podría necesitar. Si no estás seguro, dilo. Sin saludos."
                ),
                "messages": [{"role": "user", "content": mensaje}],
            },
            timeout=25,
        )
        r.raise_for_status()
        return "".join(b.get("text", "") for b in r.json().get("content", [])).strip() or None
    except Exception:
        return None


@router.post("/diagnostico")
def diagnostico(payload: DiagIn, user=Depends(require_permission("servicios.ver"))):
    m = payload.mensaje.strip()[:500]
    cod = RE_CODIGO.search(m)
    codigo = cod.group(1).upper() if cod else ""
    vehiculo = RE_CODIGO.sub("", m).strip(" ,-·")
    if not codigo:
        return {"texto": "Dime el vehículo y el código de falla, por ejemplo: Nissan Versa 2016 P0420."}
    return {"texto": (_con_claude(m, codigo, vehiculo) or _local(codigo, vehiculo)) + _ficha(m)}


# ---------------------------------------------------------------------------
# Manuales (PDF) e imágenes: el mecánico sube manuales de usuario/servicio y
# luego pregunta al asistente sobre ellos, o adjunta una foto (tablero, pieza,
# conector) para que la analice. Requiere ANTHROPIC_API_KEY.
# Los manuales se guardan en la tabla `fotos` con entidad_tipo="manual".
# ---------------------------------------------------------------------------
MAX_MANUAL_MB = 25
SYSTEM_MECANICO = (
    "Eres un asistente para mecánicos de un taller en México. Responde en español, directo y práctico, con pasos numerados "
    "y valores de torque/medidas solo si salen del manual adjunto o estás seguro. Si usas un manual, cita la página o sección. "
    "Si una imagen no es clara, dilo. No inventes datos."
)


def _manuales(db: Session):
    return db.query(models.Foto).filter(models.Foto.entidad_tipo == "manual").order_by(models.Foto.fecha.desc()).all()


@router.get("/manuales")
def listar_manuales(db: Session = Depends(get_db), user=Depends(require_permission("servicios.ver"))):
    return [{"id": m.id_foto, "titulo": m.descripcion or m.ruta_archivo, "fecha": m.fecha} for m in _manuales(db)]


@router.post("/manuales", status_code=201)
async def subir_manual(titulo: str = Form(...), archivo: UploadFile = File(...), db: Session = Depends(get_db), user=Depends(require_permission("configuracion.editar"))):
    if not user.tiene_permiso("servicios.editar"):
        raise HTTPException(status_code=403, detail="Tu rol no puede subir manuales.")
    if not (archivo.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="El manual debe ser un archivo PDF.")
    contenido = await archivo.read()
    if not contenido.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="El archivo no es un PDF válido.")
    if len(contenido) > MAX_MANUAL_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"El PDF pesa demasiado (máximo {MAX_MANUAL_MB} MB). Sube solo las secciones que necesites.")
    nombre = nombre_unico("manual", ".pdf")
    almacenamiento.guardar(nombre, contenido)
    m = models.Foto(entidad_tipo="manual", entidad_id=0, ruta_archivo=nombre, descripcion=titulo.strip()[:200], subida_por=user.username)
    db.add(m)
    db.commit()
    db.refresh(m)
    return {"id": m.id_foto, "titulo": m.descripcion}


@router.delete("/manuales/{id_manual}", status_code=204)
def borrar_manual(id_manual: int, db: Session = Depends(get_db), user=Depends(require_permission("configuracion.editar"))):
    if not user.tiene_permiso("servicios.editar"):
        raise HTTPException(status_code=403, detail="Tu rol no puede borrar manuales.")
    m = db.query(models.Foto).filter(models.Foto.id_foto == id_manual, models.Foto.entidad_tipo == "manual").first()
    if not m:
        raise HTTPException(status_code=404, detail="Manual no encontrado.")
    almacenamiento.borrar(m.ruta_archivo)
    db.delete(m)
    db.commit()


@router.post("/consulta")
@limiter.limit("20/minute")  # cada consulta gasta la llave de Anthropic
async def consulta(
    request: Request,
    mensaje: str = Form(""),
    id_manual: int | None = Form(None),
    imagenes: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    user=Depends(require_permission("servicios.ver")),
):
    mensaje = mensaje.strip()[:1500]
    bloques = []
    for img in imagenes[:4]:
        datos, ext = await leer_y_validar_imagen(img)
        tipo = {".png": "image/png", ".webp": "image/webp", ".gif": "image/gif"}.get(ext, "image/jpeg")
        bloques.append({"type": "image", "source": {"type": "base64", "media_type": tipo, "data": base64.b64encode(datos).decode()}})
    titulo_manual = None
    if id_manual:
        m = db.query(models.Foto).filter(models.Foto.id_foto == id_manual, models.Foto.entidad_tipo == "manual").first()
        pdf = almacenamiento.leer(m.ruta_archivo) if m else None
        if not pdf:
            raise HTTPException(status_code=404, detail="No encontré ese manual.")
        titulo_manual = m.descripcion
        bloques.append({"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": base64.b64encode(pdf).decode()}})

    llave = os.getenv("ANTHROPIC_API_KEY")
    cod = RE_CODIGO.search(mensaje)
    if not llave:
        if cod and not bloques:
            return {"texto": _local(cod.group(1).upper(), RE_CODIGO.sub("", mensaje).strip(" ,-·")) + _ficha(mensaje)}
        fi = _ficha(mensaje)
        if fi:
            return {"texto": fi.strip()}
        return {"texto": "Para analizar imágenes o manuales hay que configurar ANTHROPIC_API_KEY en el servidor. Los códigos de falla y las fichas de los modelos precargados sí funcionan sin ella."}
    if not mensaje and not bloques:
        raise HTTPException(status_code=400, detail="Escribe tu pregunta o adjunta una imagen.")

    texto = mensaje or "Describe qué ves y qué debería revisar."
    fi = _ficha(mensaje)
    if fi:
        texto += "\n\nDatos de ficha oficial disponibles:" + fi
    if titulo_manual:
        texto = f"(Manual adjunto: {titulo_manual})\n{texto}"
    try:
        r = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": llave, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={
                "model": os.getenv("ASISTENTE_MODELO", "claude-sonnet-4-5"),
                "max_tokens": 1200,
                "system": SYSTEM_MECANICO,
                "messages": [{"role": "user", "content": bloques + [{"type": "text", "text": texto}]}],
            },
            timeout=90,
        )
        r.raise_for_status()
        out = "".join(b.get("text", "") for b in r.json().get("content", [])).strip()
    except Exception:
        out = ""
    if not out:
        if cod:
            return {"texto": _local(cod.group(1).upper(), RE_CODIGO.sub("", mensaje).strip(" ,-·")) + _ficha(mensaje)}
        return {"texto": "No pude consultar al asistente en este momento. Intenta de nuevo."}
    return {"texto": out}
