from fastapi import FastAPI, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel
import asyncio
from concurrent.futures import ThreadPoolExecutor
import requests

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from shared.database import get_db
from shared.utils import get_current_user_from_token
from inventory_service.bulk_operations import BulkOperations, AsyncBulkOperations, optimize_database_connection
from inventory_service.schemas import BulkInventarioCreateRequest, BulkInventarioCreateResponse

# Crear aplicación FastAPI
app = FastAPI(
    title="Servicio de Inventario - KryoTecSense",
    description="Microservicio para gestión del inventario de credcubes",
    version="1.0.0"
)

# Schemas para la API
class ModeloResponse(BaseModel):
    modelo_id: int
    nombre_modelo: str
    volumen_litros: Optional[float] = None
    descripcion: Optional[str] = None
    dim_ext_frente: Optional[int] = None
    dim_ext_profundo: Optional[int] = None
    dim_ext_alto: Optional[int] = None
    dim_int_frente: Optional[int] = None
    dim_int_profundo: Optional[int] = None
    dim_int_alto: Optional[int] = None
    tic_frente: Optional[int] = None
    tic_alto: Optional[int] = None
    peso_total_kg: Optional[float] = None
    tipo: Optional[str] = None

class InventarioResponse(BaseModel):
    id: int
    modelo_id: int
    nombre_modelo: Optional[str] = None  # Nombre del modelo desde JOIN
    nombre_unidad: str
    rfid: str
    lote: Optional[str] = None
    estado: str
    sub_estado: Optional[str] = None
    validacion_limpieza: Optional[str] = None
    validacion_goteo: Optional[str] = None
    validacion_desinfeccion: Optional[str] = None
    categoria: Optional[str] = None
    fecha_ingreso: Optional[datetime] = None
    ultima_actualizacion: Optional[datetime] = None
    fecha_vencimiento: Optional[datetime] = None
    activo: Optional[bool] = True

class InventarioCreate(BaseModel):
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

# Schemas para operaciones en lote
class BulkStateUpdate(BaseModel):
    id: int
    estado: Optional[str] = None
    sub_estado: Optional[str] = None

class BulkUpdateRequest(BaseModel):
    updates: List[BulkStateUpdate]

class BulkUpdateResponse(BaseModel):
    success: int
    errors: List[str]
    total: int

class ActivityCreate(BaseModel):
    inventario_id: Optional[int] = None
    usuario_id: int = 1
    descripcion: str
    estado_nuevo: str
    sub_estado_nuevo: Optional[str] = None

class BulkActivityRequest(BaseModel):
    activities: List[ActivityCreate]

# Schema para cambio de estado simple
class EstadoUpdate(BaseModel):
    estado: str
    sub_estado: Optional[str] = None

# Dashboard schemas
class DashboardMetrics(BaseModel):
    total_items: int
    en_bodega: int
    en_operacion: int
    en_limpieza: int
    en_devolucion: int
    otros_estados: int
    por_validar: int
    validados: int

class ProcessingData(BaseModel):
    mes: str
    recepcion: int
    inspeccion: int
    limpieza: int
    operacion: int

class ActivityItem(BaseModel):
    id: int
    inventario_id: Optional[int] = None
    descripcion: str
    timestamp: datetime
    nombre_unidad: Optional[str] = None
    rfid: Optional[str] = None
    estado_nuevo: Optional[str] = None

# Función para obtener el esquema del tenant desde el token
def get_tenant_schema(current_user: Dict[str, Any]) -> str:
    tenant = current_user.get('tenant', 'tenant_base')
    print(f"DEBUG: Usuario {current_user.get('correo', 'unknown')} usando tenant: {tenant}")
    return tenant

# --- Endpoint de verificación RFID sin autenticación ---
@app.get("/verificar-rfid-sin-auth/{rfid}")
def verificar_rfid_sin_auth(rfid: str, db: Session = Depends(get_db)):
    """Verificar RFID sin autenticación para el proceso de registro"""
    try:
        tenant_schema = "tenant_brandon"  # Usar tenant fijo
        query = text("SELECT COUNT(*) FROM tenant_brandon.inventario WHERE rfid = :rfid")
        result = db.execute(query, {"rfid": rfid})
        count = result.scalar()
        return {"rfid": rfid, "existe": count > 0, "count": count}
    except Exception as e:
        print(f"Error verificando RFID: {e}")
        return {"rfid": rfid, "existe": False, "count": 0, "error": str(e)}

