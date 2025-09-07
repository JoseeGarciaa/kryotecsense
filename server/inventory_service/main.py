from fastapi import FastAPI, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from pydantic import BaseModel
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from shared.database import get_db
from shared.utils import get_current_user_from_token

# Utils: ensure datetimes are timezone-aware (UTC)
# If a datetime is naive (older rows), assume it's in APP_LOCAL_TZ (default UTC), then convert to UTC.
APP_LOCAL_TZ = os.getenv("APP_LOCAL_TZ", "UTC")
APP_NAIVE_LEGACY_CUTOFF_ISO = os.getenv("APP_NAIVE_LEGACY_CUTOFF_ISO")
try:
    _LOCAL_TZ = ZoneInfo(APP_LOCAL_TZ)
except Exception:
    _LOCAL_TZ = timezone.utc

# Optional cutoff to distinguish legacy naive timestamps (interpreted as local) vs new (interpreted as UTC)
_NAIVE_CUTOFF: Optional[datetime] = None
if APP_NAIVE_LEGACY_CUTOFF_ISO:
    try:
        # Accept both with and without timezone designator
        _NAIVE_CUTOFF = datetime.fromisoformat(APP_NAIVE_LEGACY_CUTOFF_ISO.replace('Z', '+00:00'))
        # If parsed cutoff is naive, assume local tz and convert to UTC for consistent comparisons
        if _NAIVE_CUTOFF.tzinfo is None or _NAIVE_CUTOFF.tzinfo.utcoffset(_NAIVE_CUTOFF) is None:
            _NAIVE_CUTOFF = _NAIVE_CUTOFF.replace(tzinfo=_LOCAL_TZ).astimezone(timezone.utc)
        else:
            _NAIVE_CUTOFF = _NAIVE_CUTOFF.astimezone(timezone.utc)
    except Exception:
        _NAIVE_CUTOFF = None

def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if not isinstance(dt, datetime):
        return dt
    if dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None:
        # Decide how to interpret naive timestamps
        if _NAIVE_CUTOFF is not None:
            # Compare using UTC: treat incoming dt as local to compare reliably
            try:
                dt_local = dt.replace(tzinfo=_LOCAL_TZ)
                dt_utc_for_compare = dt_local.astimezone(timezone.utc)
            except Exception:
                dt_utc_for_compare = dt.replace(tzinfo=timezone.utc)
            # If it's newer than cutoff, assume it was stored as UTC naive
            if dt_utc_for_compare >= _NAIVE_CUTOFF:
                return dt.replace(tzinfo=timezone.utc)
            # Legacy: interpret as local, then convert to UTC
            try:
                return dt.replace(tzinfo=_LOCAL_TZ).astimezone(timezone.utc)
            except Exception:
                return dt.replace(tzinfo=timezone.utc)
        # No cutoff: default to interpreting naive as UTC to avoid artificial shifts
        return dt.replace(tzinfo=timezone.utc)
    # Ensure conversion to UTC when tz-aware but not UTC
    try:
        return dt.astimezone(timezone.utc)
    except Exception:
        return dt

# Función para generar lotes automáticos
def generar_lote_automatico(db: Session, tenant_schema: str) -> str:
    """
    Genera un lote automático basado en la fecha actual y un contador secuencial
    Formato: YYYYMMDDXXX (donde XXX es un contador de 3 dígitos)
    """
    # Obtener la fecha actual en formato YYYYMMDD
    fecha_actual = datetime.now().strftime("%Y%m%d")
    
    # Buscar el último lote creado hoy (que empiece con la fecha de hoy)
    query = text(f"""
        SELECT lote FROM {tenant_schema}.inventario_credocubes 
        WHERE lote LIKE '{fecha_actual}%' 
        ORDER BY lote DESC 
        LIMIT 1
    """)
    
    resultado = db.execute(query).fetchone()
    
    if resultado:
        # Extraer el número del último lote y incrementar
        ultimo_lote = resultado[0]  # Formato: YYYYMMDDXXX
        try:
            # Obtener los últimos 3 dígitos del lote
            numero = int(ultimo_lote[-3:])
            nuevo_numero = numero + 1
        except (ValueError, IndexError):
            nuevo_numero = 1
    else:
        # Primer lote del día
        nuevo_numero = 1
    
    # Formatear el nuevo lote solo con números: YYYYMMDDXXX
    nuevo_lote = f"{fecha_actual}{nuevo_numero:03d}"
    
    return nuevo_lote

