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

# Crear una nueva actividad
@app.post("/actividades/", response_model=ActividadOperacionSchema, status_code=status.HTTP_201_CREATED)
def create_actividad(actividad: ActividadOperacionCreate, db: Session = Depends(get_db)):
    """Crear una nueva actividad de operación.
    
    Nota: La actualización del estado del inventario se maneja desde el frontend
    o mediante un proceso separado para evitar dependencias cíclicas entre servicios.
    """
    try:
        # Crear la actividad directamente
        db_actividad = ActividadOperacion(**actividad.model_dump())
        db.add(db_actividad)
        db.commit()
        db.refresh(db_actividad)
        
        return db_actividad
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al crear la actividad: {str(e)}"
        )

# Endpoint para verificar salud del servicio
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "activities_service"}
