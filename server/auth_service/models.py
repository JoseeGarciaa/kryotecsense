from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from shared.database import Base

class Usuario(Base):
    """Modelo para la tabla de usuarios."""
    __tablename__ = "usuarios"
    # Aseguramos que el esquema sea correcto
    __table_args__ = {'schema': 'tenant_base'}

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(Text, nullable=False)
    correo = Column(Text, unique=True, nullable=False, index=True)
    telefono = Column(Text, nullable=True)
    password = Column(Text, nullable=False)  # Cambiado de 'contraseña' a 'password'
    rol = Column(Text, nullable=False)
    activo = Column(Boolean, default=True)
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())
    ultimo_ingreso = Column(DateTime(timezone=True), nullable=True)
    
    def __repr__(self):
        return f"<Usuario(id={self.id}, nombre='{self.nombre}', correo='{self.correo}', rol='{self.rol}')>"
