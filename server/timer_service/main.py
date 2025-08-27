#!/usr/bin/env python3
"""
Servicio de Temporizadores - KryotecSense
Gestiona temporizadores sincronizados en tiempo real vía WebSockets
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set
import uuid
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Archivo de persistencia
TIMERS_FILE = "timers_data.json"

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

class WebSocketMessage(BaseModel):
    type: str
    data: Dict

# Estado global de timers y conexiones
class TimerManager:
    def __init__(self):
        self.timers: Dict[str, Timer] = {}
        self.connections: Set[WebSocket] = set()
        self.running = True
        # Cargar timers existentes al inicializar
        self.load_timers_from_file()
        
    def save_timers_to_file(self):
        """Guardar timers en archivo JSON"""
        try:
            timers_data = {}
            for timer_id, timer in self.timers.items():
                timers_data[timer_id] = {
                    "id": timer.id,
                    "nombre": timer.nombre,
                    "tipoOperacion": timer.tipoOperacion,
                    "tiempoInicialMinutos": timer.tiempoInicialMinutos,
                    "tiempoRestanteSegundos": timer.tiempoRestanteSegundos,
                    "fechaInicio": timer.fechaInicio.isoformat(),
                    "fechaFin": timer.fechaFin.isoformat(),
                    "activo": timer.activo,
                    "completado": timer.completado
                }
            
            with open(TIMERS_FILE, 'w') as f:
                json.dump(timers_data, f, indent=2)
            logger.info(f"Timers guardados en {TIMERS_FILE}: {len(timers_data)} timers")
        except Exception as e:
            logger.error(f"Error guardando timers: {e}")
    
    def load_timers_from_file(self):
        """Cargar timers desde archivo JSON"""
        if not os.path.exists(TIMERS_FILE):
            logger.info(f"Archivo {TIMERS_FILE} no existe, iniciando sin timers")
            return
            
        try:
            with open(TIMERS_FILE, 'r') as f:
                timers_data = json.load(f)
            
            for timer_id, timer_dict in timers_data.items():
                timer_dict['fechaInicio'] = datetime.fromisoformat(timer_dict['fechaInicio'])
                timer_dict['fechaFin'] = datetime.fromisoformat(timer_dict['fechaFin'])
                
                # Recalcular tiempo restante basado en tiempo actual
                current_time = datetime.utcnow()
                tiempo_restante_ms = (timer_dict['fechaFin'] - current_time).total_seconds()
                timer_dict['tiempoRestanteSegundos'] = max(0, int(tiempo_restante_ms))
                
                # Actualizar estado basado en tiempo restante
                if timer_dict['tiempoRestanteSegundos'] == 0 and not timer_dict['completado']:
                    timer_dict['completado'] = True
                    timer_dict['activo'] = False
                
                timer = Timer(**timer_dict)
                self.timers[timer_id] = timer
            
            logger.info(f"Timers cargados desde {TIMERS_FILE}: {len(self.timers)} timers")
        except Exception as e:
            logger.error(f"Error cargando timers: {e}")
        
        self.load_timers_from_file()
        
    def save_timers_to_file(self):
        """Guardar timers en archivo JSON"""
        try:
            timers_data = {}
            for timer_id, timer in self.timers.items():
                timers_data[timer_id] = {
                    "id": timer.id,
                    "nombre": timer.nombre,
                    "tipoOperacion": timer.tipoOperacion,
                    "tiempoInicialMinutos": timer.tiempoInicialMinutos,
                    "tiempoRestanteSegundos": timer.tiempoRestanteSegundos,
                    "fechaInicio": timer.fechaInicio.isoformat(),
                    "fechaFin": timer.fechaFin.isoformat(),
                    "activo": timer.activo,
                    "completado": timer.completado
                }
            
            with open(TIMERS_FILE, 'w') as f:
                json.dump(timers_data, f, indent=2)
            logger.info(f"Timers guardados en archivo: {len(timers_data)} timers")
        except Exception as e:
            logger.error(f"Error guardando timers: {e}")
    
    def load_timers_from_file(self):
        """Cargar timers desde archivo JSON"""
        try:
            if os.path.exists(TIMERS_FILE):
                with open(TIMERS_FILE, 'r') as f:
                    timers_data = json.load(f)
                
                current_time = datetime.utcnow()
                for timer_id, timer_dict in timers_data.items():
                    # Recalcular tiempo restante basado en fechas
                    fecha_fin = datetime.fromisoformat(timer_dict['fechaFin'])
                    tiempo_restante_ms = (fecha_fin - current_time).total_seconds()
                    nuevo_tiempo_restante = max(0, int(tiempo_restante_ms))
                    
                    timer = Timer(
                        id=timer_dict['id'],
                        nombre=timer_dict['nombre'],
                        tipoOperacion=timer_dict['tipoOperacion'],
                        tiempoInicialMinutos=timer_dict['tiempoInicialMinutos'],
                        tiempoRestanteSegundos=nuevo_tiempo_restante,
                        fechaInicio=datetime.fromisoformat(timer_dict['fechaInicio']),
                        fechaFin=datetime.fromisoformat(timer_dict['fechaFin']),
                        activo=nuevo_tiempo_restante > 0 and timer_dict['activo'],
                        completado=nuevo_tiempo_restante == 0 or timer_dict['completado']
                    )
                    
                    self.timers[timer_id] = timer
                
                logger.info(f"Timers cargados desde archivo: {len(self.timers)} timers")
            else:
                logger.info("No se encontró archivo de timers, iniciando con estado vacío")
        except Exception as e:
            logger.error(f"Error cargando timers: {e}")
            self.timers = {}
        
    async def add_connection(self, websocket: WebSocket):
        """Agregar nueva conexión WebSocket"""
        self.connections.add(websocket)
        logger.info(f"Nueva conexión WebSocket. Total: {len(self.connections)}")
        
        # Enviar timers existentes al cliente recién conectado
        await self.send_to_client(websocket, {
            "type": "TIMER_SYNC",
            "data": {
                "timers": [timer.dict() for timer in self.timers.values()]
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
        
        timer = Timer(**timer_data)
        self.timers[timer.id] = timer
        
        # Guardar en archivo
        self.save_timers_to_file()
        
        logger.info(f"Timer creado: {timer.nombre} ({timer.id})")
        
        # Broadcast a todos los clientes excepto el que envió
        await self.broadcast({
            "type": "TIMER_CREATED",
            "data": {"timer": timer.dict()}
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
        
        # Guardar en archivo
        self.save_timers_to_file()
                
        logger.info(f"Timer actualizado: {timer.nombre} ({timer_id})")
        
        # Broadcast a todos los clientes excepto el que envió
        await self.broadcast({
            "type": "TIMER_UPDATED",
            "data": {"timer": timer.dict()}
        }, exclude=websocket)
        
        return True
        
    async def delete_timer(self, timer_id: str, websocket: Optional[WebSocket] = None):
        """Eliminar temporizador"""
        if timer_id in self.timers:
            timer = self.timers.pop(timer_id)
            
            # Guardar en archivo
            self.save_timers_to_file()
            
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
                current_time = datetime.utcnow()
                updated_timers = []
                timers_changed = False
                
                for timer_id, timer in self.timers.items():
                    if not timer.activo or timer.completado:
                        continue
                        
                    # Calcular tiempo restante basado en fecha fin
                    tiempo_restante_ms = (timer.fechaFin - current_time).total_seconds()
                    nuevo_tiempo_restante = max(0, int(tiempo_restante_ms))
                    
                    if nuevo_tiempo_restante != timer.tiempoRestanteSegundos:
                        timer.tiempoRestanteSegundos = nuevo_tiempo_restante
                        timers_changed = True
                        
                        # Verificar si se completó
                        if nuevo_tiempo_restante == 0 and not timer.completado:
                            timer.completado = True
                            timer.activo = False
                            logger.info(f"Timer completado: {timer.nombre} ({timer_id})")
                            
                        updated_timers.append({
                            "timerId": timer_id,
                            "tiempoRestanteSegundos": nuevo_tiempo_restante,
                            "completado": timer.completado,
                            "activo": timer.activo
                        })
                
                # Enviar actualizaciones si hay cambios
                if updated_timers:
                    for update in updated_timers:
                        await self.broadcast({
                            "type": "TIMER_TIME_UPDATE",
                            "data": update
                        })
                
                # Guardar en archivo cada 30 segundos si hay cambios
                save_counter += 1
                if timers_changed and save_counter >= 30:
                    self.save_timers_to_file()
                    save_counter = 0
                
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
    """Detener el servicio y guardar timers"""
    timer_manager.running = False
    timer_manager.save_timers_to_file()
    logger.info("Servicio de timers detenido y timers guardados")

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
                        "timers": [timer.dict() for timer in timer_manager.timers.values()]
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
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/timers")
async def get_timers():
    """Obtener todos los timers (REST API)"""
    return {
        "timers": [timer.dict() for timer in timer_manager.timers.values()],
        "count": len(timer_manager.timers)
    }

if __name__ == "__main__":
    # Allow PORT to be provided by the platform (e.g., Railway)
    port = int(os.environ.get("PORT", 8006))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        log_level="info"
    )
