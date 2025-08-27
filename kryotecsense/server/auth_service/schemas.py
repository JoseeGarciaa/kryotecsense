from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime

class UsuarioBase(BaseModel):
    """Esquema base para usuarios."""
    nombre: str
    correo: str
    telefono: Optional[str] = None
    rol: str = "usuario"

class UsuarioCreate(UsuarioBase):
    """Esquema para crear usuarios."""
    password: str
    activo: bool = True

class UsuarioUpdate(BaseModel):
    """Esquema para actualizar usuarios."""
    nombre: Optional[str] = None
    correo: Optional[str] = None
    telefono: Optional[str] = None
    rol: Optional[str] = None
    activo: Optional[bool] = None

class UsuarioInDB(UsuarioBase):
    """Esquema para usuario en la base de datos."""
    id: int
    activo: bool
    fecha_creacion: datetime
    ultimo_ingreso: Optional[datetime] = None

    class Config:
        from_attributes = True

class UsuarioSchema(BaseModel):
    """Esquema para respuesta de usuario (compatible con frontend)."""
    id: int
    nombre: str
    correo: str
    telefono: Optional[str] = None
    rol: str
    activo: bool
    fecha_creacion: Optional[str] = None
    ultimo_ingreso: Optional[str] = None

class Usuario(UsuarioInDB):
    """Esquema para respuesta de usuario."""
    pass

class Token(BaseModel):
    """Esquema para token de acceso."""
    access_token: str
    token_type: str

class TokenData(BaseModel):
    """Esquema para datos del token."""
    usuario_id: Optional[int] = None
    correo: Optional[str] = None
    rol: Optional[str] = None

class LoginRequest(BaseModel):
    """Esquema para solicitud de inicio de sesión."""
    correo: str
    contrasena: str
