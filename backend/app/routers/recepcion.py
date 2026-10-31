"""Recepción del vehículo (daños previos marcados en el auto) y avance por zonas de la orden.

· Daños: cada uno ligado a una pieza del auto (cofre, salpicadera, puerta…), con tipo, gravedad,
  comentario y fotos (tabla `fotos`, entidad "dano_recepcion"). Es el respaldo del taller de cómo
  llegó el auto y el cliente lo ve en su seguimiento.
· Avance: el taller marca las zonas del auto que ya atendió ("proceso" / "listo"). Se combina con el
  avance automático por etapa de la orden.
"""
import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import almacenamiento, models
from ..database import get_db
from ..security import get_current_user, require_permission

router = APIRouter(prefix="/api/recepcion", tags=["recepcion"])

PIEZAS = {
    "cofre": "Cofre", "defensa_del": "Defensa delantera", "faro_izq": "Faro delantero izquierdo", "faro_der": "Faro delantero derecho",
    "salp_del_izq": "Salpicadera delantera izquierda", "salp_del_der": "Salpicadera delantera derecha",
    "puerta_del_izq": "Puerta delantera izquierda", "puerta_del_der": "Puerta delantera derecha",
    "puerta_tra_izq": "Puerta trasera izquierda", "puerta_tra_der": "Puerta trasera derecha",
    "salp_tra_izq": "Salpicadera trasera izquierda", "salp_tra_der": "Salpicadera trasera derecha",
    "cajuela": "Cajuela", "defensa_tra": "Defensa trasera", "techo": "Techo", "parabrisas": "Parabrisas",
    "espejo_izq": "Espejo izquierdo", "espejo_der": "Espejo derecho",
    "llanta_del_izq": "Llanta delantera izquierda", "llanta_del_der": "Llanta delantera derecha",
    "llanta_tra_izq": "Llanta trasera izquierda", "llanta_tra_der": "Llanta trasera derecha",
}
TIPOS = {"rayon": "Rayón", "golpe": "Golpe", "abolladura": "Abolladura", "pintura": "Pintura dañada",
         "cristal": "Cristal estrellado o roto", "faltante": "Faltante", "otro": "Otro"}
GRAVEDADES = ("leve", "medio", "severo")
ZONAS_AVANCE = ("di", "dd", "ti", "td", "faros", "motor", "transmision", "espejos", "cabina", "cajuela", "escape", "luces_t")
ESTADOS_AVANCE = ("proceso", "listo")

# Avance automático del auto (0..1, de adelante hacia atrás) según la etapa de la orden
PROGRESO_ETAPA = {
    "en_proceso": 0.08, "abierto": 0.22, "pendiente": 0.22, "espera_refacciones": 0.4,
    "en_reparacion": 0.65, "garantia": 0.65, "listo_entrega": 1.0,
}


class DanoIn(BaseModel):
    pieza: str
    tipo: str = "otro"
    gravedad: str = "leve"
    comentario: Optional[str] = Field(default=None, max_length=255)


class AvanceIn(BaseModel):
    zonas: dict


def _servicio(db: Session, id_servicio: int) -> models.Servicio:
    s = db.query(models.Servicio).filter(models.Servicio.id_servicio == id_servicio).first()
    if not s:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    return s


def _validar(d: DanoIn) -> None:
    if d.pieza not in PIEZAS:
        raise HTTPException(status_code=400, detail="Pieza no válida")
    if d.tipo not in TIPOS:
        raise HTTPException(status_code=400, detail="Tipo de daño no válido")
    if d.gravedad not in GRAVEDADES:
        raise HTTPException(status_code=400, detail="Gravedad no válida")


def zonas_avance_de(s: models.Servicio) -> dict:
    try:
        datos = json.loads(s.avance_zonas) if s.avance_zonas else {}
    except ValueError:
        datos = {}
    return {z: e for z, e in datos.items() if z in ZONAS_AVANCE and e in ESTADOS_AVANCE} if isinstance(datos, dict) else {}


def fotos_de_danos(db: Session, ids: list) -> dict:
    if not ids:
        return {}
    res: dict = {}
    for f in (
        db.query(models.Foto)
        .filter(models.Foto.entidad_tipo == "dano_recepcion", models.Foto.entidad_id.in_(ids))
        .order_by(models.Foto.fecha.asc())
        .all()
    ):
        res.setdefault(f.entidad_id, []).append({"id_foto": f.id_foto, "url": f"/uploads/{f.ruta_archivo}"})
    return res


