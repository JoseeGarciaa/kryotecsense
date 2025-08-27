from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, ForeignKey, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from .database import Base

class Usuario(Base):
    """Modelo para la tabla de usuarios."""
    __tablename__ = "usuarios"
    __table_args__ = {'schema': 'tenant_brandon'}

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(Text, nullable=False)
    correo = Column(Text, unique=True, nullable=False, index=True)
    telefono = Column(Text, nullable=True)
    password = Column(Text, nullable=False)
    rol = Column(Text, nullable=False)
    activo = Column(Boolean, default=True)
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.timezone('UTC', func.now()))
    ultimo_ingreso = Column(DateTime(timezone=True), nullable=True)
    
    # Relaciones
    actividades = relationship("ActividadOperacion", back_populates="usuario")
    
    def __repr__(self):
        return f"<Usuario(id={self.id}, nombre='{self.nombre}', correo='{self.correo}', rol='{self.rol}')>"

class Modelo(Base):
    """Modelo para la tabla de modelos."""
    __tablename__ = 'modelos'
    __table_args__ = {'schema': 'tenant_brandon'}
    
    modelo_id = Column(Integer, primary_key=True, index=True)
    nombre_modelo = Column(String(100), unique=True, nullable=False)
    volumen_litros = Column(Float, nullable=True)
    descripcion = Column(Text, nullable=True)
    dim_ext_frente = Column(Integer, nullable=True)
    dim_ext_profundo = Column(Integer, nullable=True)
    dim_ext_alto = Column(Integer, nullable=True)
    dim_int_frente = Column(Integer, nullable=True)
    dim_int_profundo = Column(Integer, nullable=True)
    dim_int_alto = Column(Integer, nullable=True)
    tic_frente = Column(Integer, nullable=True)
    tic_alto = Column(Integer, nullable=True)
    peso_total_kg = Column(Float, nullable=True)
    tipo = Column(Text, nullable=True)
    
    # Relaciones
    inventarios = relationship("InventarioCredcube", back_populates="modelo")
    
    def __repr__(self):
        return f"<Modelo(modelo_id={self.modelo_id}, nombre='{self.nombre_modelo}')>"

class InventarioCredcube(Base):
    """Modelo para la tabla de inventario de credcubes."""
    __tablename__ = 'inventario_credocubes'
    __table_args__ = {'schema': 'tenant_brandon'}

    id = Column(Integer, primary_key=True, index=True)
    modelo_id = Column(Integer, ForeignKey("tenant_brandon.modelos.modelo_id"), nullable=False)
    nombre_unidad = Column(Text, nullable=False)
    rfid = Column(Text, nullable=False, unique=True)
    lote = Column(Text, nullable=True)
    estado = Column(Text, nullable=False)
    sub_estado = Column(Text, nullable=True)
    validacion_limpieza = Column(Text, nullable=True)
    validacion_goteo = Column(Text, nullable=True)
    validacion_desinfeccion = Column(Text, nullable=True)
    categoria = Column(Text, nullable=True)
    fecha_ingreso = Column(DateTime(timezone=True), server_default=func.timezone('UTC', func.now()))
    ultima_actualizacion = Column(DateTime(timezone=True), server_default=func.timezone('UTC', func.now()))
    fecha_vencimiento = Column(DateTime(timezone=True), server_default=func.timezone('UTC', func.now()))
    activo = Column(Boolean, default=True)
    
    # Relaciones
    modelo = relationship("Modelo", back_populates="inventarios")
    alertas = relationship("Alerta", back_populates="inventario")
    actividades = relationship("ActividadOperacion", back_populates="inventario")
    
    def __repr__(self):
        return f"<InventarioCredcube(id={self.id}, nombre='{self.nombre_unidad}', estado='{self.estado}')>"

class Alerta(Base):
    """Modelo para la tabla de alertas."""
    __tablename__ = "alertas"
    __table_args__ = {'schema': 'tenant_brandon'}
    
    id = Column(Integer, primary_key=True, index=True)
    inventario_id = Column(Integer, ForeignKey("tenant_brandon.inventario_credocubes.id"), nullable=True)
    tipo_alerta = Column(Text, nullable=False)
    descripcion = Column(Text, nullable=True)
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.timezone('UTC', func.now()))
    resuelta = Column(Boolean, default=False)
    fecha_resolucion = Column(DateTime(timezone=True), nullable=True)
    
    # Relaciones
    inventario = relationship("InventarioCredcube", back_populates="alertas")
    
    def __repr__(self):
        return f"<Alerta(id={self.id}, tipo='{self.tipo_alerta}', resuelta={self.resuelta})>"

class ActividadOperacion(Base):
    """Modelo para la tabla de actividades de operación."""
    __tablename__ = "actividades_operacion"
    __table_args__ = {'schema': 'tenant_brandon'}
    
    id = Column(Integer, primary_key=True, index=True)
    inventario_id = Column(Integer, ForeignKey("tenant_brandon.inventario_credocubes.id"), nullable=True)
    usuario_id = Column(Integer, ForeignKey("tenant_brandon.usuarios.id"), nullable=True)
    descripcion = Column(Text, nullable=False)
    estado_nuevo = Column(Text, nullable=False)
    sub_estado_nuevo = Column(Text, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.timezone('UTC', func.now()))
    
    # Relaciones
    inventario = relationship("InventarioCredcube", back_populates="actividades")
    usuario = relationship("Usuario", back_populates="actividades")
    
    def __repr__(self):
        return f"<ActividadOperacion(id={self.id}, inventario_id={self.inventario_id}, estado='{self.estado_nuevo}')>"
