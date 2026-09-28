"""
Catálogo de empleados — solo lo administra el Dueño (permiso
`empleados.*`, que ningún otro rol tiene por defecto). Un empleado se
puede ligar a un servicio como responsable, y si además tiene una cuenta
de usuario ligada, puede entrar a ver su propio dashboard personal.
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user, require_permission

router = APIRouter(prefix="/api/empleados", tags=["empleados"])


@router.get("/", response_model=list[schemas.EmpleadoOut])
def listar(db: Session = Depends(get_db), user=Depends(require_permission("empleados.ver"))):
    return db.query(models.Empleado).order_by(models.Empleado.nombre).all()


@router.post("/", response_model=schemas.EmpleadoOut, status_code=201)
def crear(payload: schemas.EmpleadoIn, db: Session = Depends(get_db), user=Depends(require_permission("empleados.crear"))):
    empleado = models.Empleado(**payload.model_dump())
    db.add(empleado)
    db.commit()
    db.refresh(empleado)
    return empleado


@router.put("/{empleado_id}", response_model=schemas.EmpleadoOut)
def actualizar(empleado_id: int, payload: schemas.EmpleadoIn, db: Session = Depends(get_db), user=Depends(require_permission("empleados.editar"))):
    empleado = db.query(models.Empleado).filter(models.Empleado.id_empleado == empleado_id).first()
    if not empleado:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    for key, value in payload.model_dump().items():
        setattr(empleado, key, value)
    db.commit()
    db.refresh(empleado)
    return empleado


@router.delete("/{empleado_id}", status_code=204)
def eliminar(empleado_id: int, db: Session = Depends(get_db), user=Depends(require_permission("empleados.eliminar"))):
    empleado = db.query(models.Empleado).filter(models.Empleado.id_empleado == empleado_id).first()
    if not empleado:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    # Baja lógica: se desactiva en vez de borrar, para no perder el
    # historial de servicios donde ya quedó como responsable.
    empleado.activo = False
    db.commit()
    return None


@router.get("/mi-dashboard", response_model=schemas.DashboardEmpleadoOut)
def mi_dashboard(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """El dashboard personal — lo ve cualquier usuario del taller que esté
    ligado a un registro de empleado (sin importar su rol de sistema)."""
    empleado = db.query(models.Empleado).filter(models.Empleado.id_usuario == user.id_usuario).first()
    if not empleado:
        raise HTTPException(status_code=404, detail="Tu usuario no está ligado a ningún empleado del catálogo todavía. Pide al Dueño que te vincule.")

    servicios = db.query(models.Servicio).filter(models.Servicio.id_empleado_responsable == empleado.id_empleado).all()
    hace_30_dias = datetime.utcnow() - timedelta(days=30)

    recientes = sorted(servicios, key=lambda s: s.fecha_entrada_servicio, reverse=True)[:10]

    return schemas.DashboardEmpleadoOut(
        nombre_empleado=f"{empleado.nombre} {empleado.paterno or ''}".strip(),
        servicios_abiertos=sum(1 for s in servicios if s.status == "abierto"),
        servicios_cerrados_mes=sum(1 for s in servicios if s.status == "cerrado" and s.fecha_salida_servicio and s.fecha_salida_servicio >= hace_30_dias),
        servicios_totales=len(servicios),
        servicios_recientes=[
            {
                "id_servicio": s.id_servicio,
                "nombre_servicio": s.nombre_servicio,
                "status": s.status,
                "etapa": s.etapa,
                "fecha_entrada_servicio": s.fecha_entrada_servicio.isoformat(),
            }
            for s in recientes
        ],
    )
