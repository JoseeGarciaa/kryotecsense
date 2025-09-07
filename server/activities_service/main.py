from fastapi import FastAPI, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from shared.database import get_db
from shared.models import ActividadOperacion
from .schemas import ActividadOperacionCreate, ActividadOperacion as ActividadOperacionSchema

# Crear aplicación FastAPI
app = FastAPI(
    title="Servicio de Actividades - KryoTecSense",
    description="Microservicio para el registro y trazabilidad de actividades de operación",
    version="1.0.0"
)

# --- Endpoints para Actividades de Operación ---

# Obtener todas las actividades
@app.get("/actividades/", response_model=List[ActividadOperacionSchema])
def get_actividades(inventario_id: Optional[int] = None, usuario_id: Optional[int] = None, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    query = db.query(ActividadOperacion)
    
    if inventario_id is not None:
        query = query.filter(ActividadOperacion.inventario_id == inventario_id)
        
    if usuario_id is not None:
        query = query.filter(ActividadOperacion.usuario_id == usuario_id)
        
    actividades = query.order_by(ActividadOperacion.timestamp.desc()).offset(skip).limit(limit).all()
    return actividades

import traceback
import logging

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Crear una nueva actividad
@app.post("/actividades/", response_model=ActividadOperacionSchema, status_code=status.HTTP_201_CREATED)
def create_actividad(actividad: ActividadOperacionCreate, db: Session = Depends(get_db)):
    """Crear una nueva actividad de operación.
    
    Nota: La actualización del estado del inventario se maneja desde el frontend
    o mediante un proceso separado para evitar dependencias cíclicas entre servicios.
    """
    try:
        # Validar que el inventario_id existe si se proporciona
        if actividad.inventario_id:
            from shared.models import InventarioCredcube
            inventario = db.query(InventarioCredcube).filter(InventarioCredcube.id == actividad.inventario_id).first()
            if not inventario:
                logger.error(f"Error: No se encontró inventario con ID {actividad.inventario_id}")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No se encontró inventario con ID {actividad.inventario_id}"
                )
                
            # Verificar si ya existe una actividad para este inventario_id con estado_nuevo=Pre acondicionamiento
            if actividad.estado_nuevo == "Pre acondicionamiento":
                actividad_existente = db.query(ActividadOperacion).filter(
                    ActividadOperacion.inventario_id == actividad.inventario_id,
                    ActividadOperacion.estado_nuevo == "Pre acondicionamiento"
                ).first()
                
                if actividad_existente:
                    logger.warning(f"Ya existe una actividad para el inventario_id {actividad.inventario_id} con estado Pre acondicionamiento")
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"Ya existe una actividad para este TIC en estado Pre acondicionamiento. No se permiten duplicados."
                    )
        
        # Validar que el usuario_id existe si se proporciona
        if actividad.usuario_id:
            from shared.models import Usuario
            usuario = db.query(Usuario).filter(Usuario.id == actividad.usuario_id).first()
            if not usuario:
                logger.error(f"Error: No se encontró usuario con ID {actividad.usuario_id}")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No se encontró usuario con ID {actividad.usuario_id}"
                )
        
        # Registrar los datos que se van a insertar
        logger.info(f"Intentando crear actividad con datos: {actividad.model_dump()}")
        
        # Crear la actividad directamente
        db_actividad = ActividadOperacion(**actividad.model_dump())
        db.add(db_actividad)
        db.commit()
        db.refresh(db_actividad)
        
        logger.info(f"Actividad creada exitosamente con ID: {db_actividad.id}")
        return db_actividad
        
    except Exception as e:
        db.rollback()
        error_msg = str(e)
        stack_trace = traceback.format_exc()
        logger.error(f"Error al crear actividad: {error_msg}")
        logger.error(f"Stack trace: {stack_trace}")
        
        # Proporcionar un mensaje de error más detallado
        if "ForeignKeyViolation" in error_msg:
            if "inventario_id" in error_msg:
                detail = f"Error de clave foránea: El inventario_id {actividad.inventario_id} no existe en la base de datos"
            elif "usuario_id" in error_msg:
                detail = f"Error de clave foránea: El usuario_id {actividad.usuario_id} no existe en la base de datos"
            else:
                detail = f"Error de clave foránea: {error_msg}"
        else:
            detail = f"Error al crear la actividad: {error_msg}"
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=detail
        )

# Endpoint para verificar salud del servicio
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "activities_service"}


if __name__ == "__main__":
    import uvicorn
    import os
    
    port = int(os.environ.get("PORT", 8003))
    uvicorn.run(app, host="0.0.0.0", port=port)
