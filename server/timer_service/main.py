#!/usr/bin/env python3
"""
Servicio de Temporizadores - KryotecSense
Gestiona temporizadores sincronizados en tiempo real vía WebSockets
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Set
import uuid
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Los timers son datos temporales - no requieren persistencia

def get_utc_now():
    """Obtener tiempo UTC actual con zona horaria"""
    return datetime.now(timezone.utc)

def parse_iso_datetime(iso_string):
    """Parsear string ISO a datetime con zona horaria UTC"""
    try:
        # Si ya tiene zona horaria, usarla
        if iso_string.endswith('Z'):
            iso_string = iso_string[:-1] + '+00:00'
        
        dt = datetime.fromisoformat(iso_string)
        
        # Si no tiene zona horaria, asumir UTC
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        
        return dt
    except Exception as e:
        logger.error(f"Error parseando fecha {iso_string}: {e}")
        return get_utc_now()

app = FastAPI(
    title="Timer Service",
    description="Servicio de temporizadores sincronizados en tiempo real",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Modelos
class Timer(BaseModel):
    id: str
    nombre: str
    tipoOperacion: str = Field(..., description="Tipo: congelamiento, atemperamiento, envio")
    tiempoInicialMinutos: int
    tiempoRestanteSegundos: int
    fechaInicio: datetime
    fechaFin: datetime
    activo: bool = True
    completado: bool = False
    
    def to_dict(self):
        """Convertir a diccionario con fechas en formato ISO string"""
        return {
            "id": self.id,
            "nombre": self.nombre,
            "tipoOperacion": self.tipoOperacion,
            "tiempoInicialMinutos": self.tiempoInicialMinutos,
            "tiempoRestanteSegundos": self.tiempoRestanteSegundos,
            "fechaInicio": self.fechaInicio.isoformat() if isinstance(self.fechaInicio, datetime) else self.fechaInicio,
            "fechaFin": self.fechaFin.isoformat() if isinstance(self.fechaFin, datetime) else self.fechaFin,
            "activo": self.activo,
            "completado": self.completado
        }

class WebSocketMessage(BaseModel):
    type: str
    data: Dict

# Estado global de timers y conexiones
class TimerManager:
    def __init__(self):
        self.timers: Dict[str, Timer] = {}
        self.connections: Set[WebSocket] = set()
        self.running = True
        # NO cargar timers desde archivo - son datos temporales
        
    # MÉTODOS ELIMINADOS - Los timers no se persisten
    # Los timers son datos temporales que solo existen en memoria
        
    async def add_connection(self, websocket: WebSocket):
        """Agregar nueva conexión WebSocket"""
        self.connections.add(websocket)
        logger.info(f"Nueva conexión WebSocket. Total: {len(self.connections)}")
        
        # Enviar timers existentes al cliente recién conectado
        await self.send_to_client(websocket, {
            "type": "TIMER_SYNC",
            "data": {
                "timers": [timer.to_dict() for timer in self.timers.values()]
            }
        })
        
    async def remove_connection(self, websocket: WebSocket):
        """Remover conexión WebSocket"""
        self.connections.discard(websocket)
        logger.info(f"Conexión WebSocket removida. Total: {len(self.connections)}")
        
    async def send_to_client(self, websocket: WebSocket, message: Dict):
        """Enviar mensaje a un cliente específico"""
        try:
            await websocket.send_text(json.dumps(message))
        except Exception as e:
            logger.error(f"Error enviando mensaje a cliente: {e}")
            await self.remove_connection(websocket)
            
    async def broadcast(self, message: Dict, exclude: Optional[WebSocket] = None):
        """Enviar mensaje a todos los clientes conectados"""
        disconnected = set()
        
        for connection in self.connections:
            if connection == exclude:
                continue
                
            try:
                await connection.send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error en broadcast: {e}")
                disconnected.add(connection)
                
        # Remover conexiones desconectadas
        for conn in disconnected:
            await self.remove_connection(conn)
            
    async def create_timer(self, timer_data: Dict, websocket: Optional[WebSocket] = None):
        """Crear nuevo temporizador"""
        # Verificar si el timer ya existe para evitar duplicados
        timer_id = timer_data.get('id')
        if timer_id and timer_id in self.timers:
            logger.info(f"Timer ya existe, actualizando: {timer_id}")
            await self.update_timer(timer_id, timer_data, websocket)
            return
        
        # Convertir fechas string a datetime con zona horaria
        if 'fechaInicio' in timer_data and isinstance(timer_data['fechaInicio'], str):
            timer_data['fechaInicio'] = parse_iso_datetime(timer_data['fechaInicio'])
        if 'fechaFin' in timer_data and isinstance(timer_data['fechaFin'], str):
            timer_data['fechaFin'] = parse_iso_datetime(timer_data['fechaFin'])
        
        timer = Timer(**timer_data)
        self.timers[timer.id] = timer
        
        logger.info(f"Timer creado: {timer.nombre} ({timer.id})")
        
        # Broadcast a todos los clientes excepto el que envió
        await self.broadcast({
            "type": "TIMER_CREATED",
            "data": {"timer": timer.to_dict()}
        }, exclude=websocket)
        
    async def update_timer(self, timer_id: str, updates: Dict, websocket: Optional[WebSocket] = None):
        """Actualizar temporizador existente"""
        if timer_id not in self.timers:
            logger.warning(f"Timer no encontrado: {timer_id}")
            return False
            
        timer = self.timers[timer_id]
        for key, value in updates.items():
            if hasattr(timer, key):
                setattr(timer, key, value)
                
        logger.info(f"Timer actualizado: {timer.nombre} ({timer_id})")
        
        # Broadcast a todos los clientes excepto el que envió
        await self.broadcast({
            "type": "TIMER_UPDATED",
            "data": {"timer": timer.to_dict()}
        }, exclude=websocket)
        
        return True
        
    async def delete_timer(self, timer_id: str, websocket: Optional[WebSocket] = None):
        """Eliminar temporizador"""
        if timer_id in self.timers:
            timer = self.timers.pop(timer_id)
            
            logger.info(f"Timer eliminado: {timer.nombre} ({timer_id})")
            
            # Broadcast a todos los clientes excepto el que envió
            await self.broadcast({
                "type": "TIMER_DELETED",
                "data": {"timerId": timer_id}
            }, exclude=websocket)
            
            return True
        return False
        
    async def pause_timer(self, timer_id: str, websocket: Optional[WebSocket] = None):
        """Pausar temporizador"""
        return await self.update_timer(timer_id, {"activo": False}, websocket)
        
    async def resume_timer(self, timer_id: str, websocket: Optional[WebSocket] = None):
        """Reanudar temporizador"""
        if timer_id not in self.timers:
            return False
            
        timer = self.timers[timer_id]
        if not timer.completado:
            return await self.update_timer(timer_id, {"activo": True}, websocket)
        return False
        
    async def tick_timers(self):
        """Actualizar todos los timers activos cada segundo"""
        save_counter = 0
        while self.running:
            try:
                current_time = get_utc_now()
                updated_timers = []
                timers_changed = False
                
                for timer_id, timer in self.timers.items():
                    if not timer.activo or timer.completado:
                        continue
                        
                    # Calcular tiempo restante basado en fecha fin
                    tiempo_restante_ms = (timer.fechaFin - current_time).total_seconds()
                    nuevo_tiempo_restante = max(0, int(tiempo_restante_ms))
                    
                    # Actualizar timer si hay cambio
                    if nuevo_tiempo_restante != timer.tiempoRestanteSegundos:
                        timer.tiempoRestanteSegundos = nuevo_tiempo_restante
                        timers_changed = True
                        
                        # Verificar si se completó
                        if nuevo_tiempo_restante == 0 and not timer.completado:
                            timer.completado = True
                            timer.activo = False
                            logger.info(f"Timer completado: {timer.nombre} ({timer_id})")
                    
                    # SIEMPRE enviar actualización para timers activos
                    # Esto garantiza que el frontend se mantenga sincronizado
                    updated_timers.append({
                        "timerId": timer_id,
                        "tiempoRestanteSegundos": timer.tiempoRestanteSegundos,
                        "completado": timer.completado,
                        "activo": timer.activo
                    })
                
                # Enviar actualizaciones para todos los timers activos
                if updated_timers:
                    for update in updated_timers:
                        await self.broadcast({
                            "type": "TIMER_TIME_UPDATE",
                            "data": update
                        })
                
                # Guardar cambios esporádicamente no es necesario
                # Los timers son datos temporales
                
                await asyncio.sleep(1)  # Actualizar cada segundo
                
            except Exception as e:
                logger.error(f"Error en tick_timers: {e}")
                await asyncio.sleep(1)

# Instancia global del manager
timer_manager = TimerManager()

@app.on_event("startup")
async def startup_event():
    """Iniciar el loop de actualización de timers"""
    asyncio.create_task(timer_manager.tick_timers())
    logger.info("Servicio de timers iniciado")

@app.on_event("shutdown")
async def shutdown_event():
    """Detener el servicio"""
    timer_manager.running = False
    logger.info("Servicio de timers detenido")

@app.websocket("/ws/timers")
async def websocket_endpoint(websocket: WebSocket):
    """Endpoint principal de WebSocket para timers"""
    await websocket.accept()
    await timer_manager.add_connection(websocket)
    
    try:
        while True:
            # Recibir mensaje del cliente
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # logger.info(f"Mensaje recibido: {message.get('type', 'UNKNOWN')}")
            
            # Procesar mensaje según tipo
            message_type = message.get("type")
            message_data = message.get("data", {})
            
            if message_type == "REQUEST_SYNC":
                # Cliente solicita sincronización completa
                await timer_manager.send_to_client(websocket, {
                    "type": "TIMER_SYNC",
                    "data": {
                        "timers": [timer.to_dict() for timer in timer_manager.timers.values()]
                    }
                })
                
            elif message_type == "CREATE_TIMER":
                timer_data = message_data.get("timer")
                if timer_data:
                    await timer_manager.create_timer(timer_data, websocket)
                    
            elif message_type == "PAUSE_TIMER":
                timer_id = message_data.get("timerId")
                if timer_id:
                    await timer_manager.pause_timer(timer_id, websocket)
                    
            elif message_type == "RESUME_TIMER":
                timer_id = message_data.get("timerId")
                if timer_id:
                    await timer_manager.resume_timer(timer_id, websocket)
                    
            elif message_type == "DELETE_TIMER":
                timer_id = message_data.get("timerId")
                if timer_id:
                    await timer_manager.delete_timer(timer_id, websocket)
                    
            else:
                logger.warning(f"Tipo de mensaje no reconocido: {message_type}")
                
    except WebSocketDisconnect:
        logger.info("Cliente desconectado")
    except Exception as e:
        logger.error(f"Error en WebSocket: {e}")
    finally:
        await timer_manager.remove_connection(websocket)

@app.get("/health")
async def health_check():
    """Endpoint de salud"""
    return {
        "status": "healthy",
        "timers_count": len(timer_manager.timers),
        "connections_count": len(timer_manager.connections),
        "timestamp": get_utc_now().isoformat()
    }

@app.get("/timers")
async def get_timers():
    """Obtener todos los timers (REST API)"""
    return {
        "timers": [timer.to_dict() for timer in timer_manager.timers.values()],
        "count": len(timer_manager.timers)
    }

if __name__ == "__main__":
    # Allow PORT to be provided by the platform (e.g., Railway)
    port = int(os.environ.get("PORT", 8006))
    # Ejecutar usando el objeto app directamente para evitar problemas de import
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        reload=False,
        log_level="info"
    )
