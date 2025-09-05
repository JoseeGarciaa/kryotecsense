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
from shared.message_queue import message_queue

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_utc_now():
    """Obtener tiempo UTC actual con zona horaria"""
    return datetime.now(timezone.utc)

def get_aligned_time(base_time: datetime = None) -> datetime:
    """
    Obtener tiempo alineado al siguiente segundo completo
    Esto asegura que todos los timers creados en lote inicien al mismo segundo
    """
    if base_time is None:
        base_time = get_utc_now()
    
    # Redondear hacia arriba al siguiente segundo
    microseconds_to_next = 1000000 - base_time.microsecond
    if microseconds_to_next < 100000:  # Si estamos muy cerca del siguiente segundo
        # Saltar al segundo después del siguiente
        return base_time.replace(microsecond=0) + timedelta(seconds=2)
    else:
        return base_time.replace(microsecond=0) + timedelta(seconds=1)

def parse_iso_datetime(iso_string):
    """Parsear string ISO a datetime con zona horaria UTC"""
    try:
        if iso_string.endswith('Z'):
            iso_string = iso_string[:-1] + '+00:00'
        
        dt = datetime.fromisoformat(iso_string)
        
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
    tiempoPausadoSegundos: Optional[int] = None
    
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
            "completado": self.completado,
            "tiempoPausadoSegundos": self.tiempoPausadoSegundos
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
        self.server_start_time = get_utc_now()
        self.instance_id = str(uuid.uuid4())
        self.last_tick_time = get_utc_now()
        
    def get_server_timestamp(self):
        """Obtener timestamp del servidor en milisegundos"""
        return int(get_utc_now().timestamp() * 1000)
        
    def calculate_remaining_time(self, timer: Timer) -> int:
        """Calcular tiempo restante basado en el estado del timer"""
        # Si está pausado, retornar el tiempo guardado cuando se pausó
        if not timer.activo:
            if timer.tiempoPausadoSegundos is not None:
                return max(0, timer.tiempoPausadoSegundos)
            return max(0, timer.tiempoRestanteSegundos)
        
        # Si está activo, calcular basado en fechaFin
        server_now = get_utc_now()
        if timer.fechaFin <= server_now:
            return 0
        
        remaining_seconds = int((timer.fechaFin - server_now).total_seconds())
        return max(0, remaining_seconds)
        
    async def add_connection(self, websocket: WebSocket):
        """Agregar nueva conexión WebSocket"""
        self.connections.add(websocket)
        logger.info(f"Nueva conexión WebSocket. Total: {len(self.connections)}")
        
        # Enviar estado actual con tiempo del servidor
        server_timestamp = self.get_server_timestamp()
        timers_data = []
        
        for timer in self.timers.values():
            remaining_time = self.calculate_remaining_time(timer)
            timers_data.append({
                **timer.to_dict(),
                "server_remaining_time": remaining_time,
                "server_timestamp": server_timestamp
            })
        
        await self.send_to_client(websocket, {
            "type": "TIMER_SYNC",
            "data": {
                "timers": timers_data,
                "server_timestamp": server_timestamp
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
                
        for conn in disconnected:
            await self.remove_connection(conn)
            
    async def create_timer(self, timer_data: Dict, websocket: Optional[WebSocket] = None, 
                          aligned_start: Optional[datetime] = None):
        """
        Crear nuevo temporizador basado en tiempo del servidor
        aligned_start: Si se proporciona, usar este tiempo alineado para sincronizar con otros timers
        """
        timer_id = timer_data.get('id', str(uuid.uuid4()))
        
        if timer_id in self.timers:
            logger.info(f"Timer ya existe, actualizando: {timer_id}")
            await self.update_timer(timer_id, timer_data, websocket)
            return
        
        # Usar tiempo alineado si se proporciona, sino crear uno nuevo
        if aligned_start:
            server_now = aligned_start
        else:
            server_now = get_aligned_time()
            
        duracion_minutos = timer_data.get('tiempoInicialMinutos', 0)
        
        # Asegurar que tenemos todos los campos necesarios
        timer_data['id'] = timer_id
        timer_data['fechaInicio'] = server_now
        timer_data['fechaFin'] = server_now + timedelta(minutes=duracion_minutos)
        timer_data['tiempoRestanteSegundos'] = duracion_minutos * 60
        timer_data['activo'] = True
        timer_data['completado'] = False
        timer_data['tiempoPausadoSegundos'] = None
        
        # Asegurar campos requeridos
        timer_data['nombre'] = timer_data.get('nombre', f'Timer {timer_id[:8]}')
        timer_data['tipoOperacion'] = timer_data.get('tipoOperacion', 'congelamiento')
        
        timer = Timer(**timer_data)
        self.timers[timer.id] = timer
        
        logger.info(f"Timer creado: {timer.nombre} ({timer.id}) - {duracion_minutos} minutos - Inicio: {server_now.isoformat()}")
        
        server_timestamp = self.get_server_timestamp()
        await self.broadcast({
            "type": "TIMER_CREATED",
            "data": {
                "timer": {
                    **timer.to_dict(),
                    "server_timestamp": server_timestamp
                }
            }
        }, exclude=websocket)

        try:
            await message_queue.publish_fanout("timers.events", {
                "event": "TIMER_CREATED",
                "origin": self.instance_id,
                "timer": timer.to_dict(),
                "server_timestamp": server_timestamp
            })
        except Exception as e:
            logger.error(f"MQ publish TIMER_CREATED error: {e}")
            
    async def create_timers_batch(self, timers_data: List[Dict], websocket: Optional[WebSocket] = None):
        """
        Crear múltiples timers sincronizados con el mismo tiempo de inicio
        """
        if not timers_data:
            return
            
        # Obtener un tiempo alineado único para todos los timers del lote
        aligned_start = get_aligned_time()
        logger.info(f"Creando lote de {len(timers_data)} timers con inicio sincronizado: {aligned_start.isoformat()}")
        
        # Crear todos los timers con el mismo tiempo de inicio
        for timer_data in timers_data:
            await self.create_timer(timer_data, websocket, aligned_start)
        
    async def update_timer(self, timer_id: str, updates: Dict, websocket: Optional[WebSocket] = None):
        """Actualizar temporizador existente"""
        if timer_id not in self.timers:
            logger.warning(f"Timer no encontrado: {timer_id}")
            return False
            
        timer = self.timers[timer_id]
        
        for key, value in updates.items():
            if hasattr(timer, key):
                # Convertir fechas si es necesario
                if key in ['fechaInicio', 'fechaFin'] and isinstance(value, str):
                    value = parse_iso_datetime(value)
                setattr(timer, key, value)
                
        logger.info(f"Timer actualizado: {timer.nombre} ({timer_id})")
        
        await self.broadcast({
            "type": "TIMER_UPDATED",
            "data": {"timer": timer.to_dict()}
        }, exclude=websocket)

        try:
            await message_queue.publish_fanout("timers.events", {
                "event": "TIMER_UPDATED",
                "origin": self.instance_id,
                "timer": timer.to_dict()
            })
        except Exception as e:
            logger.error(f"MQ publish TIMER_UPDATED error: {e}")
        
        return True
        
    async def delete_timer(self, timer_id: str, websocket: Optional[WebSocket] = None):
        """Eliminar temporizador"""
        if timer_id in self.timers:
            timer = self.timers.pop(timer_id)
            
            logger.info(f"Timer eliminado: {timer.nombre} ({timer_id})")
            
            await self.broadcast({
                "type": "TIMER_DELETED",
                "data": {"timerId": timer_id}
            }, exclude=websocket)

            try:
                await message_queue.publish_fanout("timers.events", {
                    "event": "TIMER_DELETED",
                    "origin": self.instance_id,
                    "timerId": timer_id
                })
            except Exception as e:
                logger.error(f"MQ publish TIMER_DELETED error: {e}")
            
            return True
        return False
        
    async def pause_timer(self, timer_id: str, websocket: Optional[WebSocket] = None):
        """Pausar temporizador: guardar tiempo restante actual"""
        if timer_id not in self.timers:
            return False
            
        timer = self.timers[timer_id]
        if timer.completado:
            return False
            
        # Calcular y guardar el tiempo restante actual
        remaining = self.calculate_remaining_time(timer)
        updates = {
            "activo": False,
            "tiempoPausadoSegundos": remaining,
            "tiempoRestanteSegundos": remaining
        }
        
        logger.info(f"Pausando timer {timer_id} con {remaining} segundos restantes")
        return await self.update_timer(timer_id, updates, websocket)
        
    async def resume_timer(self, timer_id: str, websocket: Optional[WebSocket] = None):
        """Reanudar temporizador: establecer nueva fechaFin basada en tiempo pausado"""
        if timer_id not in self.timers:
            return False
            
        timer = self.timers[timer_id]
        if timer.completado:
            return False
            
        # Usar el tiempo pausado si existe, sino usar tiempoRestanteSegundos
        restante = timer.tiempoPausadoSegundos if timer.tiempoPausadoSegundos is not None else timer.tiempoRestanteSegundos
        restante = max(0, restante)
        
        # Alinear al siguiente segundo para mantener sincronización
        new_start = get_aligned_time()
        new_end = new_start + timedelta(seconds=restante)
        
        updates = {
            "activo": True,
            "fechaInicio": new_start,
            "fechaFin": new_end,
            "tiempoPausadoSegundos": None,
            "tiempoRestanteSegundos": restante
        }
        
        logger.info(f"Reanudando timer {timer_id} con {restante} segundos")
        return await self.update_timer(timer_id, updates, websocket)
        
    async def tick_timers(self):
        """Actualizar todos los timers activos cada segundo"""
        while self.running:
            try:
                await asyncio.sleep(1)  # Esperar exactamente 1 segundo
                
                current_time = get_utc_now()
                server_timestamp = self.get_server_timestamp()
                
                # Solo procesar timers activos
                active_timers = [t for t in self.timers.values() if t.activo and not t.completado]
                
                updates_to_broadcast = []
                
                for timer in active_timers:
                    # Calcular tiempo restante
                    remaining_time = self.calculate_remaining_time(timer)
                    
                    # Actualizar el timer
                    old_remaining = timer.tiempoRestanteSegundos
                    timer.tiempoRestanteSegundos = remaining_time
                    
                    # Verificar si se completó
                    if remaining_time <= 0:
                        timer.completado = True
                        timer.activo = False
                        timer.tiempoRestanteSegundos = 0
                        logger.info(f"Timer completado: {timer.nombre} ({timer.id})")
                    
                    # Agregar a la lista de actualizaciones
                    if old_remaining != remaining_time or timer.completado:
                        updates_to_broadcast.append({
                            "timerId": timer.id,
                            "tiempoRestanteSegundos": remaining_time,
                            "completado": timer.completado,
                            "activo": timer.activo
                        })
                
                # Enviar todas las actualizaciones en un solo mensaje
                if updates_to_broadcast:
                    await self.broadcast({
                        "type": "TIMER_BATCH_UPDATE",
                        "data": {
                            "updates": updates_to_broadcast,
                            "server_timestamp": server_timestamp
                        }
                    })
                
                # Log ocasional para debug
                if len(active_timers) > 0 and int(current_time.timestamp()) % 10 == 0:
                    logger.debug(f"Tick: {len(active_timers)} timers activos")
                
            except Exception as e:
                logger.error(f"Error en tick_timers: {e}", exc_info=True)

# Instancia global del manager
timer_manager = TimerManager()

@app.on_event("startup")
async def startup_event():
    """Iniciar el loop de actualización de timers"""
    asyncio.create_task(timer_manager.tick_timers())
    logger.info(f"Timer service iniciado - instance_id: {timer_manager.instance_id}")
    
    async def init_mq():
        try:
            await message_queue.connect()
            logger.info("MQ conectado para timers")

            async def on_event(msg: Dict):
                try:
                    if msg.get("origin") == timer_manager.instance_id:
                        return
                        
                    evt = msg.get("event")
                    
                    if evt == "TIMER_CREATED":
                        data = msg.get("timer")
                        if data:
                            # Convertir fechas
                            for date_field in ["fechaInicio", "fechaFin"]:
                                if date_field in data and isinstance(data[date_field], str):
                                    data[date_field] = parse_iso_datetime(data[date_field])
                            
                            # Asegurar campos requeridos
                            data.setdefault('tiempoPausadoSegundos', None)
                            
                            t = Timer(**data)
                            timer_manager.timers[t.id] = t
                            logger.info(f"[MQ] TIMER_CREATED replicado: {t.id}")
                            
                            await timer_manager.broadcast({
                                "type": "TIMER_CREATED",
                                "data": {
                                    "timer": {
                                        **t.to_dict(),
                                        "server_timestamp": msg.get("server_timestamp")
                                    }
                                }
                            })
                            
                    elif evt == "TIMER_UPDATED":
                        data = msg.get("timer")
                        if data and data.get("id") in timer_manager.timers:
                            tid = data["id"]
                            timer = timer_manager.timers[tid]
                            
                            for k, v in data.items():
                                if k in ("fechaInicio", "fechaFin") and isinstance(v, str):
                                    v = parse_iso_datetime(v)
                                if hasattr(timer, k):
                                    setattr(timer, k, v)
                                    
                            logger.info(f"[MQ] TIMER_UPDATED replicado: {tid}")
                            
                            await timer_manager.broadcast({
                                "type": "TIMER_UPDATED",
                                "data": {"timer": timer.to_dict()}
                            })
                            
                    elif evt == "TIMER_DELETED":
                        tid = msg.get("timerId")
                        if tid and tid in timer_manager.timers:
                            timer_manager.timers.pop(tid, None)
                            logger.info(f"[MQ] TIMER_DELETED replicado: {tid}")
                            
                            await timer_manager.broadcast({
                                "type": "TIMER_DELETED",
                                "data": {"timerId": tid}
                            })
                            
                except Exception as e:
                    logger.error(f"Error procesando evento MQ: {e}", exc_info=True)

            await message_queue.consume_fanout("timers.events", on_event)
            logger.info("Suscrito a fanout timers.events")
            
        except Exception as e:
            logger.error(f"No se pudo inicializar MQ: {e}")

    asyncio.create_task(init_mq())

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
            data = await websocket.receive_text()
            message = json.loads(data)
            
            message_type = message.get("type")
            message_data = message.get("data", {})
            
            if message_type in ("REQUEST_SYNC", "SYNC_REQUEST"):
                server_timestamp = timer_manager.get_server_timestamp()
                timers_data = []
                
                for timer in timer_manager.timers.values():
                    remaining_time = timer_manager.calculate_remaining_time(timer)
                    timers_data.append({
                        **timer.to_dict(),
                        "server_remaining_time": remaining_time,
                        "server_timestamp": server_timestamp
                    })
                
                logger.info(f"Sync solicitado - enviando {len(timers_data)} timers")
                
                await timer_manager.send_to_client(websocket, {
                    "type": "TIMER_SYNC",
                    "data": {
                        "timers": timers_data,
                        "server_timestamp": server_timestamp
                    }
                })
                
            elif message_type == "CREATE_TIMER":
                timer_data = message_data.get("timer")
                if timer_data:
                    await timer_manager.create_timer(timer_data, websocket)
                    
            elif message_type == "CREATE_TIMERS_BATCH":
                # Nuevo mensaje para crear múltiples timers sincronizados
                timers_data = message_data.get("timers", [])
                if timers_data:
                    await timer_manager.create_timers_batch(timers_data, websocket)
                    
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
                    
            elif message_type == "PING":
                # Responder al ping para mantener la conexión viva
                await timer_manager.send_to_client(websocket, {
                    "type": "PONG",
                    "data": {"timestamp": timer_manager.get_server_timestamp()}
                })
                
            else:
                logger.warning(f"Tipo de mensaje no reconocido: {message_type}")
                
    except WebSocketDisconnect:
        logger.info("Cliente desconectado")
    except Exception as e:
        logger.error(f"Error en WebSocket: {e}", exc_info=True)
    finally:
        await timer_manager.remove_connection(websocket)

@app.get("/health")
async def health_check():
    """Endpoint de salud"""
    return {
        "status": "healthy",
        "timers_count": len(timer_manager.timers),
        "active_timers": len([t for t in timer_manager.timers.values() if t.activo]),
        "connections_count": len(timer_manager.connections),
        "timestamp": get_utc_now().isoformat(),
        "instance_id": timer_manager.instance_id
    }

@app.get("/timers")
async def get_timers():
    """Obtener todos los timers con tiempos recalculados"""
    current_time = get_utc_now()
    timers_actualizados = []
    
    for timer in timer_manager.timers.values():
        tiempo_restante = timer_manager.calculate_remaining_time(timer)
        
        timer_dict = timer.to_dict()
        timer_dict['tiempoRestanteSegundos'] = tiempo_restante
        timer_dict['server_time'] = current_time.isoformat()
        
        timers_actualizados.append(timer_dict)
    
    return {
        "timers": timers_actualizados,
        "count": len(timers_actualizados),
        "server_time": current_time.isoformat()
    }

@app.post("/timers/sync")
async def force_sync():
    """Forzar sincronización de todos los timers"""
    current_time = get_utc_now()
    server_timestamp = timer_manager.get_server_timestamp()
    timers_actualizados = []
    
    for timer in timer_manager.timers.values():
        tiempo_restante = timer_manager.calculate_remaining_time(timer)
        
        timer_dict = timer.to_dict()
        timer_dict['tiempoRestanteSegundos'] = tiempo_restante
        timer_dict['server_remaining_time'] = tiempo_restante
        timer_dict['server_timestamp'] = server_timestamp
        
        timers_actualizados.append(timer_dict)
    
    # Broadcast a todos los clientes conectados
    await timer_manager.broadcast({
        "type": "TIMER_SYNC",
        "data": {
            "timers": timers_actualizados,
            "server_timestamp": server_timestamp
        }
    })
    
    return {
        "message": "Sincronización forzada completada",
        "timers_synced": len(timers_actualizados),
        "server_time": current_time.isoformat()
    }

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8006))
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        reload=False,
        log_level="info"
    )