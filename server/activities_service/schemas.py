from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ActividadOperacionBase(BaseModel):
    """Esquema base para actividades de operación."""
    inventario_id: int
    usuario_id: Optional[int] = None  # Hacemos usuario_id opcional
    descripcion: str
    estado_nuevo: str
    sub_estado_nuevo: Optional[str] = None

class ActividadOperacionCreate(ActividadOperacionBase):
    """Esquema para crear actividades de operación."""
    pass

class ActividadOperacion(ActividadOperacionBase):
    """Esquema para respuesta de actividades de operación."""
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True
