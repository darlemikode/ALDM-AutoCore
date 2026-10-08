from ..busqueda import coincide
import os
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user, require_permission, generar_codigo_invitacion, verify_password, hash_password, generar_password_temporal
from datetime import datetime

router = APIRouter(prefix="/api/clientes", tags=["clientes"])


@router.get("/", response_model=list[schemas.ClienteOut])
def listar(
    q: Optional[str] = None,
    solo_activos: bool = False,
    db: Session = Depends(get_db),
    user=Depends(require_permission("clientes.ver")),
):
    query = db.query(models.Cliente)
    if solo_activos:
        query = query.filter(models.Cliente.status_cliente == 1)
    lista = query.order_by(models.Cliente.nombre_cliente).all()
    if q:
        lista = [c for c in lista if coincide(q, c.nombre_cliente, c.paterno_cliente, c.materno_cliente, c.empresa_cliente,
                                              c.telefono1, c.correo_cliente, c.numero_cuenta,
                                              f"{c.nombre_cliente or ''} {c.paterno_cliente or ''} {c.materno_cliente or ''}")]
    return lista


@router.get("/{cliente_id}", response_model=schemas.ClienteOut)
def obtener(cliente_id: int, db: Session = Depends(get_db), user=Depends(require_permission("clientes.ver"))):
    cliente = db.query(models.Cliente).filter(models.Cliente.id_cliente == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return cliente


@router.get("/{cliente_id}/vehiculos", response_model=list[schemas.VehiculoOut])
def vehiculos_del_cliente(cliente_id: int, db: Session = Depends(get_db), user=Depends(require_permission("clientes.ver"))):
    return db.query(models.Vehiculo).filter(models.Vehiculo.id_cliente == cliente_id).all()


def _verificar_password_admin_cambiada(db: Session):
    """Bloquea el alta de clientes mientras el admin siga con la contraseña
    por defecto (la que trae la instalación recién sembrada) — evita que el
    taller opere con datos de clientes reales sobre una cuenta admin insegura."""
    admin_username = os.getenv("ADMIN_USERNAME", "admin")
    admin_password_defecto = os.getenv("ADMIN_PASSWORD", "admin1234")
    admin = db.query(models.Usuario).filter(models.Usuario.username == admin_username).first()
    if admin and verify_password(admin_password_defecto, admin.hashed_password):
        raise HTTPException(
            status_code=403,
            detail="Antes de agregar clientes, cambia la contraseña del usuario admin (sigue siendo la de fábrica).",
        )


@router.post("/", response_model=schemas.ClienteOut, status_code=201)
def crear(payload: schemas.ClienteIn, db: Session = Depends(get_db), user=Depends(require_permission("clientes.crear"))):
    _verificar_password_admin_cambiada(db)
    # La cuenta única se arma a partir del id definitivo del cliente (CTE-000001),
    # así que se inserta primero con un valor temporal único y se corrige
    # dentro de la misma transacción antes de confirmar.
    cliente = models.Cliente(numero_cuenta=f"TMP-{uuid.uuid4().hex[:12]}", **payload.model_dump())
    db.add(cliente)
    db.flush()
    cliente.numero_cuenta = f"CTE-{cliente.id_cliente:06d}"
    db.commit()
    db.refresh(cliente)
    return cliente


@router.put("/{cliente_id}", response_model=schemas.ClienteOut)
def actualizar(cliente_id: int, payload: schemas.ClienteIn, db: Session = Depends(get_db), user=Depends(require_permission("clientes.editar"))):
    cliente = db.query(models.Cliente).filter(models.Cliente.id_cliente == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    for key, value in payload.model_dump().items():
        setattr(cliente, key, value)
    db.commit()
    db.refresh(cliente)
    return cliente


@router.delete("/{cliente_id}", status_code=204)
def eliminar(cliente_id: int, db: Session = Depends(get_db), user=Depends(require_permission("clientes.eliminar"))):
    cliente = db.query(models.Cliente).filter(models.Cliente.id_cliente == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    # Baja lógica en vez de borrar, para no perder historial de servicios
    # ni invalidar la cuenta única (numero_cuenta) que pudiera estar citada
    # en recibos ya entregados.
    cliente.status_cliente = 0
    db.commit()
    return None


@router.post("/{cliente_id}/invitar", response_model=schemas.InvitacionOut)
def invitar_a_app(cliente_id: int, db: Session = Depends(get_db), user=Depends(require_permission("clientes.editar"))):
    """Genera (o regenera) el código de invitación para que el cliente
    active su cuenta en la app de clientes. El taller se lo comunica por
    su cuenta (llamada, WhatsApp) — no hay envío automático de SMS."""
    cliente = db.query(models.Cliente).filter(models.Cliente.id_cliente == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if not cliente.telefono1 and not cliente.correo_cliente:
        raise HTTPException(status_code=400, detail="El cliente necesita al menos un teléfono o correo registrado para poder activar su cuenta.")

    cliente.codigo_invitacion = generar_codigo_invitacion()
    cliente.fecha_invitacion = datetime.utcnow()
    cliente.cuenta_activada = False  # si ya tenía cuenta, un nuevo código la reinicia
    db.commit()
    return schemas.InvitacionOut(codigo_invitacion=cliente.codigo_invitacion, telefono1=cliente.telefono1, correo_cliente=cliente.correo_cliente)


@router.post("/{cliente_id}/generar-acceso", response_model=schemas.AccesoClienteOut)
def generar_acceso_directo(cliente_id: int, db: Session = Depends(get_db), user=Depends(require_permission("clientes.editar"))):
    """Alternativa a la invitación por código: el taller le da al cliente un
    usuario (su teléfono o correo, como está registrado) y una contraseña
    temporal, y el cliente ya puede entrar de una vez a la app — conviene
    cuando el taller mismo lo está dando de alta en persona."""
    cliente = db.query(models.Cliente).filter(models.Cliente.id_cliente == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    identificador = cliente.telefono1 or cliente.correo_cliente
    if not identificador:
        raise HTTPException(status_code=400, detail="El cliente necesita al menos un teléfono o correo registrado para poder entrar a la app.")

    password_temporal = generar_password_temporal()
    cliente.hashed_password = hash_password(password_temporal)
    cliente.cuenta_activada = True
    cliente.codigo_invitacion = None
    db.commit()
    return schemas.AccesoClienteOut(identificador=identificador, password_temporal=password_temporal)
