import os
from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

# Por defecto usa SQLite: un solo archivo (sistema_mecanico.db), sin instalar
# ni levantar ningún servidor de base de datos. Si más adelante quieres usar
# PostgreSQL (recomendado para producción con varios usuarios a la vez),
# solo cambia DATABASE_URL en tu .env — ver .env.example.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./sistema_mecanico.db")

es_sqlite = DATABASE_URL.startswith("sqlite")

if es_sqlite:
    # SQLite necesita este flag para que FastAPI (que usa varios hilos) no
    # truene con "SQLite objects created in a thread...".
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # pool_pre_ping evita errores por conexiones caducadas (Postgres/SQL Server)
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db(request: Request = None):
    """Sesión acotada al taller de quien hace la petición (ver
    sesion_taller.py / tenancy.py)."""
    from .sesion_taller import preparar_sesion

    db = SessionLocal()
    try:
        preparar_sesion(db, request)
        yield db
    finally:
        db.close()


def get_db_global():
    """Sesión SIN filtro de taller — solo para la súper administración
    (sus endpoints además exigen es_superadmin)."""
    from .tenancy import MODO_SUPERADMIN, fijar_tenant

    db = SessionLocal()
    fijar_tenant(db, MODO_SUPERADMIN)
    try:
        yield db
    finally:
        db.close()


def sesion_global():
    """Para código fuera de una petición (arranque, tareas)."""
    from .tenancy import MODO_SUPERADMIN, fijar_tenant

    db = SessionLocal()
    fijar_tenant(db, MODO_SUPERADMIN)
    return db
