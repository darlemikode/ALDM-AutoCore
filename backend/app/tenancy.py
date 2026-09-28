"""
Multi-taller en UNA sola base de datos.

Cada fila operativa (clientes, órdenes, inventario, nómina…) lleva
`id_taller`. En vez de agregar `.filter(id_taller == X)` a mano en cientos
de consultas (y arriesgarse a olvidar una), aquí se engancha SQLAlchemy
para que:

  1) Toda consulta ORM (SELECT, y UPDATE/DELETE masivos) sobre una tabla
     de taller se acote automáticamente al taller de la sesión.
  2) Todo registro nuevo de una tabla de taller reciba solo su `id_taller`.

Tipos de tabla:
  - TenantMixin: pertenece a UN taller (clientes, servicios, roles…).
  - CatalogoCompartidoMixin: catálogos con filas generales (id_taller NULL,
    las ve todo el mundo, nadie las edita desde un taller) + filas propias
    de cada taller (marcas, colores, tipos de servicio…).
  - Sin mixin: global (permisos, códigos postales, talleres, paquetes,
    usuarios…).

Modos de la sesión (session.info["tenant"]):
  ("taller", id)       → solo ve/crea datos de ese taller
  ("superadmin", None) → sin filtro (panel de súper administración)
  ("ninguno", None)    → no ve NINGUNA fila de taller (petición sin sesión
                          ni código de taller): falla cerrado, nunca abierto.
"""
from fastapi import HTTPException
from sqlalchemy import Column, ForeignKey, Integer, event, or_
from sqlalchemy.orm import Session, declared_attr, with_loader_criteria


class TenantMixin:
    @declared_attr
    def id_taller(cls):
        return Column(Integer, ForeignKey("talleres.id_taller"), nullable=True, index=True)


class CatalogoCompartidoMixin:
    @declared_attr
    def id_taller(cls):
        return Column(Integer, ForeignKey("talleres.id_taller"), nullable=True, index=True)


# El taller principal (el dueño de la instalación, ALDM) es quien
# administra el catálogo general; lo fija seed.run() al arrancar.
TALLER_PRINCIPAL: int | None = None

MODO_TALLER = "taller"
MODO_SUPERADMIN = "superadmin"
MODO_NINGUNO = "ninguno"


def fijar_tenant(db: Session, modo: str, id_taller: int | None = None):
    db.info["tenant"] = (modo, id_taller)


def tenant_de(db: Session):
    return db.info.get("tenant", (MODO_NINGUNO, None))


def taller_actual(db: Session) -> int | None:
    modo, tid = tenant_de(db)
    return tid if modo == MODO_TALLER else None


@event.listens_for(Session, "do_orm_execute")
def _acotar_consultas(estado):
    if not (estado.is_select or estado.is_update or estado.is_delete):
        return
    if estado.execution_options.get("sin_filtro_taller"):
        return
    modo, tid = tenant_de(estado.session)
    if modo == MODO_SUPERADMIN:
        return
    if modo == MODO_TALLER:
        estado.statement = estado.statement.options(
            with_loader_criteria(TenantMixin, lambda cls: cls.id_taller == tid, include_aliases=True),
            with_loader_criteria(
                CatalogoCompartidoMixin,
                lambda cls: or_(cls.id_taller == tid, cls.id_taller.is_(None)),
                include_aliases=True,
            ),
        )
    else:
        estado.statement = estado.statement.options(
            with_loader_criteria(TenantMixin, lambda cls: cls.id_taller == -1, include_aliases=True),
            with_loader_criteria(CatalogoCompartidoMixin, lambda cls: cls.id_taller.is_(None), include_aliases=True),
        )


@event.listens_for(Session, "before_flush")
def _asignar_taller(session, contexto, instancias):
    modo, tid = tenant_de(session)
    for obj in session.new:
        if isinstance(obj, TenantMixin) and obj.id_taller is None:
            if modo != MODO_TALLER:
                raise RuntimeError(f"{type(obj).__name__} sin taller: la sesión no tiene un taller activo")
            obj.id_taller = tid
        elif isinstance(obj, CatalogoCompartidoMixin) and obj.id_taller is None and modo == MODO_TALLER:
            obj.id_taller = tid
    if modo != MODO_TALLER:
        return
    for obj in list(session.dirty) + list(session.deleted):
        if isinstance(obj, CatalogoCompartidoMixin) and obj.id_taller is None and tid != TALLER_PRINCIPAL:
            if obj in session.deleted or session.is_modified(obj, include_collections=False):
                raise HTTPException(
                    status_code=403,
                    detail="Este elemento es del catálogo general y no se puede modificar ni eliminar. Agrega uno propio para tu taller.",
                )
        if isinstance(obj, TenantMixin) and obj.id_taller not in (None, tid):
            raise HTTPException(status_code=403, detail="Ese registro no pertenece a tu taller.")