def get_tenant_schema(current_user: Dict[str, Any]) -> str:
    """Obtener el esquema del tenant del usuario actual"""
    return current_user.get("tenant", "public")

# Crear aplicación FastAPI
app = FastAPI(
    title="Servicio de Inventario - KryoTecSense",
    description="Microservicio para gestión del inventario de credcubes",
    version="1.0.0"
)
app = FastAPI(
    title="Servicio de Inventario - KryoTecSense",
    description="Microservicio para gestión del inventario de credcubes",
    version="1.0.0"
)

# Schemas básicos
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
    nombre_modelo: Optional[str] = None
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
    # Permitir timestamps opcionales provenientes del cliente para sincronizar hora de escaneo
    fecha_ingreso: Optional[datetime] = None
    ultima_actualizacion: Optional[datetime] = None

class InventarioUpdate(BaseModel):
    modelo_id: Optional[int] = None
    nombre_unidad: Optional[str] = None
    rfid: Optional[str] = None
    lote: Optional[str] = None
    estado: Optional[str] = None
    sub_estado: Optional[str] = None
    validacion_limpieza: Optional[str] = None
    validacion_goteo: Optional[str] = None
    validacion_desinfeccion: Optional[str] = None
    categoria: Optional[str] = None

class EstadoUpdate(BaseModel):
    estado: str
    sub_estado: Optional[str] = None

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

# Función para obtener el esquema del tenant
def get_tenant_schema(current_user: Dict[str, Any]) -> str:
    tenant = current_user.get('tenant', 'tenant_base')
    print(f"DEBUG: Usuario {current_user.get('correo', 'unknown')} usando tenant: {tenant}")
    return tenant

# ===== ENDPOINTS PRINCIPALES =====

# Health check
@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "inventory_service"}

# Debug endpoint para listar todas las rutas
@app.get("/debug/routes")
async def debug_routes():
    routes = []
    for route in app.routes:
        if hasattr(route, 'path'):
            routes.append({
                "path": route.path,
                "methods": list(route.methods) if hasattr(route, 'methods') else ["GET"]
            })
    return {"routes": routes}

@app.get("/verificar-rfid-sin-auth/{rfid}")
async def verificar_rfid_sin_auth(rfid: str, db: Session = Depends(get_db)):
    """Verificar RFID sin autenticación para el proceso de registro"""
    try:
        tenant_schema = "tenant_brandon"  # Usar tenant fijo
        query = text("SELECT COUNT(*) FROM tenant_brandon.inventario_credocubes WHERE rfid = :rfid")
        result = db.execute(query, {"rfid": rfid})
        count = result.scalar()
        return {"rfid": rfid, "existe": count > 0, "count": count}
    except Exception as e:
        print(f"Error verificando RFID: {e}")
        return {"rfid": rfid, "existe": False, "count": 0, "error": str(e)}

