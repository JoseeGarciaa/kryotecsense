from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class AlertaBase(BaseModel):
    """Esquema base para alertas."""
    inventario_id: Optional[int] = None
    tipo_alerta: str
    descripcion: str

class AlertaCreate(AlertaBase):
    """Esquema para crear alertas."""
    pass

class AlertaUpdate(BaseModel):
    """Esquema para actualizar alertas."""
    resuelta: Optional[bool] = None
    descripcion: Optional[str] = None

class Alerta(AlertaBase):
    """Esquema para respuesta de alertas."""
    id: int
    fecha_creacion: datetime
    resuelta: bool
    fecha_resolucion: Optional[datetime] = None

    class Config:
        from_attributes = True
