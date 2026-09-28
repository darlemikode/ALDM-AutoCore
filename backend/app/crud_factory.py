"""
Fábrica de routers CRUD genéricos.

Todos los catálogos simples (países, estados, ciudades, colores, marcas,
tipos de servicio, etc.) siguen el mismo patrón: listar, obtener uno, crear,
actualizar, eliminar. En vez de repetir ese código 9 veces, se genera aquí
una sola vez por tabla. Los módulos con lógica propia (servicios, clientes
con validaciones extra, etc.) tienen su propio router hecho a mano.
"""
from typing import Type

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .database import get_db
from .security import get_current_user, require_permission


def make_crud_router(
    *,
    model,
    schema_out: Type,
    schema_in: Type,
    prefix: str,
    tags: list,
    id_field: str,
    filtro_campo: str = None,  # ej. "id_marca" — si se pasa, admite ?<filtro_campo>=X para acotar el listado (catálogos hijos de otro, como modelos de una marca o subcategorías de una categoría)
) -> APIRouter:
    router = APIRouter(prefix=prefix, tags=tags)

    @router.get("/", response_model=list[schema_out])
    def listar(request: Request, db: Session = Depends(get_db), user=Depends(get_current_user)):
        query = db.query(model)
        if filtro_campo:
            valor = request.query_params.get(filtro_campo)
            if valor is not None:
                query = query.filter(getattr(model, filtro_campo) == int(valor))
        return query.order_by(getattr(model, id_field)).all()

    @router.get("/{item_id}", response_model=schema_out)
    def obtener(item_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
        item = db.query(model).filter(getattr(model, id_field) == item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="No encontrado")
        return item

    @router.post("/", response_model=schema_out, status_code=201)
    def crear(payload: schema_in, db: Session = Depends(get_db), user=Depends(require_permission("catalogos.crear"))):
        item = model(**payload.model_dump())
        db.add(item)
        db.commit()
        db.refresh(item)
        return item

    @router.put("/{item_id}", response_model=schema_out)
    def actualizar(item_id: int, payload: schema_in, db: Session = Depends(get_db), user=Depends(require_permission("catalogos.editar"))):
        item = db.query(model).filter(getattr(model, id_field) == item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="No encontrado")
        for key, value in payload.model_dump().items():
            setattr(item, key, value)
        db.commit()
        db.refresh(item)
        return item

    @router.delete("/{item_id}", status_code=204)
    def eliminar(item_id: int, db: Session = Depends(get_db), user=Depends(require_permission("catalogos.eliminar"))):
        item = db.query(model).filter(getattr(model, id_field) == item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="No encontrado")
        db.delete(item)
        db.commit()
        return None

    return router
