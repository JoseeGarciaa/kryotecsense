from fastapi import FastAPI, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any
from datetime import datetime
import asyncio
import logging

from shared.database import get_db
from shared.models import Alerta
from shared.message_queue import message_queue, publish_alert_created
from shared.utils import get_current_user_from_token
from .schemas import AlertaCreate, AlertaUpdate, Alerta as AlertaSchema

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Crear aplicación FastAPI
app = FastAPI(
    title="Servicio de Alertas - KryoTecSense",
    description="Microservicio para la gestión de alertas del inventario",
    version="1.0.0"
)

# --- Event Handlers ---

# Función para obtener el esquema del tenant desde el token
def get_tenant_schema(current_user: Dict[str, Any]) -> str:
    tenant = current_user.get('tenant', 'tenant_base')
    print(f"DEBUG: Usuario {current_user.get('correo', 'unknown')} usando tenant: {tenant}")
    return tenant

@app.on_event("startup")
async def startup_event():
    """Inicializar conexión a RabbitMQ y consumidores"""
    max_retries = 5
    retry_delay = 3
    
    for attempt in range(max_retries):
        try:
            await message_queue.connect()
            logger.info("🚀 Servicio de Alertas iniciado exitosamente")
            
            # Iniciar consumidor de eventos de timer completado
            asyncio.create_task(consume_timer_completed_events())
            logger.info("👂 Consumidor de eventos de timer iniciado")
            return  # Salir si la conexión fue exitosa
            
        except Exception as e:
            if attempt < max_retries - 1:
                logger.warning(f"⚠️ Intento {attempt + 1} fallido conectando a RabbitMQ: {e}. Reintentando en {retry_delay}s...")
                await asyncio.sleep(retry_delay)
            else:
                logger.error(f"❌ Error en startup después de {max_retries} intentos: {e}")
                # Continuar sin RabbitMQ pero registrar el error

@app.on_event("shutdown")
async def shutdown_event():
    """Cerrar conexión a RabbitMQ"""
    await message_queue.disconnect()
    logger.info("🛑 Servicio de Alertas detenido")

# --- Funciones para manejar eventos ---

async def consume_timer_completed_events():
    """Consumir eventos de timer completado"""
    async def handle_timer_completed(message_data):
        try:
            timer_data = message_data.get("timer", {})
            event_type = message_data.get("event_type")
            
            if event_type == "timer_completed":
                await create_timer_completed_alert(timer_data)
                
        except Exception as e:
            logger.error(f"❌ Error procesando evento de timer completado: {e}")
    
    await message_queue.consume_messages("timer_completed", handle_timer_completed)

async def create_timer_completed_alert(timer_data):
    """Crear alerta cuando se completa un timer"""
    try:
        # Obtener sesión de base de datos
        db = next(get_db())
        
        # Para alertas automáticas, obtener tenant del contexto del timer o usar tenant_base por defecto
        # En el futuro esto debería venir del contexto del usuario que activó el timer
        tenant_schema = timer_data.get("tenant", "tenant_base")  # Mejorado: obtener del contexto
        logger.info(f"📍 Creando alerta automática para tenant: {tenant_schema}")
        logger.info(f"🔍 Datos del timer recibidos: {timer_data}")
        
        # Determinar tipo de alerta basado en el tipo de operación
        tipo_operacion = timer_data.get("tipoOperacion", "")
        rfid = timer_data.get("nombre", "")
        
        if tipo_operacion == "atemperamiento":
            tipo_alerta = "TIMER_ATEMPERAMIENTO_COMPLETADO"
            descripcion = f"Timer de atemperamiento completado para TIC {rfid}. Transición automática a Acondicionamiento."
        elif tipo_operacion == "congelamiento":
            tipo_alerta = "TIMER_CONGELAMIENTO_COMPLETADO" 
            descripcion = f"Timer de congelamiento completado para TIC {rfid}. Requiere acción manual para mover a Atemperamiento."
        else:
            tipo_alerta = "TIMER_COMPLETADO"
            descripcion = f"Timer completado para TIC {rfid}"
        
        # Buscar inventario_id por RFID (esto podría requerir consulta al servicio de inventario)
        # Por simplicidad, lo dejamos como None por ahora
        inventario_id = None
        
        # Crear alerta en el esquema del tenant
        insert_query = f"""
            INSERT INTO {tenant_schema}.alertas (inventario_id, tipo_alerta, descripcion, fecha_creacion, resuelta)
            VALUES (:inventario_id, :tipo_alerta, :descripcion, NOW(), false)
            RETURNING id
        """
        
        result = db.execute(text(insert_query), {
            "inventario_id": inventario_id,
            "tipo_alerta": tipo_alerta,
            "descripcion": descripcion
        })
        
        db.commit()
        nueva_alerta_id = result.fetchone()[0]
        
        logger.info(f"✅ Alerta creada para timer completado: {nueva_alerta_id}")
        
        # Publicar evento de alerta creada
        await publish_alert_created({
            "id": nueva_alerta_id,
            "tipo_alerta": tipo_alerta,
            "descripcion": descripcion,
            "rfid": rfid,
            "timestamp": datetime.now().isoformat()
        })
        
        db.close()
        
    except Exception as e:
        logger.error(f"❌ Error creando alerta para timer completado: {e}")

