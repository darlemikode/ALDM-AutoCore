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

from .database import get_db, get_db_global
from .security import get_current_user, require_permission, require_superadmin


def make_crud_router(
    *,
    model,
    schema_out: Type,
    schema_in: Type,
    prefix: str,
    tags: list,
    id_field: str,
    permiso: str = "catalogos",  # prefijo del permiso para crear/editar/eliminar (p. ej. "inventario")
    validar=None,  # callable(db, data: dict, excluir_id|None) que lanza HTTPException si los datos no son válidos
    filtro_campo: str = None,  # ej. "id_marca" — si se pasa, admite ?<filtro_campo>=X para acotar el listado (catálogos hijos de otro, como modelos de una marca o subcategorías de una categoría)
    modo: str = "taller",  # "taller": CRUD normal por permisos · "lectura": los talleres solo leen (alta/edición/baja → 403) · "global": solo el súper admin, sobre el catálogo general (sin taller)
) -> APIRouter:
    router = APIRouter(prefix=prefix, tags=tags)
    MENSAJE_SOLO_ALDM = "El catálogo general lo administra ALDM. Si falta una marca, modelo u otro dato, pídelo a soporte."

    if modo == "global":
        # Catálogo general: sesión sin filtro de taller; los registros nuevos quedan sin taller (visibles para todos).
        @router.get("/", response_model=list[schema_out])
        def listar_g(request: Request, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
            query = db.query(model)
            if hasattr(model, "id_taller"):
                query = query.filter(model.id_taller.is_(None))
            if filtro_campo:
                valor = request.query_params.get(filtro_campo)
                if valor is not None:
                    query = query.filter(getattr(model, filtro_campo) == int(valor))
            return query.order_by(getattr(model, id_field)).all()

        @router.post("/", response_model=schema_out, status_code=201)
        def crear_g(payload: schema_in, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
            datos = payload.model_dump()
            if validar:
                validar(db, datos, None)
            item = model(**datos)
            db.add(item)
            db.commit()
            db.refresh(item)
            return item

        @router.put("/{item_id}", response_model=schema_out)
        def actualizar_g(item_id: int, payload: schema_in, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
            item = db.query(model).filter(getattr(model, id_field) == item_id).first()
            if not item:
                raise HTTPException(status_code=404, detail="No encontrado")
            datos = payload.model_dump()
            if validar:
                validar(db, datos, item_id)
            for key, value in datos.items():
                setattr(item, key, value)
            db.commit()
            db.refresh(item)
            return item

        @router.delete("/{item_id}", status_code=204)
        def eliminar_g(item_id: int, db: Session = Depends(get_db_global), user=Depends(require_superadmin)):
            item = db.query(model).filter(getattr(model, id_field) == item_id).first()
            if not item:
                raise HTTPException(status_code=404, detail="No encontrado")
            db.delete(item)
            db.commit()
            return None

        return router

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

    if modo == "lectura":
        @router.post("/", status_code=403)
        def crear_bloqueado(user=Depends(get_current_user)):
            raise HTTPException(status_code=403, detail=MENSAJE_SOLO_ALDM)

        @router.put("/{item_id}", status_code=403)
        def actualizar_bloqueado(item_id: int, user=Depends(get_current_user)):
            raise HTTPException(status_code=403, detail=MENSAJE_SOLO_ALDM)

        @router.delete("/{item_id}", status_code=403)
        def eliminar_bloqueado(item_id: int, user=Depends(get_current_user)):
            raise HTTPException(status_code=403, detail=MENSAJE_SOLO_ALDM)

        return router

    @router.post("/", response_model=schema_out, status_code=201)
    def crear(payload: schema_in, db: Session = Depends(get_db), user=Depends(require_permission(f"{permiso}.crear"))):
        datos = payload.model_dump()
        if validar:
            validar(db, datos, None)
        item = model(**datos)
        db.add(item)
        db.commit()
        db.refresh(item)
        return item

    @router.put("/{item_id}", response_model=schema_out)
    def actualizar(item_id: int, payload: schema_in, db: Session = Depends(get_db), user=Depends(require_permission(f"{permiso}.editar"))):
        item = db.query(model).filter(getattr(model, id_field) == item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="No encontrado")
        datos = payload.model_dump()
        if validar:
            validar(db, datos, item_id)
        for key, value in datos.items():
            setattr(item, key, value)
        db.commit()
        db.refresh(item)
        return item

    @router.delete("/{item_id}", status_code=204)
    def eliminar(item_id: int, db: Session = Depends(get_db), user=Depends(require_permission(f"{permiso}.eliminar"))):
        item = db.query(model).filter(getattr(model, id_field) == item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="No encontrado")
        db.delete(item)
        db.commit()
        return None

    return router
