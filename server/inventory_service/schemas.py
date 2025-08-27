from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
# InventarioCredcubeCreate for bulk creation
class InventarioCredcubeCreate(BaseModel):
    modelo_id: int
    nombre_unidad: str
    rfid: str
    lote: Optional[str] = None
    estado: str
    sub_estado: Optional[str] = None
    validacion_limpieza: Optional[str] = None
    validacion_goteo: Optional[str] = None
    validacion_desinfeccion: Optional[str] = None
    categoria: Optional[str] = None
# --- Bulk Inventory Creation Schemas ---
class BulkInventarioCreateRequest(BaseModel):
    items: List[InventarioCredcubeCreate]

class BulkInventarioCreateResponse(BaseModel):
    success: int
    errors: List[str]
    total: int

class InventarioCredcubeBase(BaseModel):
    """Esquema base para inventario de credcubes."""
    modelo_id: int
    nombre_unidad: str
    rfid_padre: str
    rfid_hijo_1: Optional[str] = None
    rfid_hijo_2: Optional[str] = None
    rfid_hijo_3: Optional[str] = None
    rfid_hijo_4: Optional[str] = None
    rfid_hijo_5: Optional[str] = None
    rfid_hijo_6: Optional[str] = None
    rfid_hijo_7: Optional[str] = None
    estado: str
    sub_estado: Optional[str] = None
    validacion_limpieza: Optional[str] = None
    validacion_goteo: Optional[str] = None
    validacion_desinfeccion: Optional[str] = None


class InventarioCredcubeUpdate(BaseModel):
    """Esquema para actualizar inventario de credcubes."""
    modelo_id: Optional[int] = None
    nombre_unidad: Optional[str] = None
    rfid_padre: Optional[str] = None
    rfid_hijo_1: Optional[str] = None
    rfid_hijo_2: Optional[str] = None
    rfid_hijo_3: Optional[str] = None
    rfid_hijo_4: Optional[str] = None
    rfid_hijo_5: Optional[str] = None
    rfid_hijo_6: Optional[str] = None
    rfid_hijo_7: Optional[str] = None
    estado: Optional[str] = None
    sub_estado: Optional[str] = None
    validacion_limpieza: Optional[str] = None
    validacion_goteo: Optional[str] = None
    validacion_desinfeccion: Optional[str] = None
    activo: Optional[bool] = None

class InventarioCredcube(InventarioCredcubeBase):
    """Esquema para respuesta de inventario de credcubes."""
    id: int
    fecha_ingreso: Optional[datetime] = None
    ultima_actualizacion: datetime
    activo: bool

    class Config:
        from_attributes = True