# --- Endpoints para Alertas ---

# Obtener todas las alertas
@app.get("/alertas/", response_model=List[AlertaSchema])
def get_alertas(
    inventario_id: Optional[int] = None, 
    resuelta: Optional[bool] = None, 
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    tenant_schema = get_tenant_schema(current_user)
    
    # Construir consulta SQL con el esquema del tenant
    base_query = f"""
        SELECT id, inventario_id, tipo_alerta, descripcion, fecha_creacion, resuelta, fecha_resolucion
        FROM {tenant_schema}.alertas
        WHERE 1=1
    """
    
    params = {}
    if inventario_id is not None:
        base_query += " AND inventario_id = :inventario_id"
        params["inventario_id"] = inventario_id
    
    if resuelta is not None:
        base_query += " AND resuelta = :resuelta"
        params["resuelta"] = resuelta
        
    base_query += " ORDER BY fecha_creacion DESC OFFSET :skip LIMIT :limit"
    params["skip"] = skip
    params["limit"] = limit
    
    result = db.execute(text(base_query), params)
    alertas = result.fetchall()
    
    # Convertir resultados a formato de respuesta
    alertas_response = []
    for alerta in alertas:
        alertas_response.append({
            "id": alerta[0],
            "inventario_id": alerta[1],
            "tipo_alerta": alerta[2],
            "descripcion": alerta[3],
            "fecha_creacion": alerta[4],
            "resuelta": alerta[5],
            "fecha_resolucion": alerta[6]
        })
    
    return alertas_response

# Obtener una alerta por ID
@app.get("/alertas/{alerta_id}", response_model=AlertaSchema)
def get_alerta(
    alerta_id: int, 
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    tenant_schema = get_tenant_schema(current_user)
    
    query = f"""
        SELECT id, inventario_id, tipo_alerta, descripcion, fecha_creacion, resuelta, fecha_resolucion
        FROM {tenant_schema}.alertas
        WHERE id = :alerta_id
    """
    
    result = db.execute(text(query), {"alerta_id": alerta_id})
    alerta = result.fetchone()
    
    if alerta is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alerta no encontrada"
        )
    
    return {
        "id": alerta[0],
        "inventario_id": alerta[1],
        "tipo_alerta": alerta[2],
        "descripcion": alerta[3],
        "fecha_creacion": alerta[4],
        "resuelta": alerta[5],
        "fecha_resolucion": alerta[6]
    }

# Crear una nueva alerta
@app.post("/alertas/", response_model=AlertaSchema, status_code=status.HTTP_201_CREATED)
def create_alerta(
    alerta: AlertaCreate, 
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    tenant_schema = get_tenant_schema(current_user)
    
    # Insertar la nueva alerta en el esquema del tenant
    query = f"""
        INSERT INTO {tenant_schema}.alertas (inventario_id, tipo_alerta, descripcion, fecha_creacion, resuelta)
        VALUES (:inventario_id, :tipo_alerta, :descripcion, NOW(), false)
        RETURNING id, inventario_id, tipo_alerta, descripcion, fecha_creacion, resuelta, fecha_resolucion
    """
    
    result = db.execute(text(query), {
        "inventario_id": alerta.inventario_id,
        "tipo_alerta": alerta.tipo_alerta,
        "descripcion": alerta.descripcion
    })
    
    db.commit()
    nueva_alerta = result.fetchone()
    
    return {
        "id": nueva_alerta[0],
        "inventario_id": nueva_alerta[1],
        "tipo_alerta": nueva_alerta[2],
        "descripcion": nueva_alerta[3],
        "fecha_creacion": nueva_alerta[4],
        "resuelta": nueva_alerta[5],
        "fecha_resolucion": nueva_alerta[6]
    }

# Actualizar una alerta (ej. para marcarla como resuelta)
@app.put("/alertas/{alerta_id}", response_model=AlertaSchema)
def update_alerta(
    alerta_id: int, 
    alerta: AlertaUpdate, 
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    tenant_schema = get_tenant_schema(current_user)
    
    # Primero verificar que la alerta existe
    check_query = f"""
        SELECT id FROM {tenant_schema}.alertas WHERE id = :alerta_id
    """
    
    result = db.execute(text(check_query), {"alerta_id": alerta_id})
    if result.fetchone() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alerta no encontrada"
        )
    
    # Construir la consulta de actualización dinámicamente
    update_fields = []
    params = {"alerta_id": alerta_id}
    
    if alerta.resuelta is not None:
        update_fields.append("resuelta = :resuelta")
        params["resuelta"] = alerta.resuelta
        if alerta.resuelta:
            update_fields.append("fecha_resolucion = NOW()")
    
    if alerta.descripcion is not None:
        update_fields.append("descripcion = :descripcion")
        params["descripcion"] = alerta.descripcion
    
    if not update_fields:
        # No hay nada que actualizar, devolver la alerta actual
        get_query = f"""
            SELECT id, inventario_id, tipo_alerta, descripcion, fecha_creacion, resuelta, fecha_resolucion
            FROM {tenant_schema}.alertas WHERE id = :alerta_id
        """
        result = db.execute(text(get_query), {"alerta_id": alerta_id})
        alerta_actual = result.fetchone()
    else:
        # Realizar la actualización
        update_query = f"""
            UPDATE {tenant_schema}.alertas 
            SET {', '.join(update_fields)}
            WHERE id = :alerta_id
            RETURNING id, inventario_id, tipo_alerta, descripcion, fecha_creacion, resuelta, fecha_resolucion
        """
        
        result = db.execute(text(update_query), params)
        db.commit()
        alerta_actual = result.fetchone()
    
    return {
        "id": alerta_actual[0],
        "inventario_id": alerta_actual[1],
        "tipo_alerta": alerta_actual[2],
        "descripcion": alerta_actual[3],
        "fecha_creacion": alerta_actual[4],
        "resuelta": alerta_actual[5],
        "fecha_resolucion": alerta_actual[6]
    }

# Eliminar una alerta
@app.delete("/alertas/{alerta_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_alerta(
    alerta_id: int, 
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    tenant_schema = get_tenant_schema(current_user)
    
    # Verificar que la alerta existe y eliminarla
    delete_query = f"""
        DELETE FROM {tenant_schema}.alertas 
        WHERE id = :alerta_id
        RETURNING id
    """
    
    result = db.execute(text(delete_query), {"alerta_id": alerta_id})
    deleted_alerta = result.fetchone()
    
    if deleted_alerta is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alerta no encontrada"
        )
    
    db.commit()
    return None

# Endpoint para verificar salud del servicio
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "alerts_service"}

# Endpoint de debug para verificar tenant del usuario
@app.get("/debug/tenant")
def debug_tenant(current_user: Dict[str, Any] = Depends(get_current_user_from_token)):
    tenant_schema = get_tenant_schema(current_user)
    return {
        "tenant_detectado": tenant_schema,
        "usuario": current_user.get('correo', 'unknown'),
        "datos_usuario": current_user,
        "timestamp": datetime.now().isoformat()
    }


if __name__ == "__main__":
    import uvicorn
    import os
    
    port = int(os.environ.get("PORT", 8004))
    uvicorn.run(app, host="0.0.0.0", port=port)

# Endpoint de debug para verificar consultas SQL por tenant
@app.get("/debug/query")
def debug_query_info(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    tenant_schema = get_tenant_schema(current_user)
    
    # Verificar qué alertas hay en cada esquema
    tenant_base_query = "SELECT id, descripcion FROM tenant_base.alertas ORDER BY id"
    tenant_brandon_query = "SELECT id, descripcion FROM tenant_brandon.alertas ORDER BY id"
    
    try:
        tenant_base_result = db.execute(text(tenant_base_query)).fetchall()
        tenant_base_alerts = [{"id": r[0], "descripcion": r[1]} for r in tenant_base_result]
    except Exception as e:
        tenant_base_alerts = f"Error: {str(e)}"
    
    try:
        tenant_brandon_result = db.execute(text(tenant_brandon_query)).fetchall()
        tenant_brandon_alerts = [{"id": r[0], "descripcion": r[1]} for r in tenant_brandon_result]
    except Exception as e:
        tenant_brandon_alerts = f"Error: {str(e)}"
    
    # La consulta que se usaría para este usuario
    user_query = f"SELECT id, descripcion FROM {tenant_schema}.alertas ORDER BY id"
    
    try:
        user_result = db.execute(text(user_query)).fetchall()
        user_alerts = [{"id": r[0], "descripcion": r[1]} for r in user_result]
    except Exception as e:
        user_alerts = f"Error: {str(e)}"
    
    return {
        "usuario": current_user.get('correo'),
        "tenant_detectado": tenant_schema,
        "consulta_sql": user_query,
        "alertas_tenant_base": tenant_base_alerts,
        "alertas_tenant_brandon": tenant_brandon_alerts,
        "alertas_usuario_actual": user_alerts,
        "timestamp": datetime.now().isoformat()
    }

# Endpoint para obtener estadísticas por tenant
@app.get("/estadisticas/")
def get_estadisticas_alertas(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    tenant_schema = get_tenant_schema(current_user)
    
    # Obtener estadísticas del tenant actual
    stats_query = f"""
        SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN resuelta = false THEN 1 END) as pendientes,
            COUNT(CASE WHEN resuelta = true THEN 1 END) as resueltas,
            COUNT(CASE WHEN fecha_creacion >= NOW() - INTERVAL '24 hours' THEN 1 END) as ultimas_24h
        FROM {tenant_schema}.alertas
    """
    
    result = db.execute(text(stats_query))
    stats = result.fetchone()
    
    return {
        "tenant": tenant_schema,
        "usuario": current_user.get('correo', 'unknown'),
        "estadisticas": {
            "total_alertas": stats[0],
            "alertas_pendientes": stats[1], 
            "alertas_resueltas": stats[2],
            "alertas_ultimas_24h": stats[3]
        },
        "timestamp": datetime.now().isoformat()
    }