def _dano_out(d: models.DanoRecepcion, fotos: list) -> dict:
    return {
        "id_dano": d.id_dano, "pieza": d.pieza, "pieza_nombre": PIEZAS.get(d.pieza, d.pieza),
        "tipo": d.tipo, "tipo_nombre": TIPOS.get(d.tipo, d.tipo), "gravedad": d.gravedad,
        "comentario": d.comentario, "fecha": d.fecha.isoformat() if d.fecha else None,
        "registrado_por": d.registrado_por, "fotos": fotos,
    }


@router.get("/catalogos")
def catalogos(user=Depends(get_current_user)):
    return {
        "piezas": [{"clave": k, "nombre": v} for k, v in PIEZAS.items()],
        "tipos": [{"clave": k, "nombre": v} for k, v in TIPOS.items()],
        "gravedades": list(GRAVEDADES),
    }


@router.get("/{id_servicio}")
def obtener(id_servicio: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.ver"))):
    s = _servicio(db, id_servicio)
    danos = db.query(models.DanoRecepcion).filter(models.DanoRecepcion.id_servicio == id_servicio).order_by(models.DanoRecepcion.fecha).all()
    fotos = fotos_de_danos(db, [d.id_dano for d in danos])
    return {
        "danos": [_dano_out(d, fotos.get(d.id_dano, [])) for d in danos],
        "avance_zonas": zonas_avance_de(s),
        "etapa": s.etapa,
        "progreso_auto": PROGRESO_ETAPA.get(s.etapa, 0.0),
    }


@router.post("/{id_servicio}/danos", status_code=201)
def crear_dano(id_servicio: int, datos: DanoIn, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    _servicio(db, id_servicio)
    _validar(datos)
    d = models.DanoRecepcion(
        id_servicio=id_servicio, pieza=datos.pieza, tipo=datos.tipo, gravedad=datos.gravedad,
        comentario=(datos.comentario or "").strip() or None, fecha=datetime.utcnow(), registrado_por=user.username,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return _dano_out(d, [])


@router.put("/danos/{id_dano}")
def editar_dano(id_dano: int, datos: DanoIn, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    d = db.query(models.DanoRecepcion).filter(models.DanoRecepcion.id_dano == id_dano).first()
    if not d:
        raise HTTPException(status_code=404, detail="Daño no encontrado")
    _validar(datos)
    d.pieza, d.tipo, d.gravedad = datos.pieza, datos.tipo, datos.gravedad
    d.comentario = (datos.comentario or "").strip() or None
    db.commit()
    fotos = fotos_de_danos(db, [d.id_dano]).get(d.id_dano, [])
    return _dano_out(d, fotos)


@router.delete("/danos/{id_dano}", status_code=204)
def borrar_dano(id_dano: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    d = db.query(models.DanoRecepcion).filter(models.DanoRecepcion.id_dano == id_dano).first()
    if not d:
        raise HTTPException(status_code=404, detail="Daño no encontrado")
    for f in db.query(models.Foto).filter(models.Foto.entidad_tipo == "dano_recepcion", models.Foto.entidad_id == id_dano).all():
        almacenamiento.borrar(f.ruta_archivo)
        db.delete(f)
    db.delete(d)
    db.commit()
    return None


@router.put("/{id_servicio}/avance")
def guardar_avance(id_servicio: int, datos: AvanceIn, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    s = _servicio(db, id_servicio)
    limpio = {z: e for z, e in (datos.zonas or {}).items() if z in ZONAS_AVANCE and e in ESTADOS_AVANCE}
    s.avance_zonas = json.dumps(limpio) if limpio else None
    db.commit()
    return {"avance_zonas": limpio}


def recepcion_publica(db: Session, s: models.Servicio) -> dict:
    """Lo que ve el cliente en su seguimiento: daños con sus fotos y el avance del auto."""
    danos = db.query(models.DanoRecepcion).filter(models.DanoRecepcion.id_servicio == s.id_servicio).order_by(models.DanoRecepcion.fecha).all()
    fotos = fotos_de_danos(db, [d.id_dano for d in danos])
    return {
        "danos": [
            {"pieza": d.pieza, "pieza_nombre": PIEZAS.get(d.pieza, d.pieza), "tipo_nombre": TIPOS.get(d.tipo, d.tipo),
             "gravedad": d.gravedad, "comentario": d.comentario, "fotos": [f["url"] for f in fotos.get(d.id_dano, [])]}
            for d in danos
        ],
        "avance": {"progreso": PROGRESO_ETAPA.get(s.etapa, 0.0), "zonas": zonas_avance_de(s)},
    }