# Endpoints para Modelos
@app.get("/modelos/", response_model=List[ModeloResponse])
async def get_modelos(
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

# Endpoints para Inventario
@app.get("/inventario/", response_model=List[InventarioResponse])
async def get_inventario(
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
            FROM {tenant_schema}.inventario_credocubes i
            LEFT JOIN {tenant_schema}.modelos m ON i.modelo_id = m.modelo_id
            WHERE i.activo = true
            ORDER BY i.ultima_actualizacion DESC, i.fecha_ingreso DESC
            OFFSET :skip LIMIT :limit
        """)
        
        result = db.execute(query, {"skip": skip, "limit": limit})
        inventario = []
        for row in result:
            item_dict = dict(row._mapping)
            # Normalize datetime fields to UTC-aware to serialize with 'Z'
            item_dict['fecha_ingreso'] = _ensure_utc(item_dict.get('fecha_ingreso'))
            item_dict['ultima_actualizacion'] = _ensure_utc(item_dict.get('ultima_actualizacion'))
            print(f"  - Unidad: {item_dict.get('nombre_unidad', 'N/A')}, Categoria: {item_dict.get('categoria', 'N/A')}, Fecha: {item_dict.get('fecha_ingreso', 'N/A')}")
            inventario.append(InventarioResponse(**item_dict))
        
        return inventario
    except Exception as e:
        print(f"Error obteniendo inventario: {e}")
        raise HTTPException(status_code=500, detail=f"Error obteniendo inventario: {str(e)}")

@app.post("/inventario/", response_model=InventarioResponse)
async def create_inventario(
    inventario: InventarioCreate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    """Crear nuevo item en el inventario"""
    try:
        tenant_schema = get_tenant_schema(current_user)
        
        # Verificar si el RFID ya existe
        check_query = text(f"""
            SELECT id FROM {tenant_schema}.inventario_credocubes 
            WHERE rfid = :rfid AND activo = true
        """)
        existing = db.execute(check_query, {"rfid": inventario.rfid}).fetchone()
        if existing:
            raise HTTPException(
                status_code=400, 
                detail=f"El RFID {inventario.rfid} ya existe en el inventario"
            )

        # Crear nuevo item usando timestamps del cliente si vienen, de lo contrario NOW()
        insert_query = text(f"""
            INSERT INTO {tenant_schema}.inventario_credocubes 
            (modelo_id, nombre_unidad, rfid, lote, estado, sub_estado, 
             validacion_limpieza, validacion_goteo, validacion_desinfeccion, categoria,
             fecha_ingreso, ultima_actualizacion, activo)
            VALUES (:modelo_id, :nombre_unidad, :rfid, :lote, :estado, :sub_estado,
                    :validacion_limpieza, :validacion_goteo, :validacion_desinfeccion, :categoria,
                    COALESCE(:fecha_ingreso, NOW()), COALESCE(:ultima_actualizacion, NOW()), true)
            RETURNING id, modelo_id, nombre_unidad, rfid, lote, estado, sub_estado,
                      validacion_limpieza, validacion_goteo, validacion_desinfeccion, categoria,
                      fecha_ingreso, ultima_actualizacion, fecha_vencimiento, activo
        """)

        params = inventario.dict()
        result = db.execute(insert_query, params)
        db.commit()

        nuevo_item = result.fetchone()
        if nuevo_item:
            data = dict(nuevo_item._mapping)
            data['fecha_ingreso'] = _ensure_utc(data.get('fecha_ingreso'))
            data['ultima_actualizacion'] = _ensure_utc(data.get('ultima_actualizacion'))
            return InventarioResponse(**data)
        else:
            raise HTTPException(status_code=500, detail="Error creando item en inventario")
            
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creando inventario: {str(e)}")

@app.put("/inventario/{inventario_id}", response_model=InventarioResponse)
async def update_inventario(
    inventario_id: int,
    inventario: InventarioUpdate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    """Actualizar item del inventario completo"""
    try:
        tenant_schema = get_tenant_schema(current_user)
        
        # Verificar que el inventario existe
        check_query = text(f"SELECT id FROM {tenant_schema}.inventario_credocubes WHERE id = :id")
        existing = db.execute(check_query, {"id": inventario_id}).fetchone()
        
        if not existing:
            raise HTTPException(
                status_code=404,
                detail=f"Inventario con ID {inventario_id} no encontrado"
            )
        
        # Verificar que el RFID no exista en otro registro si se está actualizando
        if inventario.rfid:
            check_rfid_query = text(f"""
                SELECT id FROM {tenant_schema}.inventario_credocubes 
                WHERE rfid = :rfid AND id != :id
            """)
            existing_rfid = db.execute(check_rfid_query, {
                "rfid": inventario.rfid, 
                "id": inventario_id
            }).fetchone()
            
            if existing_rfid:
                raise HTTPException(
                    status_code=400,
                    detail=f"Ya existe otro credcube con RFID {inventario.rfid}"
                )
        
        # Construir query de actualización dinámicamente
        update_fields = []
        params = {"id": inventario_id}
        
        for field, value in inventario.dict(exclude_unset=True).items():
            if value is not None:
                update_fields.append(f"{field} = :{field}")
                params[field] = value
        
        if not update_fields:
            raise HTTPException(
                status_code=400,
                detail="No hay campos para actualizar"
            )
        
        # Siempre actualizar timestamp
        update_fields.append("ultima_actualizacion = CURRENT_TIMESTAMP")
        
        update_query = text(f"""
            UPDATE {tenant_schema}.inventario_credocubes 
            SET {', '.join(update_fields)}
            WHERE id = :id
            RETURNING id, modelo_id, nombre_unidad, rfid, lote, estado, sub_estado,
                      validacion_limpieza, validacion_goteo, validacion_desinfeccion,
                      categoria, fecha_ingreso, ultima_actualizacion, fecha_vencimiento, activo
        """)
        
        result = db.execute(update_query, params)
        db.commit()
        
        row = result.fetchone()
        if row:
            data = dict(row._mapping)
            data['fecha_ingreso'] = _ensure_utc(data.get('fecha_ingreso'))
            data['ultima_actualizacion'] = _ensure_utc(data.get('ultima_actualizacion'))
            return InventarioResponse(**data)
        else:
            raise HTTPException(status_code=500, detail="Error actualizando inventario")
            
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error actualizando inventario: {str(e)}")

@app.patch("/inventario/{inventario_id}/estado", response_model=InventarioResponse)
async def update_inventario_estado(
    inventario_id: int,
    estado_update: EstadoUpdate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    """Actualizar solo el estado de un item del inventario"""
    try:
        tenant_schema = get_tenant_schema(current_user)
        
        # Verificar que el inventario existe
        check_query = text(f"SELECT id FROM {tenant_schema}.inventario_credocubes WHERE id = :id")
        existing = db.execute(check_query, {"id": inventario_id}).fetchone()
        
        if not existing:
            raise HTTPException(
                status_code=404,
                detail=f"Inventario con ID {inventario_id} no encontrado"
            )
        
        # Verificar si necesitamos asignar un lote automático
        lote_automatico = None
        if (estado_update.estado and 
            estado_update.estado.lower() in ['Pre acondicionamiento', 'preacondicionamiento'] and
            estado_update.sub_estado and 
            estado_update.sub_estado.lower() in ['congelación', 'congelacion', 'atemperamiento']):
            
            # Verificar si el item ya tiene lote
            check_lote_query = text(f"SELECT lote FROM {tenant_schema}.inventario_credocubes WHERE id = :id")
            lote_actual = db.execute(check_lote_query, {"id": inventario_id}).fetchone()
            
            if not lote_actual or not lote_actual[0]:
                lote_automatico = generar_lote_automatico(db, tenant_schema)

        # Actualizar estado, sub_estado, lote (si aplica) y ultima_actualizacion
        if lote_automatico:
            update_query = text(f"""
                UPDATE {tenant_schema}.inventario_credocubes 
                SET estado = :estado, 
                    sub_estado = :sub_estado,
                    lote = :lote,
                    ultima_actualizacion = CURRENT_TIMESTAMP
                WHERE id = :id
                RETURNING id, modelo_id, nombre_unidad, rfid, lote, estado, sub_estado,
                          validacion_limpieza, validacion_goteo, validacion_desinfeccion,
                          categoria, fecha_ingreso, ultima_actualizacion, fecha_vencimiento, activo
            """)
            
            result = db.execute(update_query, {
                "id": inventario_id,
                "estado": estado_update.estado,
                "sub_estado": estado_update.sub_estado,
                "lote": lote_automatico
            })
        else:
            update_query = text(f"""
                UPDATE {tenant_schema}.inventario_credocubes 
                SET estado = :estado, 
                    sub_estado = :sub_estado,
                    ultima_actualizacion = CURRENT_TIMESTAMP
                WHERE id = :id
                RETURNING id, modelo_id, nombre_unidad, rfid, lote, estado, sub_estado,
                          validacion_limpieza, validacion_goteo, validacion_desinfeccion,
                          categoria, fecha_ingreso, ultima_actualizacion, fecha_vencimiento, activo
            """)
            
            result = db.execute(update_query, {
                "id": inventario_id,
                "estado": estado_update.estado,
                "sub_estado": estado_update.sub_estado
            })
        
        db.commit()
        row = result.fetchone()
        
        if row:
            data = dict(row._mapping)
            data['fecha_ingreso'] = _ensure_utc(data.get('fecha_ingreso'))
            data['ultima_actualizacion'] = _ensure_utc(data.get('ultima_actualizacion'))
            return InventarioResponse(**data)
        else:
            raise HTTPException(status_code=500, detail="Error actualizando estado")
            
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error actualizando estado: {str(e)}")

# Dashboard endpoints
@app.get("/dashboard/metrics", response_model=DashboardMetrics)
async def get_dashboard_metrics(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    """Obtener métricas del dashboard"""
    try:
        tenant_schema = get_tenant_schema(current_user)
        
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
            FROM {tenant_schema}.inventario_credocubes 
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
async def get_processing_data(
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
                FROM {tenant_schema}.inventario_credocubes 
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
async def get_recent_activity(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    """Obtener actividad reciente"""
    try:
        tenant_schema = get_tenant_schema(current_user)
        
        query = text(f"""
            SELECT a.id, a.inventario_id, a.descripcion, a.timestamp, 
                   i.nombre_unidad, i.rfid, a.estado_nuevo
            FROM {tenant_schema}.actividades_operacion a
            LEFT JOIN {tenant_schema}.inventario_credocubes i ON a.inventario_id = i.id
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

# Endpoint para asignar lote a múltiples items
class AsignarLoteRequest(BaseModel):
    rfids: List[str]
    lote: str

@app.patch("/inventario/asignar-lote")
async def asignar_lote_multiple(
    request: AsignarLoteRequest,
    db: Session = Depends(get_db)
):
    """Asignar lote a múltiples items de inventario por sus RFIDs"""
    try:
        if not request.rfids:
            raise HTTPException(status_code=400, detail="Debe proporcionar al menos un RFID")
        
        if not request.lote.strip():
            raise HTTPException(status_code=400, detail="Debe proporcionar un lote válido")
        
        # Actualizar todos los items con los RFIDs proporcionados
        query = text("""
            UPDATE inventario 
            SET lote = :lote
            WHERE rfid = ANY(:rfids)
            RETURNING id, nombre_unidad, rfid, lote
        """)
        
        result = db.execute(query, {
            "lote": request.lote.strip(),
            "rfids": request.rfids
        })
        
        items_actualizados = result.fetchall()
        db.commit()
        
        if not items_actualizados:
            raise HTTPException(status_code=404, detail="No se encontraron items con los RFIDs proporcionados")
        
        return {
            "message": f"Lote '{request.lote}' asignado exitosamente",
            "items_actualizados": len(items_actualizados),
            "items": [
                {
                    "id": item.id,
                    "nombre_unidad": item.nombre_unidad,
                    "rfid": item.rfid,
                    "lote": item.lote
                }
                for item in items_actualizados
            ]
        }
        
    except Exception as e:
        db.rollback()
        print(f"Error asignando lote: {e}")
        raise HTTPException(status_code=500, detail=f"Error asignando lote: {str(e)}")

# Endpoint para asignar lotes automáticos a múltiples RFIDs
class AsignarLoteAutomaticoRequest(BaseModel):
    rfids: List[str]
    estado: str
    sub_estado: str

@app.patch("/inventario/asignar-lote-automatico")
async def asignar_lote_automatico_multiple(
    request: AsignarLoteAutomaticoRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    """Asignar lote automático a múltiples items y actualizar su estado"""
    try:
        tenant_schema = get_tenant_schema(current_user)
        
        if not request.rfids:
            raise HTTPException(status_code=400, detail="Debe proporcionar al menos un RFID")
        
        # Generar un lote automático único para este grupo
        lote_automatico = generar_lote_automatico(db, tenant_schema)
        
        # Actualizar todos los RFIDs con el mismo lote automático, estado y sub_estado
        update_query = text(f"""
            UPDATE {tenant_schema}.inventario_credocubes 
            SET lote = :lote,
                estado = :estado,
                sub_estado = :sub_estado,
                ultima_actualizacion = CURRENT_TIMESTAMP
            WHERE rfid = ANY(:rfids) AND activo = true
            RETURNING id, modelo_id, nombre_unidad, rfid, lote, estado, sub_estado,
                      categoria, fecha_ingreso, ultima_actualizacion
        """)
        
        result = db.execute(update_query, {
            "lote": lote_automatico,
            "estado": request.estado,
            "sub_estado": request.sub_estado,
            "rfids": request.rfids
        })
        
        items_actualizados = result.fetchall()
        db.commit()
        
        if not items_actualizados:
            raise HTTPException(
                status_code=404, 
                detail="No se encontraron items activos con los RFIDs proporcionados"
            )
        
        return {
            "message": f"Lote automático '{lote_automatico}' asignado exitosamente",
            "lote_generado": lote_automatico,
            "items_actualizados": len(items_actualizados),
            "items": [
                {
                    "id": item.id,
                    "nombre_unidad": item.nombre_unidad,
                    "rfid": item.rfid,
                    "lote": item.lote,
                    "estado": item.estado,
                    "sub_estado": item.sub_estado
                }
                for item in items_actualizados
            ]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error asignando lote automático: {e}")
        raise HTTPException(status_code=500, detail=f"Error asignando lote automático: {str(e)}")

# Endpoint para eliminar un item del inventario
@app.delete("/inventario/{inventario_id}", status_code=status.HTTP_200_OK)
async def delete_inventario(
    inventario_id: int,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    """Eliminar un item del inventario (soft delete)"""
    try:
        tenant_schema = get_tenant_schema(current_user)
        
        # Verificar que el inventario existe
        check_query = text(f"SELECT id, rfid FROM {tenant_schema}.inventario_credocubes WHERE id = :id AND activo = true")
        existing = db.execute(check_query, {"id": inventario_id}).fetchone()
        
        if not existing:
            raise HTTPException(
                status_code=404,
                detail=f"Inventario con ID {inventario_id} no encontrado o ya eliminado"
            )
        
        # Realizar soft delete (marcar como inactivo)
        delete_query = text(f"""
            UPDATE {tenant_schema}.inventario_credocubes 
            SET activo = false,
                ultima_actualizacion = CURRENT_TIMESTAMP
            WHERE id = :id
        """)
        
        db.execute(delete_query, {"id": inventario_id})
        db.commit()
        
        return {
            "message": f"Item del inventario eliminado exitosamente",
            "id": inventario_id,
            "rfid": existing[1]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error eliminando inventario: {e}")
        raise HTTPException(status_code=500, detail=f"Error eliminando inventario: {str(e)}")

# Esquema para iniciar envío
class IniciarEnvioRequest(BaseModel):
    items_ids: List[int]  # IDs de los items a enviar
    tiempo_envio_minutos: Optional[int] = None  # Tiempo estimado en minutos
    descripcion_adicional: Optional[str] = None  # Descripción adicional del envío

# Endpoint para iniciar proceso de envío
@app.post("/inventario/iniciar-envio", status_code=status.HTTP_200_OK)
async def iniciar_envio(
    request: IniciarEnvioRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    """Iniciar proceso de envío para los items seleccionados"""
    try:
        tenant_schema = get_tenant_schema(current_user)
        
        if not request.items_ids:
            raise HTTPException(
                status_code=400,
                detail="Debe proporcionar al menos un item para enviar"
            )
        
        # Verificar que todos los items existen y están disponibles para envío
        check_query = text(f"""
            SELECT id, rfid, estado, lote 
            FROM {tenant_schema}.inventario_credocubes 
            WHERE id = ANY(:item_ids) AND activo = true
        """)
        
        existing_items = db.execute(check_query, {"item_ids": request.items_ids}).fetchall()
        
        if len(existing_items) != len(request.items_ids):
            raise HTTPException(
                status_code=404,
                detail="Algunos items no fueron encontrados o no están activos"
            )
        
        # Actualizar estado de los items a "operación/En transito" para envío
        update_query = text(f"""
            UPDATE {tenant_schema}.inventario_credocubes 
            SET estado = 'operación',
                sub_estado = 'En transito',
                ultima_actualizacion = CURRENT_TIMESTAMP
            WHERE id = ANY(:item_ids)
            RETURNING id, rfid, estado, sub_estado, lote
        """)
        
        updated_items = db.execute(update_query, {"item_ids": request.items_ids}).fetchall()
        db.commit()
        
        items_info = [
            {
                "id": item.id,
                "rfid": item.rfid,
                "estado": item.estado,
                "sub_estado": item.sub_estado,
                "lote": item.lote
            }
            for item in updated_items
        ]
        
        return {
            "message": f"Proceso de envío iniciado exitosamente para {len(updated_items)} items",
            "items_enviados": len(updated_items),
            "tiempo_estimado_minutos": request.tiempo_envio_minutos,
            "descripcion": request.descripcion_adicional,
            "items": items_info
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error iniciando envío: {e}")
        raise HTTPException(status_code=500, detail=f"Error iniciando envío: {str(e)}")

# Endpoint para completar envío
@app.patch("/inventario/{item_id}/completar-envio", status_code=status.HTTP_200_OK)
async def completar_envio(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    """Completar el proceso de envío de un item"""
    try:
        tenant_schema = get_tenant_schema(current_user)
        
        # Verificar que el item existe y está en envío
        check_query = text(f"""
            SELECT id, rfid, estado 
            FROM {tenant_schema}.inventario_credocubes 
            WHERE id = :item_id AND activo = true
        """)
        
        existing_item = db.execute(check_query, {"item_id": item_id}).fetchone()
        
        if not existing_item:
            raise HTTPException(
                status_code=404,
                detail=f"Item con ID {item_id} no encontrado o no está activo"
            )
        
        # Actualizar estado a "operación/entregado"
        update_query = text(f"""
            UPDATE {tenant_schema}.inventario_credocubes 
            SET estado = 'operación',
                sub_estado = 'entregado',
                ultima_actualizacion = CURRENT_TIMESTAMP
            WHERE id = :item_id
            RETURNING id, rfid, estado, sub_estado, lote
        """)
        
        updated_item = db.execute(update_query, {"item_id": item_id}).fetchone()
        db.commit()
        
        return {
            "message": "Envío completado exitosamente",
            "item": {
                "id": updated_item.id,
                "rfid": updated_item.rfid,
                "estado": updated_item.estado,
                "sub_estado": updated_item.sub_estado,
                "lote": updated_item.lote
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error completando envío: {e}")
        raise HTTPException(status_code=500, detail=f"Error completando envío: {str(e)}")

# Esquema para cancelar envío
class CancelarEnvioRequest(BaseModel):
    motivo: Optional[str] = "Cancelado por usuario"

# Endpoint para cancelar envío
@app.patch("/inventario/{item_id}/cancelar-envio", status_code=status.HTTP_200_OK)
async def cancelar_envio(
    item_id: int,
    request: CancelarEnvioRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    """Cancelar el proceso de envío de un item"""
    try:
        tenant_schema = get_tenant_schema(current_user)
        
        # Verificar que el item existe
        check_query = text(f"""
            SELECT id, rfid, estado 
            FROM {tenant_schema}.inventario_credocubes 
            WHERE id = :item_id AND activo = true
        """)
        
        existing_item = db.execute(check_query, {"item_id": item_id}).fetchone()
        
        if not existing_item:
            raise HTTPException(
                status_code=404,
                detail=f"Item con ID {item_id} no encontrado o no está activo"
            )
        
        # Revertir estado al anterior (típicamente "En bodega" o "Acondicionamiento")
        update_query = text(f"""
            UPDATE {tenant_schema}.inventario_credocubes 
            SET estado = 'En bodega',
                sub_estado = 'Disponible',
                ultima_actualizacion = CURRENT_TIMESTAMP
            WHERE id = :item_id
            RETURNING id, rfid, estado, sub_estado, lote
        """)
        
        updated_item = db.execute(update_query, {"item_id": item_id}).fetchone()
        db.commit()
        
        return {
            "message": f"Envío cancelado: {request.motivo}",
            "item": {
                "id": updated_item.id,
                "rfid": updated_item.rfid,
                "estado": updated_item.estado,
                "sub_estado": updated_item.sub_estado,
                "lote": updated_item.lote
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error cancelando envío: {e}")
        raise HTTPException(status_code=500, detail=f"Error cancelando envío: {str(e)}")

# Esquemas para operaciones bulk
class BulkUpdateRequest(BaseModel):
    updates: List[Dict[str, Any]]

class BulkActivitiesRequest(BaseModel):
    activities: List[Dict[str, Any]]

class BulkStateChangeRequest(BaseModel):
    updates: List[Dict[str, Any]]

# Endpoint para actualización masiva
@app.post("/inventario/bulk-update", status_code=status.HTTP_200_OK)
async def bulk_update(
    request: BulkUpdateRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    """Actualización masiva de items del inventario"""
    try:
        tenant_schema = get_tenant_schema(current_user)
        
        if not request.updates:
            raise HTTPException(
                status_code=400,
                detail="Debe proporcionar al menos una actualización"
            )
        
        updated_count = 0
        for update in request.updates:
            if 'id' not in update:
                continue
                
            # Construir query de actualización dinámicamente
            set_clauses = []
            params = {"id": update['id']}
            
            for key, value in update.items():
                if key != 'id':
                    set_clauses.append(f"{key} = :{key}")
                    params[key] = value
            
            if set_clauses:
                set_clauses.append("ultima_actualizacion = CURRENT_TIMESTAMP")
                update_query = text(f"""
                    UPDATE {tenant_schema}.inventario_credocubes 
                    SET {', '.join(set_clauses)}
                    WHERE id = :id AND activo = true
                """)
                
                result = db.execute(update_query, params)
                updated_count += result.rowcount
        
        db.commit()
        
        return {
            "message": f"Actualización masiva completada",
            "items_actualizados": updated_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error en actualización masiva: {e}")
        raise HTTPException(status_code=500, detail=f"Error en actualización masiva: {str(e)}")

# Endpoint para actividades masivas (placeholder)
@app.post("/inventario/bulk-activities", status_code=status.HTTP_200_OK)
async def bulk_activities(
    request: BulkActivitiesRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    """Procesar actividades masivas"""
    try:
        # Por ahora, solo retornamos éxito
        # Este endpoint puede ser implementado según las necesidades específicas
        return {
            "message": "Actividades masivas procesadas",
            "activities_procesadas": len(request.activities)
        }
        
    except Exception as e:
        print(f"Error en actividades masivas: {e}")
        raise HTTPException(status_code=500, detail=f"Error en actividades masivas: {str(e)}")

# Endpoint para cambio de estado masivo
@app.post("/inventario/bulk-state-change", status_code=status.HTTP_200_OK)
async def bulk_state_change(
    request: BulkStateChangeRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    """Cambio de estado masivo de items del inventario"""
    try:
        tenant_schema = get_tenant_schema(current_user)
        
        if not request.updates:
            raise HTTPException(
                status_code=400,
                detail="Debe proporcionar al menos una actualización de estado"
            )
        
        updated_count = 0
        for update in request.updates:
            if 'id' not in update or 'estado' not in update:
                continue
                
            update_query = text(f"""
                UPDATE {tenant_schema}.inventario_credocubes 
                SET estado = :estado,
                    sub_estado = :sub_estado,
                    ultima_actualizacion = CURRENT_TIMESTAMP
                WHERE id = :id AND activo = true
            """)
            
            result = db.execute(update_query, {
                "id": update['id'],
                "estado": update['estado'],
                "sub_estado": update.get('sub_estado', None)
            })
            
            updated_count += result.rowcount
        
        db.commit()
        
        return {
            "message": f"Cambio de estado masivo completado",
            "items_actualizados": updated_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error en cambio de estado masivo: {e}")
        raise HTTPException(status_code=500, detail=f"Error en cambio de estado masivo: {str(e)}")

# Endpoint de debug para corregir estados de envío
@app.patch("/debug/corregir-estados-envio", status_code=status.HTTP_200_OK)
async def corregir_estados_envio(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    """Corregir items que tienen estados incorrectos de envío"""
    try:
        tenant_schema = get_tenant_schema(current_user)
        
        # Actualizar items que tienen "En Envío/Preparando" a "operación/En transito"
        update_query = text(f"""
            UPDATE {tenant_schema}.inventario_credocubes 
            SET estado = 'operación',
                sub_estado = 'En transito',
                ultima_actualizacion = CURRENT_TIMESTAMP
            WHERE estado = 'En Envío' AND sub_estado = 'Preparando' AND activo = true
            RETURNING id, rfid, estado, sub_estado, lote
        """)
        
        updated_items = db.execute(update_query).fetchall()
        db.commit()
        
        return {
            "message": f"Estados corregidos para {len(updated_items)} items",
            "items_corregidos": [
                {
                    "id": item.id,
                    "rfid": item.rfid,
                    "estado": item.estado,
                    "sub_estado": item.sub_estado,
                    "lote": item.lote
                }
                for item in updated_items
            ]
        }
        
    except Exception as e:
        db.rollback()
        print(f"Error corrigiendo estados: {e}")
        raise HTTPException(status_code=500, detail=f"Error corrigiendo estados: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    import os

    # Railway/containers set PORT; default to 8002 locally
    port = int(os.environ.get("PORT", 8002))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
