"""
Operaciones en lote optimizadas para el servicio de inventario.
Utiliza paralelismo y transacciones por lotes para mejorar la velocidad.
"""

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

class BulkOperations:
    def bulk_create_inventario(self, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Crea múltiples items de inventario en lote.
        Args:
            items: Lista de diccionarios con los datos de inventario
        Returns:
            Dict con resultados de la operación
        """
        if not items:
            return {"success": 0, "errors": [], "total": 0}
        success_count = 0
        errors = []
        batch_size = 50
        for i in range(0, len(items), batch_size):
            batch = items[i:i+batch_size]
            values_list = []
            for item in batch:
                nombre_unidad = item.get('nombre_unidad', '').replace("'", "''")
                rfid = item.get('rfid', '').replace("'", "''")
                lote = item.get('lote', '').replace("'", "''") if item.get('lote') else None
                estado = item.get('estado', '').replace("'", "''")
                sub_estado = item.get('sub_estado', '').replace("'", "''") if item.get('sub_estado') else None
                validacion_limpieza = item.get('validacion_limpieza', None)
                validacion_goteo = item.get('validacion_goteo', None)
                validacion_desinfeccion = item.get('validacion_desinfeccion', None)
                categoria = item.get('categoria', None)
                modelo_id = item.get('modelo_id')
                values = f"({modelo_id}, '{nombre_unidad}', '{rfid}', "
                values += f"'{lote}'" if lote else "NULL"
                values += f", '{estado}', "
                values += f"'{sub_estado}'" if sub_estado else "NULL"
                values += f", "
                values += f"'{validacion_limpieza}'" if validacion_limpieza else "NULL"
                values += f", "
                values += f"'{validacion_goteo}'" if validacion_goteo else "NULL"
                values += f", "
                values += f"'{validacion_desinfeccion}'" if validacion_desinfeccion else "NULL"
                values += f", "
                values += f"'{categoria}'" if categoria else "NULL"
                values += ")"
                values_list.append(values)
            values_str = ',\n'.join(values_list)
            insert_query = f"""
            INSERT INTO {self.tenant_schema}.inventario_credocubes 
            (modelo_id, nombre_unidad, rfid, lote, estado, sub_estado, 
             validacion_limpieza, validacion_goteo, validacion_desinfeccion, categoria)
            VALUES {values_str}
            """
            try:
                self.db.execute(text(insert_query))
                self.db.commit()
                success_count += len(batch)
            except Exception as e:
                self.db.rollback()
                errors.append(str(e))
        return {"success": success_count, "errors": errors, "total": len(items)}
    def __init__(self, db: Session, tenant_schema: str):
        self.db = db
        self.tenant_schema = tenant_schema
        self.max_workers = 5  # Limitar para evitar sobrecarga de DB
        
    def bulk_update_states(self, updates: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Actualiza múltiples items en lotes para mejorar performance.
        
        Args:
            updates: Lista de diccionarios con {id, estado, sub_estado, ...}
            
        Returns:
            Dict con resultados de la operación
        """
        if not updates:
            return {"success": 0, "errors": []}
            
        logger.info(f"🚀 Iniciando actualización en lote de {len(updates)} items")
        
        success_count = 0
        errors = []
        
        try:
            # Procesar en lotes de 50 items para evitar queries muy grandes
            batch_size = 50
            
            for i in range(0, len(updates), batch_size):
                batch = updates[i:i + batch_size]
                
                try:
                    # Construir query de actualización múltiple usando CASE statements
                    update_query = self._build_bulk_update_query(batch)
                    
                    # Ejecutar la actualización en lote
                    result = self.db.execute(text(update_query))
                    self.db.commit()
                    
                    success_count += len(batch)
                    logger.info(f"✅ Lote {i//batch_size + 1}: {len(batch)} items actualizados")
                    
                except Exception as e:
                    self.db.rollback()
                    logger.error(f"❌ Error en lote {i//batch_size + 1}: {str(e)}")
                    errors.append(f"Lote {i//batch_size + 1}: {str(e)}")
                    
            return {
                "success": success_count,
                "errors": errors,
                "total": len(updates)
            }
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"❌ Error crítico en bulk_update_states: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error en actualización masiva: {str(e)}"
            )
    
    def _build_bulk_update_query(self, batch: List[Dict[str, Any]]) -> str:
        """Construye una query de actualización múltiple usando CASE statements."""
        
        if not batch:
            return ""
            
        # Extraer IDs para la cláusula WHERE
        ids = [str(item['id']) for item in batch]
        ids_str = ','.join(ids)
        
        # Construir CASE statements para cada campo
        estado_cases = []
        sub_estado_cases = []
        
        for item in batch:
            item_id = item['id']
            estado = item.get('estado', '')
            sub_estado = item.get('sub_estado', '')
            
            if estado:
                estado_cases.append(f"WHEN id = {item_id} THEN '{estado}'")
            if sub_estado:
                sub_estado_cases.append(f"WHEN id = {item_id} THEN '{sub_estado}'")
        
        # Construir la query de UPDATE
        query = f"""
        UPDATE {self.tenant_schema}.inventario_credocubes 
        SET 
            ultima_actualizacion = CURRENT_TIMESTAMP
        """
        
        if estado_cases:
            query += f",\n            estado = CASE {' '.join(estado_cases)} ELSE estado END"
            
        if sub_estado_cases:
            query += f",\n            sub_estado = CASE {' '.join(sub_estado_cases)} ELSE sub_estado END"
            
        query += f"\n        WHERE id IN ({ids_str})"
        
        return query
    
    def bulk_create_activities(self, activities: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Crea múltiples actividades en paralelo para mejorar performance.
        
        Args:
            activities: Lista de actividades a crear
            
        Returns:
            Dict con resultados de la operación
        """
        if not activities:
            return {"success": 0, "errors": []}
            
        logger.info(f"🚀 Iniciando creación en lote de {len(activities)} actividades")
        
        success_count = 0
        errors = []
        
        try:
            # Procesar en lotes para evitar sobrecargar la DB
            batch_size = 100
            
            for i in range(0, len(activities), batch_size):
                batch = activities[i:i + batch_size]
                
                try:
                    # Construir query de inserción múltiple
                    insert_query = self._build_bulk_insert_activities_query(batch)
                    
                    # Ejecutar la inserción en lote
                    self.db.execute(text(insert_query))
                    self.db.commit()
                    
                    success_count += len(batch)
                    logger.info(f"✅ Lote {i//batch_size + 1}: {len(batch)} actividades creadas")
                    
                except Exception as e:
                    self.db.rollback()
                    logger.error(f"❌ Error en lote de actividades {i//batch_size + 1}: {str(e)}")
                    errors.append(f"Lote {i//batch_size + 1}: {str(e)}")
                    
            return {
                "success": success_count,
                "errors": errors,
                "total": len(activities)
            }
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"❌ Error crítico en bulk_create_activities: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error en creación masiva de actividades: {str(e)}"
            )
    
    def _build_bulk_insert_activities_query(self, activities: List[Dict[str, Any]]) -> str:
        """Construye una query de inserción múltiple para actividades."""
        
        if not activities:
            return ""
            
        # Construir VALUES para inserción múltiple
        values_list = []
        
        for activity in activities:
            inventario_id = activity.get('inventario_id', 'NULL')
            usuario_id = activity.get('usuario_id', 1)
            descripcion = activity.get('descripcion', '').replace("'", "''")  # Escapar comillas
            estado_nuevo = activity.get('estado_nuevo', '').replace("'", "''")
            sub_estado_nuevo = activity.get('sub_estado_nuevo', '').replace("'", "''") if activity.get('sub_estado_nuevo') else 'NULL'
            
            sub_estado_value = f"'{sub_estado_nuevo}'" if sub_estado_nuevo != 'NULL' else 'NULL'
            values = f"({inventario_id}, {usuario_id}, '{descripcion}', '{estado_nuevo}', {sub_estado_value}, CURRENT_TIMESTAMP)"
            values_list.append(values)
        
        values_str = ',\n            '.join(values_list)
        
        query = f"""
        INSERT INTO {self.tenant_schema}.actividades_operacion 
            (inventario_id, usuario_id, descripcion, estado_nuevo, sub_estado_nuevo, timestamp)
        VALUES 
            {values_str}
        """
        
        return query

class AsyncBulkOperations:
    """Versión asíncrona para operaciones que pueden ejecutarse en paralelo."""
    
    def __init__(self, tenant_schema: str):
        self.tenant_schema = tenant_schema
        self.max_workers = 8
    
    async def parallel_state_updates(self, 
                                   updates: List[Dict[str, Any]], 
                                   create_activity_func,
                                   update_inventory_func) -> Dict[str, Any]:
        """
        Ejecuta actualizaciones de estado e inventario en paralelo.
        
        Args:
            updates: Lista de actualizaciones a realizar
            create_activity_func: Función para crear actividades
            update_inventory_func: Función para actualizar inventario
            
        Returns:
            Dict con resultados de la operación
        """
        logger.info(f"🚀 Iniciando operaciones paralelas para {len(updates)} items")
        
        success_count = 0
        errors = []
        
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            # Crear tareas para actividades e inventario por separado
            activity_futures = []
            inventory_futures = []
            
            for update in updates:
                # Crear actividad
                if 'activity_data' in update:
                    activity_future = executor.submit(create_activity_func, update['activity_data'])
                    activity_futures.append((activity_future, update['id']))
                
                # Actualizar inventario
                if 'inventory_data' in update:
                    inventory_future = executor.submit(
                        update_inventory_func, 
                        update['id'], 
                        update['inventory_data']
                    )
                    inventory_futures.append((inventory_future, update['id']))
            
            # Procesar resultados de actividades
            for future, item_id in activity_futures:
                try:
                    result = future.result(timeout=30)  # Timeout de 30 segundos
                    logger.debug(f"✅ Actividad creada para item {item_id}")
                except Exception as e:
                    logger.error(f"❌ Error creando actividad para item {item_id}: {str(e)}")
                    errors.append(f"Actividad {item_id}: {str(e)}")
            
            # Procesar resultados de inventario
            for future, item_id in inventory_futures:
                try:
                    result = future.result(timeout=30)  # Timeout de 30 segundos
                    success_count += 1
                    logger.debug(f"✅ Inventario actualizado para item {item_id}")
                except Exception as e:
                    logger.error(f"❌ Error actualizando inventario para item {item_id}: {str(e)}")
                    errors.append(f"Inventario {item_id}: {str(e)}")
        
        return {
            "success": success_count,
            "errors": errors,
            "total": len(updates)
        }

def optimize_database_connection(db: Session):
    """Optimiza la conexión de base de datos para operaciones en lote."""
    try:
        # Configurar parámetros de conexión para mejor performance
        db.execute(text("SET synchronous_commit = OFF"))  # PostgreSQL
        db.execute(text("SET wal_buffers = '16MB'"))  # PostgreSQL
        db.execute(text("SET checkpoint_segments = 32"))  # PostgreSQL (versiones anteriores)
        logger.info("✅ Conexión de DB optimizada para operaciones en lote")
    except Exception as e:
        logger.warning(f"⚠️ No se pudieron aplicar todas las optimizaciones de DB: {str(e)}")
