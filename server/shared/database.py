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
if not DATABASE_URL:
    # Validar que existan las variables mínimas
    missing = [
        name for name, val in (
            ("DB_HOST", DB_HOST),
            ("DB_PORT", DB_PORT),
            ("DB_USER", DB_USER),
            ("DB_PASSWORD", DB_PASSWORD),
            ("DB_NAME", DB_NAME),
        ) if not val
    ]
    if missing:
        raise RuntimeError(f"Faltan variables de entorno para DB: {', '.join(missing)}")
    DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# Soporte opcional de SSL: DB_SSLMODE=require|prefer|disable
sslmode = os.getenv("DB_SSLMODE")
if sslmode and "sslmode=" not in DATABASE_URL:
    sep = "&" if "?" in DATABASE_URL else "?"
    DATABASE_URL = f"{DATABASE_URL}{sep}sslmode={sslmode}"

# Crear motor de base de datos
engine = create_engine(DATABASE_URL)

# Crear sesión
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Crear base para modelos
Base = declarative_base()

# Función para obtener la sesión de base de datos
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
