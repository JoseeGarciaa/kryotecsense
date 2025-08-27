from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os

# Cargar variables de entorno (si existe .env local)
load_dotenv()

# Configuración de la base de datos
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT") or "5432"
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")

# Permitir pasar DATABASE_URL directamente (tiene prioridad)
DATABASE_URL = os.getenv("DATABASE_URL")

# Soporte opcional de SSL: DB_SSLMODE=require|prefer|disable (se aplicará al crear el engine)
sslmode = os.getenv("DB_SSLMODE")

# Engine/Session se crean en demanda para evitar fallos en import si faltan variables
engine = None
SessionLocal = None

def _build_database_url() -> str:
    """Construye DATABASE_URL desde variables separadas si no existe una directa."""
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        return db_url
    host = os.getenv("DB_HOST") or DB_HOST
    port = os.getenv("DB_PORT") or DB_PORT or "5432"
    user = os.getenv("DB_USER") or DB_USER
    password = os.getenv("DB_PASSWORD") or DB_PASSWORD
    name = os.getenv("DB_NAME") or DB_NAME
    missing = [
        name for name, val in (
            ("DB_HOST", host),
            ("DB_USER", user),
            ("DB_PASSWORD", password),
            ("DB_NAME", name),
        ) if not val
    ]
    if missing:
        return None
    return f"postgresql://{user}:{password}@{host}:{port}/{name}"

def get_engine():
    """Devuelve un engine de SQLAlchemy, creándolo si es necesario."""
    global engine, SessionLocal
    if engine is not None:
        return engine
    db_url = _build_database_url()
    if not db_url:
        # No lanzar error en import; lanzar solo cuando se intente usar la DB
        raise RuntimeError("Variables de entorno de DB no configuradas (DATABASE_URL o DB_HOST/USER/PASSWORD/NAME)")
    # Agregar sslmode si procede
    sm = os.getenv("DB_SSLMODE") or sslmode
    if sm and "sslmode=" not in db_url:
        sep = "&" if "?" in db_url else "?"
        db_url = f"{db_url}{sep}sslmode={sm}"
    engine = create_engine(db_url)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return engine

# Crear base para modelos
Base = declarative_base()

# Función para obtener la sesión de base de datos
def get_db():
    # Asegurar que el engine/sesión estén inicializados
    eng = get_engine()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