# --- Endpoints para Modelos ---
@app.get("/modelos/", response_model=List[ModeloResponse])
def get_modelos(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    """Obtener lista de modelos de credcubes"""
    try:
        tenant_schema = get_tenant_schema(current_user)
        query = text(f"""
            SELECT modelo_id, nombre_modelo, volumen_litros, descripcion,
                   dim_ext_frente, dim_ext_profundo, dim_ext_alto,
                   dim_int_frente, dim_int_profundo, dim_int_alto,
                   tic_frente, tic_alto, peso_total_kg, tipo
            FROM {tenant_schema}.modelos
            ORDER BY nombre_modelo
            OFFSET :skip LIMIT :limit
        """)
        
        result = db.execute(query, {"skip": skip, "limit": limit})
        modelos = []
        for row in result:
            modelo_dict = dict(row._mapping)
            modelos.append(ModeloResponse(**modelo_dict))
        
        return modelos
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo modelos: {str(e)}")

# --- Endpoints para Inventario ---
@app.get("/inventario/", response_model=List[InventarioResponse])
def get_inventario(
    skip: int = 0, 
    limit: int = 1000, 
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    """Obtener inventario completo con información de modelos"""
    try:
        tenant_schema = get_tenant_schema(current_user)
        
        print(f"DEBUG: Datos de inventario para {tenant_schema}:")
        
        query = text(f"""
            SELECT i.id, i.modelo_id, m.nombre_modelo, i.nombre_unidad, i.rfid, 
                   i.lote, i.estado, i.sub_estado, i.validacion_limpieza, 
                   i.validacion_goteo, i.validacion_desinfeccion, i.categoria,
                   i.fecha_ingreso, i.ultima_actualizacion, i.fecha_vencimiento, i.activo
            FROM {tenant_schema}.inventario i
            LEFT JOIN {tenant_schema}.modelos m ON i.modelo_id = m.modelo_id
            WHERE i.activo = true
            ORDER BY i.ultima_actualizacion DESC, i.fecha_ingreso DESC
            OFFSET :skip LIMIT :limit
        """)
        
        result = db.execute(query, {"skip": skip, "limit": limit})
        inventario = []
        for row in result:
            item_dict = dict(row._mapping)
            print(f"  - Unidad: {item_dict.get('nombre_unidad', 'N/A')}, Categoria: {item_dict.get('categoria', 'N/A')}, Fecha: {item_dict.get('fecha_ingreso', 'N/A')}")
            inventario.append(InventarioResponse(**item_dict))
        
        return inventario
    except Exception as e:
        print(f"Error obteniendo inventario: {e}")
        raise HTTPException(status_code=500, detail=f"Error obteniendo inventario: {str(e)}")

@app.post("/inventario/", response_model=InventarioResponse)
def create_inventario(
    inventario: InventarioCreate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    """Crear nuevo item en el inventario"""
    try:
        tenant_schema = get_tenant_schema(current_user)
        
        # Verificar si el RFID ya existe
        check_query = text(f"""
            SELECT id FROM {tenant_schema}.inventario 
            WHERE rfid = :rfid AND activo = true
        """)
        existing = db.execute(check_query, {"rfid": inventario.rfid}).fetchone()
        if existing:
            raise HTTPException(
                status_code=400, 
                detail=f"El RFID {inventario.rfid} ya existe en el inventario"
            )
        
        # Crear nuevo item
        insert_query = text(f"""
            INSERT INTO {tenant_schema}.inventario 
            (modelo_id, nombre_unidad, rfid, lote, estado, sub_estado, 
             validacion_limpieza, validacion_goteo, validacion_desinfeccion, categoria,
             fecha_ingreso, ultima_actualizacion, activo)
            VALUES (:modelo_id, :nombre_unidad, :rfid, :lote, :estado, :sub_estado,
                    :validacion_limpieza, :validacion_goteo, :validacion_desinfeccion, :categoria,
                    NOW(), NOW(), true)
            RETURNING id, modelo_id, nombre_unidad, rfid, lote, estado, sub_estado,
                      validacion_limpieza, validacion_goteo, validacion_desinfeccion, categoria,
                      fecha_ingreso, ultima_actualizacion, fecha_vencimiento, activo
        """)
        
        result = db.execute(insert_query, inventario.dict())
        db.commit()
        
        nuevo_item = result.fetchone()
        if nuevo_item:
            return InventarioResponse(**dict(nuevo_item._mapping))
        else:
            raise HTTPException(status_code=500, detail="Error creando item en inventario")
            
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creando inventario: {str(e)}")

# --- Bulk Inventory Creation Endpoint ---
@app.post("/inventario/bulk-create", response_model=BulkInventarioCreateResponse)
def bulk_create_inventario(
    request: BulkInventarioCreateRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    tenant_schema = get_tenant_schema(current_user)
    bulk_ops = BulkOperations(db, tenant_schema)
    items = [item.dict() for item in request.items]
    result = bulk_ops.bulk_create_inventario(items)
    return BulkInventarioCreateResponse(**result)

# --- Health check ---
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "inventory"}

# --- Dashboard endpoints ---
@app.get("/dashboard/metrics", response_model=DashboardMetrics)
def get_dashboard_metrics(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    """Obtener métricas del dashboard"""
    try:
        tenant_schema = get_tenant_schema(current_user)
        
        # Query principal para obtener todas las métricas
        query = text(f"""
            SELECT 
                COUNT(*) as total_items,
                COUNT(CASE WHEN LOWER(estado) = 'en bodega' THEN 1 END) as en_bodega,
                COUNT(CASE WHEN LOWER(estado) = 'en operacion' OR LOWER(estado) = 'en operación' THEN 1 END) as en_operacion,
                COUNT(CASE WHEN LOWER(estado) = 'en limpieza' THEN 1 END) as en_limpieza,
                COUNT(CASE WHEN LOWER(estado) = 'en devolucion' OR LOWER(estado) = 'en devolución' THEN 1 END) as en_devolucion,
                COUNT(CASE WHEN LOWER(estado) NOT IN ('en bodega', 'en operacion', 'en operación', 'en limpieza', 'en devolucion', 'en devolución') THEN 1 END) as otros_estados,
                COUNT(CASE WHEN validacion_limpieza IS NULL OR validacion_goteo IS NULL OR validacion_desinfeccion IS NULL THEN 1 END) as por_validar,
                COUNT(CASE WHEN validacion_limpieza IS NOT NULL AND validacion_goteo IS NOT NULL AND validacion_desinfeccion IS NOT NULL THEN 1 END) as validados
            FROM {tenant_schema}.inventario 
            WHERE activo = true
        """)
        
        result = db.execute(query).fetchone()
        
        if result:
            return DashboardMetrics(**dict(result._mapping))
        else:
            return DashboardMetrics(
                total_items=0, en_bodega=0, en_operacion=0, en_limpieza=0, 
                en_devolucion=0, otros_estados=0, por_validar=0, validados=0
            )
            
    except Exception as e:
        print(f"Error obteniendo métricas del dashboard: {e}")
        raise HTTPException(status_code=500, detail=f"Error obteniendo métricas: {str(e)}")

@app.get("/dashboard/processing-data", response_model=List[ProcessingData])
def get_processing_data(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    """Obtener datos de procesamiento por mes"""
    try:
        tenant_schema = get_tenant_schema(current_user)
        
        query = text(f"""
            WITH monthly_data AS (
                SELECT 
                    TO_CHAR(fecha_ingreso, 'Mon') as mes,
                    COUNT(CASE WHEN LOWER(estado) = 'recepcion' OR LOWER(estado) = 'recepción' THEN 1 END) as recepcion,
                    COUNT(CASE WHEN LOWER(estado) = 'inspeccion' OR LOWER(estado) = 'inspección' THEN 1 END) as inspeccion,
                    COUNT(CASE WHEN LOWER(estado) = 'en limpieza' THEN 1 END) as limpieza,
                    COUNT(CASE WHEN LOWER(estado) = 'en operacion' OR LOWER(estado) = 'en operación' THEN 1 END) as operacion
                FROM {tenant_schema}.inventario 
                WHERE activo = true 
                    AND fecha_ingreso >= NOW() - INTERVAL '12 months'
                GROUP BY DATE_TRUNC('month', fecha_ingreso), TO_CHAR(fecha_ingreso, 'Mon')
                ORDER BY DATE_TRUNC('month', fecha_ingreso)
            )
            SELECT mes, 
                   COALESCE(recepcion, 0) as recepcion,
                   COALESCE(inspeccion, 0) as inspeccion, 
                   COALESCE(limpieza, 0) as limpieza,
                   COALESCE(operacion, 0) as operacion
            FROM monthly_data
        """)
        
        result = db.execute(query)
        data = [ProcessingData(**dict(row._mapping)) for row in result]
        
        print(f"DEBUG: Resultados de procesamiento: {[(d.mes, d.recepcion, d.inspeccion, d.limpieza, d.operacion) for d in data]}")
        
        return data
        
    except Exception as e:
        print(f"Error obteniendo datos de procesamiento: {e}")
        raise HTTPException(status_code=500, detail=f"Error obteniendo datos de procesamiento: {str(e)}")

@app.get("/dashboard/recent-activity", response_model=List[ActivityItem])
def get_recent_activity(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    """Obtener actividad reciente"""
    try:
        tenant_schema = get_tenant_schema(current_user)
        
        query = text(f"""
            SELECT a.id, a.inventario_id, a.descripcion, a.timestamp, 
                   i.nombre_unidad, i.rfid, a.estado_nuevo
            FROM {tenant_schema}.actividades a
            LEFT JOIN {tenant_schema}.inventario i ON a.inventario_id = i.id
            ORDER BY a.timestamp DESC
            LIMIT 10
        """)
        
        result = db.execute(query)
        actividades = [ActivityItem(**dict(row._mapping)) for row in result]
        
        print(f"DEBUG: Datos de inventario para {tenant_schema}:")
        for item in actividades:
            print(f"  - Unidad: {item.nombre_unidad}, Categoria: TIC, Fecha: {item.timestamp}")
        
        return actividades
        
    except Exception as e:
        print(f"Error obteniendo actividad reciente: {e}")
        raise HTTPException(status_code=500, detail=f"Error obteniendo actividad reciente: {str(e)}")
