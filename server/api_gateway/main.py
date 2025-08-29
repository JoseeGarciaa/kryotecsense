from fastapi import FastAPI, Depends, HTTPException, status, Body, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import text
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any, Set
from pydantic import BaseModel, Field
import json
import asyncio
import uuid
import logging
import os
import sys

# Agregar el directorio padre al path para importar módulos
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Funciones de utilidad para timers (integradas directamente)
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
        print(f"Error parseando fecha {iso_string}: {e}")
        return get_utc_now()

# Modelo de Timer integrado
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

from shared.database import get_db, get_engine
from shared.utils import verify_password, get_password_hash, create_access_token, get_current_user_from_token
from .models import Usuario
from .schemas import UsuarioCreate, Usuario as UsuarioModel, UsuarioSchema, Token, LoginRequest, UsuarioUpdate

# TimerManager integrado en auth_service
class TimerManager:
    def __init__(self):
        self.timers: Dict[str, Timer] = {}
        self.connections: Set[WebSocket] = set()
        self.running = True
        
    async def add_connection(self, websocket: WebSocket):
        """Agregar nueva conexión WebSocket"""
        self.connections.add(websocket)
        print(f"Nueva conexión timer WebSocket. Total: {len(self.connections)}")
        
        # SINCRONIZACIÓN INMEDIATA: Enviar timers existentes al cliente recién conectado
        current_time = get_utc_now()
        timers_actualizados = []
        
        for timer in self.timers.values():
            # Recalcular tiempo restante basado en tiempo actual para máxima precisión
            tiempo_restante_ms = (timer.fechaFin - current_time).total_seconds()
            nuevo_tiempo_restante = max(0, int(tiempo_restante_ms))
            
            # Actualizar timer con tiempo preciso INMEDIATAMENTE
            timer.tiempoRestanteSegundos = nuevo_tiempo_restante
            timer.completado = nuevo_tiempo_restante == 0
            timer.activo = timer.activo and not timer.completado
            
            timers_actualizados.append(timer.to_dict())
        
        await self.send_to_client(websocket, {
            "type": "TIMER_SYNC",
            "data": {
                "timers": timers_actualizados,
                "server_time": current_time.isoformat()
            }
        })
        
    async def remove_connection(self, websocket: WebSocket):
        """Remover conexión WebSocket"""
        self.connections.discard(websocket)
        print(f"Conexión timer WebSocket removida. Total: {len(self.connections)}")
        
    async def send_to_client(self, websocket: WebSocket, message: Dict):
        """Enviar mensaje a un cliente específico"""
        try:
            await websocket.send_text(json.dumps(message))
        except Exception as e:
            print(f"Error enviando mensaje a cliente timer: {e}")
            await self.remove_connection(websocket)
            
    async def broadcast(self, message: Dict, exclude: WebSocket = None):
        """Enviar mensaje a todos los clientes conectados"""
        disconnected = set()
        
        for connection in self.connections:
            if connection == exclude:
                continue
                
            try:
                await connection.send_text(json.dumps(message))
            except Exception as e:
                print(f"Error en broadcast timer: {e}")
                disconnected.add(connection)
                
        # Remover conexiones desconectadas
        for conn in disconnected:
            await self.remove_connection(conn)
            
    async def create_timer(self, timer_data: Dict, websocket: WebSocket = None):
        """Crear nuevo temporizador"""
        # Verificar si el timer ya existe para evitar duplicados
        timer_id = timer_data.get('id')
        if timer_id and timer_id in self.timers:
            print(f"Timer ya existe, actualizando: {timer_id}")
            await self.update_timer(timer_id, timer_data, websocket)
            return
        
        # Convertir fechas string a datetime con zona horaria
        if 'fechaInicio' in timer_data and isinstance(timer_data['fechaInicio'], str):
            timer_data['fechaInicio'] = parse_iso_datetime(timer_data['fechaInicio'])
        if 'fechaFin' in timer_data and isinstance(timer_data['fechaFin'], str):
            timer_data['fechaFin'] = parse_iso_datetime(timer_data['fechaFin'])
        
        timer = Timer(**timer_data)
        self.timers[timer.id] = timer
        
        print(f"Timer creado: {timer.nombre} ({timer.id})")
        
        # Broadcast a todos los clientes excepto el que envió
        await self.broadcast({
            "type": "TIMER_CREATED",
            "data": {"timer": timer.to_dict()}
        }, exclude=websocket)
        
    async def update_timer(self, timer_id: str, updates: Dict, websocket: WebSocket = None):
        """Actualizar temporizador existente"""
        if timer_id not in self.timers:
            print(f"Timer no encontrado: {timer_id}")
            return False
            
        timer = self.timers[timer_id]
        for key, value in updates.items():
            if hasattr(timer, key):
                setattr(timer, key, value)
                
        print(f"Timer actualizado: {timer.nombre} ({timer_id})")
        
        # Broadcast a todos los clientes excepto el que envió
        await self.broadcast({
            "type": "TIMER_UPDATED",
            "data": {"timer": timer.to_dict()}
        }, exclude=websocket)
        
        return True
        
    async def delete_timer(self, timer_id: str, websocket: WebSocket = None):
        """Eliminar temporizador"""
        if timer_id in self.timers:
            timer = self.timers.pop(timer_id)
            
            print(f"Timer eliminado: {timer.nombre} ({timer_id})")
            
            # Broadcast a todos los clientes excepto el que envió
            await self.broadcast({
                "type": "TIMER_DELETED",
                "data": {"timerId": timer_id}
            }, exclude=websocket)
            
            return True
        return False
        
    async def pause_timer(self, timer_id: str, websocket: WebSocket = None):
        """Pausar temporizador"""
        return await self.update_timer(timer_id, {"activo": False}, websocket)
        
    async def resume_timer(self, timer_id: str, websocket: WebSocket = None):
        """Reanudar temporizador"""
        if timer_id not in self.timers:
            return False
            
        timer = self.timers[timer_id]
        if not timer.completado:
            return await self.update_timer(timer_id, {"activo": True}, websocket)
        return False
        
    async def tick_timers(self):
        """Actualizar todos los timers activos cada segundo"""
        while self.running:
            try:
                current_time = get_utc_now()
                updated_timers = []
                
                for timer_id, timer in self.timers.items():
                    if not timer.activo or timer.completado:
                        continue
                        
                    # Calcular tiempo restante basado en fecha fin (UTC)
                    tiempo_restante_ms = (timer.fechaFin - current_time).total_seconds()
                    nuevo_tiempo_restante = max(0, int(tiempo_restante_ms))
                    
                    # SIEMPRE actualizar y enviar, sin importar si cambió
                    timer.tiempoRestanteSegundos = nuevo_tiempo_restante
                    
                    # Verificar si se completó
                    if nuevo_tiempo_restante == 0 and not timer.completado:
                        timer.completado = True
                        timer.activo = False
                        print(f"Timer completado: {timer.nombre} ({timer_id})")
                    
                    # ENVIAR ACTUALIZACIÓN SIEMPRE para sincronización perfecta
                    updated_timers.append({
                        "timerId": timer_id,
                        "tiempoRestanteSegundos": timer.tiempoRestanteSegundos,
                        "completado": timer.completado,
                        "activo": timer.activo
                    })
                
                # Enviar actualizaciones para TODOS los timers activos, siempre
                if updated_timers:
                    for update in updated_timers:
                        await self.broadcast({
                            "type": "TIMER_TIME_UPDATE",
                            "data": update
                        })
                
                await asyncio.sleep(1)  # Actualizar cada segundo exacto
                
            except Exception as e:
                print(f"Error en tick_timers: {e}")
                await asyncio.sleep(1)

# Instancia global del timer manager
timer_manager = TimerManager()

def get_user_by_email(db: Session, correo: str):
    tenant_schemas = get_tenant_schemas(db)
    for schema in tenant_schemas:
        try:
            result = db.execute(text(f"SELECT *, '{schema}' as tenant_schema FROM {schema}.usuarios WHERE correo = :correo"), {"correo": correo})
            user_row = result.fetchone()
            if user_row:
                user = Usuario()
                for key, value in user_row._mapping.items():
                    setattr(user, key, value)
                return user
        except Exception as e:
            print(f"Error buscando usuario en esquema {schema}: {e}")
            continue
    return None

# Crear aplicación FastAPI
app = FastAPI(
    title="Servicio de Autenticación - KryoTecSense",
    description="Microservicio para gestión de usuarios y autenticación",
    version="1.0.0"
)

# Test endpoint básico inmediatamente después de la definición de la app
@app.get("/test-basic")
def test_basic():
    return {"message": "App funciona correctamente", "status": "ok"}

# Esquema por defecto configurable por entorno
import os
DEFAULT_TENANT_SCHEMA = os.getenv("DEFAULT_TENANT_SCHEMA", "tenant_base")

"""
CORS flexible:
 - FRONTEND_ORIGIN: un origen exacto (sin slash final)
 - CORS_ALLOW_ORIGINS: lista separada por comas
 - CORS_ALLOW_ALL=true: permite cualquier origen (Access-Control-Allow-Origin: *)
"""

from urllib.parse import urlparse


def _normalize_origin(value: str) -> str:
    """Return scheme://host[:port] without trailing slash; ignore any path/query.
    Accepts plain origins or full URLs like https://host/path and reduces to origin.
    """
    if not value:
        return ""
    v = value.strip()
    # If it's already a bare origin without scheme, return as-is (after stripping slash)
    parsed = urlparse(v)
    if parsed.scheme and parsed.netloc:
        return f"{parsed.scheme}://{parsed.netloc}"
    # No scheme: just strip trailing slash
    return v.rstrip("/")


allow_all_env = os.getenv("CORS_ALLOW_ALL", "false").lower() == "true"
allow_all = allow_all_env
if allow_all:
    cors_allow_origins = ["*"]
    cors_allow_credentials = False  # Requisito de FastAPI cuando origin es '*'
else:
    cors_allow_credentials = True
    cors_allow_origins = [
        "http://localhost",
        "http://localhost:5173",  # Vite dev
        "http://127.0.0.1",
        "http://127.0.0.1:5173",
    ]
    env_origin = os.getenv("FRONTEND_ORIGIN")
    if env_origin:
        safe_origin = _normalize_origin(env_origin)
        if safe_origin not in cors_allow_origins:
            cors_allow_origins.append(safe_origin)
    env_origins_csv = os.getenv("CORS_ALLOW_ORIGINS")
    if env_origins_csv:
        for o in [x.strip() for x in env_origins_csv.split(",") if x.strip()]:
            o = _normalize_origin(o)
            if o and o not in cors_allow_origins:
                cors_allow_origins.append(o)

    # Si no hay orígenes explícitos configurados, activar allow_all como fallback seguro
    if not allow_all and not env_origin and not env_origins_csv:
        allow_all = True
        cors_allow_origins = ["*"]
        cors_allow_credentials = False
        print("[CORS] Activado allow_all como fallback: no se configuró FRONTEND_ORIGIN ni CORS_ALLOW_ORIGINS")

print(f"CORS configured. allow_all={allow_all}, origins={cors_allow_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins,
    allow_credentials=cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/cors/config")
def cors_config():
    return {
        "allow_all": allow_all,
        "origins": cors_allow_origins,
        "env": {
            "FRONTEND_ORIGIN": os.getenv("FRONTEND_ORIGIN"),
            "CORS_ALLOW_ORIGINS": os.getenv("CORS_ALLOW_ORIGINS"),
            "CORS_ALLOW_ALL": os.getenv("CORS_ALLOW_ALL"),
        },
    }

# ==========================================================
# TIMER SERVICE - Funcionalidad completa integrada
# Gestiona temporizadores sincronizados en tiempo real vía WebSockets
# El cliente se conecta a wss://<backend>/ws/timers y
# publica eventos a POST /api/alerts/timer-completed
# ==========================================================

# Archivo de persistencia para timers
TIMERS_FILE = "timers_data.json"

# Configurar logging específico para timers
timer_logger = logging.getLogger("timer_service")

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

class TimerData(BaseModel):
    id: str
    nombre: str
    tipoOperacion: str
    tiempoInicialMinutos: int
    fechaInicio: str
    fechaFin: str

class TimerCompletedEvent(BaseModel):
    timer: TimerData
    timestamp: str


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
            timer_logger.info(f"Timers guardados en {TIMERS_FILE}: {len(timers_data)} timers")
        except Exception as e:
            timer_logger.error(f"Error guardando timers: {e}")
    
    def load_timers_from_file(self):
        """Cargar timers desde archivo JSON"""
        if not os.path.exists(TIMERS_FILE):
            timer_logger.info(f"Archivo {TIMERS_FILE} no existe, iniciando sin timers")
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
            
            timer_logger.info(f"Timers cargados desde {TIMERS_FILE}: {len(self.timers)} timers")
        except Exception as e:
            timer_logger.error(f"Error cargando timers: {e}")
        
    async def add_connection(self, websocket: WebSocket):
        """Agregar nueva conexión WebSocket"""
        self.connections.add(websocket)
        timer_logger.info(f"Nueva conexión WebSocket. Total: {len(self.connections)}")
        
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
        timer_logger.info(f"Conexión WebSocket removida. Total: {len(self.connections)}")
        
    async def send_to_client(self, websocket: WebSocket, message: Dict):
        """Enviar mensaje a un cliente específico"""
        try:
            await websocket.send_text(json.dumps(message))
        except Exception as e:
            timer_logger.error(f"Error enviando mensaje a cliente: {e}")
            await self.remove_connection(websocket)
            
    async def broadcast(self, message: Dict, exclude: Optional[WebSocket] = None):
        """Enviar mensaje a todos los clientes conectados"""
        disconnected = set()
        
        if not self.connections:
            # Solo log ocasional para reducir spam
            return
            
        # Solo log para mensajes importantes, no para TIMER_TIME_UPDATE
        if message.get('type') != 'TIMER_TIME_UPDATE':
            timer_logger.info(f"Broadcasting mensaje tipo '{message.get('type')}' a {len(self.connections)} conexiones")
        
        for connection in self.connections:
            if connection == exclude:
                continue
                
            try:
                await connection.send_text(json.dumps(message))
            except Exception as e:
                timer_logger.error(f"Error en broadcast a conexión: {e}")
                disconnected.add(connection)
                
        # Remover conexiones desconectadas
        for conn in disconnected:
            await self.remove_connection(conn)
            
    async def create_timer(self, timer_data: Dict, websocket: Optional[WebSocket] = None):
        """Crear nuevo temporizador"""
        # Verificar si el timer ya existe para evitar duplicados
        timer_id = timer_data.get('id')
        if timer_id and timer_id in self.timers:
            timer_logger.info(f"Timer ya existe, actualizando: {timer_id}")
            await self.update_timer(timer_id, timer_data, websocket)
            return
        
        timer = Timer(**timer_data)
        self.timers[timer.id] = timer
        
        # Guardar en archivo
        self.save_timers_to_file()
        
        timer_logger.info(f"Timer creado: {timer.nombre} ({timer.id})")
        
        # Broadcast a todos los clientes excepto el que envió
        await self.broadcast({
            "type": "TIMER_CREATED",
            "data": {"timer": timer.dict()}
        }, exclude=websocket)
        
    async def update_timer(self, timer_id: str, updates: Dict, websocket: Optional[WebSocket] = None):
        """Actualizar temporizador existente"""
        if timer_id not in self.timers:
            timer_logger.warning(f"Timer no encontrado: {timer_id}")
            return False
            
        timer = self.timers[timer_id]
        for key, value in updates.items():
            if hasattr(timer, key):
                setattr(timer, key, value)
        
        # Guardar en archivo
        self.save_timers_to_file()
                
        timer_logger.info(f"Timer actualizado: {timer.nombre} ({timer_id})")
        
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
            
            timer_logger.info(f"Timer eliminado: {timer.nombre} ({timer_id})")
            
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
        log_counter = 0
        timer_logger.info("tick_timers iniciado - comenzando loop de actualización")
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
                    
                    # Actualizar timer si hay cambio
                    if nuevo_tiempo_restante != timer.tiempoRestanteSegundos:
                        timer.tiempoRestanteSegundos = nuevo_tiempo_restante
                        timers_changed = True
                        
                        # Verificar si se completó
                        if nuevo_tiempo_restante == 0 and not timer.completado:
                            timer.completado = True
                            timer.activo = False
                            timer_logger.info(f"Timer completado: {timer.nombre} ({timer_id})")
                    
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
                    # Solo log cada 10 segundos para evitar spam
                    if log_counter % 10 == 0:
                        timer_logger.info(f"Enviando {len(updated_timers)} actualizaciones de timer a {len(self.connections)} clientes")
                    
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
                
                # Log periódico cada 30 segundos para reducir spam
                log_counter += 1
                if log_counter % 30 == 0:
                    timer_logger.info(f"tick_timers activo - {len(self.timers)} timers, {len(self.connections)} conexiones")
                    log_counter = 0
                
                await asyncio.sleep(1)  # Actualizar cada segundo
                
            except Exception as e:
                timer_logger.error(f"Error en tick_timers: {e}")
                await asyncio.sleep(1)


# Variable global para el timer manager - Inicializar inmediatamente
timer_manager = TimerManager()

# Variable global para almacenar el background task
background_task = None

async def ensure_timer_task_running():
    """Asegurar que el background task de timers esté ejecutándose"""
    global background_task
    if background_task is None or background_task.done():
        timer_logger.info("Iniciando/reiniciando background task de timers")
        background_task = asyncio.create_task(timer_manager.tick_timers())
        timer_logger.info("Background task de timers iniciado")
    return background_task


@app.websocket("/ws/timers")
async def websocket_endpoint(websocket: WebSocket):
    """Endpoint principal de WebSocket para timers"""
    timer_logger.info("Nueva conexión WebSocket intentando conectarse")
    await websocket.accept()
    timer_logger.info("Conexión WebSocket aceptada")
    
    # Asegurar que el background task esté ejecutándose
    await ensure_timer_task_running()
    
    await timer_manager.add_connection(websocket)
    
    try:
        while True:
            # Recibir mensaje del cliente
            data = await websocket.receive_text()
            message = json.loads(data)
            timer_logger.info(f"Mensaje recibido del cliente: {message.get('type')}")
            
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
                timer_logger.warning(f"Tipo de mensaje no reconocido: {message_type}")
                
    except WebSocketDisconnect:
        timer_logger.info("Cliente desconectado normalmente")
    except Exception as e:
        timer_logger.error(f"Error en WebSocket que causa desconexión: {e}")
        import traceback
        timer_logger.error(f"Traceback completo: {traceback.format_exc()}")
    finally:
        timer_logger.info("Limpiando conexión WebSocket")
        await timer_manager.remove_connection(websocket)


async def send_ws_notification(message_type: str, data: Dict):
    await timer_manager.broadcast({"type": message_type, "data": data})


@app.post("/api/alerts/timer-completed")
async def handle_timer_completed(event: TimerCompletedEvent):
    try:
        await send_ws_notification("timer_completed", event.model_dump())
        print(f"✅ Evento timer-completed procesado para: {event.timer.nombre}")
        return {"status": "success"}
    except Exception as e:
        print(f"❌ Error procesando timer-completed: {e}")
        raise HTTPException(status_code=500, detail=f"Error procesando evento: {e}")

# ==========================================================
#  Endpoints unificados para Inventory Dashboard y Alertas
#  (compatibles con rutas del API Gateway bajo /api/*)
# ==========================================================

# Helpers y esquemas para inventory dashboard
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


def _get_tenant_schema_from_user(current_user: Dict[str, Any]) -> str:
    return current_user.get("tenant", "tenant_base")


# =====================
# Reportes (alias /api/reports/..)
# =====================

class ReportItem(BaseModel):
    id: int
    nombre: str
    descripcion: str
    tipo: str
    frecuencia: str
    ultima_generacion: str
    tamaño: str
    formato: str


class ReportMetrics(BaseModel):
    reportes_trazabilidad: int
    validaciones_registradas: int
    procesos_auditados: int
    eficiencia_promedio: float
    cambio_trazabilidad: float
    cambio_validaciones: float
    cambio_procesos: float
    cambio_eficiencia: float
    tiempo_promedio_proceso: str
    tasa_exito_global: str
    credocubes_activos: int
    alertas_resueltas: int


@app.get("/api/reports/reportes/disponibles", response_model=List[ReportItem])
def api_reports_disponibles(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    tenant_schema = _get_tenant_schema_from_user(current_user)
    try:
        stats = db.execute(
            text(
                f"""
                SELECT 
                    COUNT(*) as total_credocubes,
                    COUNT(CASE WHEN validacion_limpieza IS NOT NULL THEN 1 END) as con_validaciones,
                    COUNT(CASE WHEN estado IN ('Operación','Acondicionamiento','operación','acondicionamiento','Pre-acondicionamiento','pre-acondicionamiento') THEN 1 END) as en_proceso
                FROM {tenant_schema}.inventario_credocubes
                """
            )
        ).fetchone()
        total = stats[0] if stats else 0
        con_val = stats[1] if stats else 0
        en_proc = stats[2] if stats else 0
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        return [
            ReportItem(
                id=1,
                nombre="Reporte de Trazabilidad RFID",
                descripcion=f"Seguimiento completo de {total} credocubes por RFID",
                tipo="Inventario",
                frecuencia="Diario",
                ultima_generacion=now,
                tamaño=f"{max(1, total * 2)}KB",
                formato="PDF",
            ),
            ReportItem(
                id=2,
                nombre="Eficiencia de Procesos",
                descripcion=f"Análisis de {en_proc} procesos activos y rendimiento",
                tipo="Operaciones",
                frecuencia="Semanal",
                ultima_generacion=now,
                tamaño=f"{max(1, en_proc * 3)}KB",
                formato="Excel",
            ),
            ReportItem(
                id=3,
                nombre="Validaciones de Calidad",
                descripcion=f"Resultados de {con_val} validaciones",
                tipo="Calidad",
                frecuencia="Diario",
                ultima_generacion=now,
                tamaño=f"{max(1, con_val)}KB",
                formato="PDF",
            ),
            ReportItem(
                id=4,
                nombre="Auditoria de Accesos",
                descripcion="Registro de actividad y accesos de usuarios",
                tipo="Administración",
                frecuencia="Mensual",
                ultima_generacion=now,
                tamaño="956KB",
                formato="Excel",
            ),
        ]
    except Exception as e:
        print(f"Error obteniendo reportes disponibles ({tenant_schema}): {e}")
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        return [
            ReportItem(
                id=1,
                nombre="Reporte de Trazabilidad RFID",
                descripcion="Seguimiento completo de credocubes por RFID",
                tipo="Inventario",
                frecuencia="Diario",
                ultima_generacion=now,
                tamaño="1KB",
                formato="PDF",
            )
        ]


@app.get("/api/reports/reportes/metrics", response_model=ReportMetrics)
def api_reports_metrics(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    tenant_schema = _get_tenant_schema_from_user(current_user)
    try:
        trazabilidad = db.execute(
            text(
                f"SELECT COUNT(*) FROM {tenant_schema}.inventario_credocubes WHERE rfid IS NOT NULL AND rfid <> ''"
            )
        ).fetchone()[0]
        validaciones = db.execute(
            text(
                f"""
                SELECT COUNT(*) FROM {tenant_schema}.inventario_credocubes 
                WHERE validacion_limpieza IS NOT NULL OR validacion_goteo IS NOT NULL OR validacion_desinfeccion IS NOT NULL
                """
            )
        ).fetchone()[0]
        procesos = db.execute(
            text(
                f"""
                SELECT COUNT(*) FROM {tenant_schema}.inventario_credocubes 
                WHERE estado IN ('Operación','Acondicionamiento','Pre-acondicionamiento','Devolución','operación','acondicionamiento','pre-acondicionamiento','devolución')
                """
            )
        ).fetchone()[0]
        # eficiencia: porcentaje de registros con las 3 validaciones aprobadas
        tot_val, exi = db.execute(
            text(
                f"""
                SELECT COUNT(*) as total,
                       SUM(CASE WHEN validacion_limpieza = 'aprobado' AND validacion_goteo = 'aprobado' AND validacion_desinfeccion = 'aprobado' THEN 1 ELSE 0 END) as exitosos
                FROM {tenant_schema}.inventario_credocubes WHERE validacion_limpieza IS NOT NULL
                """
            )
        ).fetchone()
        total_valid = tot_val or 1
        exitosos = exi or 0
        eficiencia = round((exitosos / total_valid) * 100, 1)

        # Cambios simulados razonables
        cambio_trazabilidad = min(25.0, max(5.0, (trazabilidad * 0.1) % 20 + 5))
        cambio_validaciones = min(20.0, max(3.0, (validaciones * 0.05) % 15 + 3))
        cambio_procesos = min(15.0, max(2.0, (procesos * 0.08) % 12 + 2))
        cambio_eficiencia = min(5.0, max(0.5, (eficiencia * 0.02) % 4 + 0.5))

        # Insights
        tiempo_promedio_proceso = f"{2.5 + (procesos * 0.1) % 3:.1f}h"
        tasa_exito_global = f"{eficiencia if eficiencia > 0 else 95.0}%"
        credocubes_activos = db.execute(
            text(
                f"SELECT COUNT(*) FROM {tenant_schema}.inventario_credocubes WHERE estado IN ('Operación','Acondicionamiento','Pre-acondicionamiento','Devolución','operación','acondicionamiento','pre-acondicionamiento','devolución')"
            )
        ).fetchone()[0]
        alertas_resueltas = max(0, min(50, int(procesos * 0.15) + int(validaciones * 0.05)))

        return ReportMetrics(
            reportes_trazabilidad=trazabilidad,
            validaciones_registradas=validaciones,
            procesos_auditados=procesos,
            eficiencia_promedio=eficiencia,
            cambio_trazabilidad=round(cambio_trazabilidad, 1),
            cambio_validaciones=round(cambio_validaciones, 1),
            cambio_procesos=round(cambio_procesos, 1),
            cambio_eficiencia=round(cambio_eficiencia, 1),
            tiempo_promedio_proceso=tiempo_promedio_proceso,
            tasa_exito_global=tasa_exito_global,
            credocubes_activos=credocubes_activos,
            alertas_resueltas=alertas_resueltas,
        )
    except Exception as e:
        print(f"Error obteniendo métricas de reportes ({tenant_schema}): {e}")
        return ReportMetrics(
            reportes_trazabilidad=0,
            validaciones_registradas=0,
            procesos_auditados=0,
            eficiencia_promedio=0.0,
            cambio_trazabilidad=0.0,
            cambio_validaciones=0.0,
            cambio_procesos=0.0,
            cambio_eficiencia=0.0,
            tiempo_promedio_proceso="0.0h",
            tasa_exito_global="0.0%",
            credocubes_activos=0,
            alertas_resueltas=0,
        )


@app.get("/api/inventory/dashboard/metrics")
def api_inventory_dashboard_metrics(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    """Métricas del dashboard (unificado)."""
    tenant_schema = _get_tenant_schema_from_user(current_user)
    try:
        query = text(
            f"""
            SELECT 
                COUNT(*) as total_items,
                COUNT(CASE WHEN LOWER(estado) = 'en bodega' THEN 1 END) as en_bodega,
                COUNT(CASE WHEN LOWER(estado) IN ('en operacion','en operación') THEN 1 END) as en_operacion,
                COUNT(CASE WHEN LOWER(estado) = 'en limpieza' THEN 1 END) as en_limpieza,
                COUNT(CASE WHEN LOWER(estado) IN ('en devolucion','en devolución') THEN 1 END) as en_devolucion,
                COUNT(CASE WHEN LOWER(estado) NOT IN ('en bodega','en operacion','en operación','en limpieza','en devolucion','en devolución') THEN 1 END) as otros_estados,
                COUNT(CASE WHEN validacion_limpieza IS NULL OR validacion_goteo IS NULL OR validacion_desinfeccion IS NULL THEN 1 END) as por_validar,
                COUNT(CASE WHEN validacion_limpieza IS NOT NULL AND validacion_goteo IS NOT NULL AND validacion_desinfeccion IS NOT NULL THEN 1 END) as validados
            FROM {tenant_schema}.inventario_credocubes 
            WHERE activo = true
            """
        )
        row = db.execute(query).fetchone()
        if row:
            return DashboardMetrics(**dict(row._mapping))
        return DashboardMetrics(
            total_items=0,
            en_bodega=0,
            en_operacion=0,
            en_limpieza=0,
            en_devolucion=0,
            otros_estados=0,
            por_validar=0,
            validados=0,
        )
    except Exception as e:
        print(f"Error obteniendo métricas dashboard ({tenant_schema}): {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo métricas")


@app.get("/api/inventory/dashboard/processing-data")
def api_inventory_processing_data(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    tenant_schema = _get_tenant_schema_from_user(current_user)
    try:
        query = text(
            f"""
            WITH monthly_data AS (
                SELECT 
                    TO_CHAR(fecha_ingreso, 'Mon') as mes,
                    COUNT(CASE WHEN LOWER(estado) IN ('recepcion','recepción') THEN 1 END) as recepcion,
                    COUNT(CASE WHEN LOWER(estado) IN ('inspeccion','inspección') THEN 1 END) as inspeccion,
                    COUNT(CASE WHEN LOWER(estado) = 'en limpieza' THEN 1 END) as limpieza,
                    COUNT(CASE WHEN LOWER(estado) IN ('en operacion','en operación') THEN 1 END) as operacion
                FROM {tenant_schema}.inventario_credocubes 
                WHERE activo = true AND fecha_ingreso >= NOW() - INTERVAL '12 months'
                GROUP BY DATE_TRUNC('month', fecha_ingreso), TO_CHAR(fecha_ingreso, 'Mon')
                ORDER BY DATE_TRUNC('month', fecha_ingreso)
            )
            SELECT mes,
                   COALESCE(recepcion,0) as recepcion,
                   COALESCE(inspeccion,0) as inspeccion,
                   COALESCE(limpieza,0) as limpieza,
                   COALESCE(operacion,0) as operacion
            FROM monthly_data
            """
        )
        result = db.execute(query)
        return [ProcessingData(**dict(r._mapping)) for r in result]
    except Exception as e:
        print(f"Error obteniendo processing-data ({tenant_schema}): {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo datos de procesamiento")


@app.get("/api/inventory/dashboard/recent-activity")
def api_inventory_recent_activity(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    tenant_schema = _get_tenant_schema_from_user(current_user)
    try:
        query = text(
            f"""
            SELECT a.id, a.inventario_id, a.descripcion, a.timestamp,
                   i.nombre_unidad, i.rfid, a.estado_nuevo
            FROM {tenant_schema}.actividades_operacion a
            LEFT JOIN {tenant_schema}.inventario_credocubes i ON a.inventario_id = i.id
            ORDER BY a.timestamp DESC
            LIMIT 10
            """
        )
        result = db.execute(query)
        return [ActivityItem(**dict(r._mapping)) for r in result]
    except Exception as e:
        print(f"Error obteniendo recent-activity ({tenant_schema}): {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo actividad reciente")


# Esquemas para alertas
class AlertaBase(BaseModel):
    inventario_id: Optional[int] = None
    tipo_alerta: str
    descripcion: str


class AlertaCreate(AlertaBase):
    pass


class AlertaUpdate(BaseModel):
    resuelta: Optional[bool] = None
    descripcion: Optional[str] = None


@app.get("/api/alerts/alertas/")
def api_alerts_list(
    inventario_id: Optional[int] = None,
    resuelta: Optional[bool] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    tenant_schema = _get_tenant_schema_from_user(current_user)
    base = f"SELECT id, inventario_id, tipo_alerta, descripcion, fecha_creacion, resuelta, fecha_resolucion FROM {tenant_schema}.alertas WHERE 1=1"
    params: Dict[str, any] = {}
    if inventario_id is not None:
        base += " AND inventario_id = :inventario_id"
        params["inventario_id"] = inventario_id
    if resuelta is not None:
        base += " AND resuelta = :resuelta"
        params["resuelta"] = resuelta
    base += " ORDER BY fecha_creacion DESC OFFSET :skip LIMIT :limit"
    params.update({"skip": skip, "limit": limit})
    try:
        rows = db.execute(text(base), params).fetchall()
        return [
            {
                "id": r[0],
                "inventario_id": r[1],
                "tipo_alerta": r[2],
                "descripcion": r[3],
                "fecha_creacion": r[4],
                "resuelta": r[5],
                "fecha_resolucion": r[6],
            }
            for r in rows
        ]
    except Exception as e:
        print(f"Error listando alertas ({tenant_schema}): {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo alertas")


@app.get("/api/alerts/alertas/{alerta_id}")
def api_alerts_get(
    alerta_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    tenant_schema = _get_tenant_schema_from_user(current_user)
    try:
        q = text(
            f"SELECT id, inventario_id, tipo_alerta, descripcion, fecha_creacion, resuelta, fecha_resolucion FROM {tenant_schema}.alertas WHERE id = :id"
        )
        r = db.execute(q, {"id": alerta_id}).fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Alerta no encontrada")
        return {
            "id": r[0],
            "inventario_id": r[1],
            "tipo_alerta": r[2],
            "descripcion": r[3],
            "fecha_creacion": r[4],
            "resuelta": r[5],
            "fecha_resolucion": r[6],
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error obteniendo alerta ({tenant_schema}): {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo alerta")


@app.post("/api/alerts/alertas/")
def api_alerts_create(
    alerta: AlertaCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    tenant_schema = _get_tenant_schema_from_user(current_user)
    try:
        q = text(
            f"""
            INSERT INTO {tenant_schema}.alertas (inventario_id, tipo_alerta, descripcion, fecha_creacion, resuelta)
            VALUES (:inventario_id, :tipo_alerta, :descripcion, NOW(), false)
            RETURNING id, inventario_id, tipo_alerta, descripcion, fecha_creacion, resuelta, fecha_resolucion
            """
        )
        r = db.execute(
            q,
            {
                "inventario_id": alerta.inventario_id,
                "tipo_alerta": alerta.tipo_alerta,
                "descripcion": alerta.descripcion,
            },
        ).fetchone()
        db.commit()
        return {
            "id": r[0],
            "inventario_id": r[1],
            "tipo_alerta": r[2],
            "descripcion": r[3],
            "fecha_creacion": r[4],
            "resuelta": r[5],
            "fecha_resolucion": r[6],
        }
    except Exception as e:
        db.rollback()
        print(f"Error creando alerta ({tenant_schema}): {e}")
        raise HTTPException(status_code=500, detail="Error creando alerta")


@app.put("/api/alerts/alertas/{alerta_id}")
def api_alerts_update(
    alerta_id: int,
    alerta: AlertaUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    tenant_schema = _get_tenant_schema_from_user(current_user)
    try:
        # verificar existencia
        exists = db.execute(
            text(f"SELECT id FROM {tenant_schema}.alertas WHERE id = :id"), {"id": alerta_id}
        ).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Alerta no encontrada")

        update_fields = []
        params: Dict[str, any] = {"id": alerta_id}
        if alerta.resuelta is not None:
            update_fields.append("resuelta = :resuelta")
            params["resuelta"] = alerta.resuelta
            if alerta.resuelta:
                update_fields.append("fecha_resolucion = NOW()")
        if alerta.descripcion is not None:
            update_fields.append("descripcion = :descripcion")
            params["descripcion"] = alerta.descripcion

        if not update_fields:
            q = text(
                f"SELECT id, inventario_id, tipo_alerta, descripcion, fecha_creacion, resuelta, fecha_resolucion FROM {tenant_schema}.alertas WHERE id = :id"
            )
            r = db.execute(q, {"id": alerta_id}).fetchone()
        else:
            q = text(
                f"""
                UPDATE {tenant_schema}.alertas 
                SET {', '.join(update_fields)}
                WHERE id = :id
                RETURNING id, inventario_id, tipo_alerta, descripcion, fecha_creacion, resuelta, fecha_resolucion
                """
            )
            r = db.execute(q, params).fetchone()
            db.commit()

        return {
            "id": r[0],
            "inventario_id": r[1],
            "tipo_alerta": r[2],
            "descripcion": r[3],
            "fecha_creacion": r[4],
            "resuelta": r[5],
            "fecha_resolucion": r[6],
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error actualizando alerta ({tenant_schema}): {e}")
        raise HTTPException(status_code=500, detail="Error actualizando alerta")


@app.delete("/api/alerts/alertas/{alerta_id}", status_code=204)
def api_alerts_delete(
    alerta_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    tenant_schema = _get_tenant_schema_from_user(current_user)
    try:
        q = text(f"DELETE FROM {tenant_schema}.alertas WHERE id = :id RETURNING id")
        r = db.execute(q, {"id": alerta_id}).fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Alerta no encontrada")
        db.commit()
        return None
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error eliminando alerta ({tenant_schema}): {e}")
        raise HTTPException(status_code=500, detail="Error eliminando alerta")


# ===== Registro e Inventario básico (para pantalla Registro) =====

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


@app.get("/api/inventory/modelos/")
def api_inventory_modelos(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    tenant_schema = _get_tenant_schema_from_user(current_user)
    try:
        q = text(
            f"""
            SELECT modelo_id, nombre_modelo, volumen_litros, descripcion,
                   dim_ext_frente, dim_ext_profundo, dim_ext_alto,
                   dim_int_frente, dim_int_profundo, dim_int_alto,
                   tic_frente, tic_alto, peso_total_kg, tipo
            FROM {tenant_schema}.modelos
            ORDER BY nombre_modelo
            OFFSET :skip LIMIT :limit
            """
        )
        rows = db.execute(q, {"skip": skip, "limit": limit})
        return [ModeloResponse(**dict(r._mapping)) for r in rows]
    except Exception as e:
        print(f"Error listando modelos ({tenant_schema}): {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo modelos")


@app.get("/api/inventory/verificar-rfid-sin-auth/{rfid}")
def api_inventory_verificar_rfid(rfid: str, db: Session = Depends(get_db)):
    """Verificación rápida sin auth estricta (compat con cliente)."""
    try:
        # Por ahora verificar en tenant_brandon para compat; idealmente exigir tenant
        q = text("SELECT COUNT(*) FROM tenant_brandon.inventario_credocubes WHERE rfid = :rfid")
        count = db.execute(q, {"rfid": rfid}).scalar() or 0
        return {"rfid": rfid, "existe": count > 0, "count": int(count)}
    except Exception as e:
        print(f"Error verificando RFID: {e}")
        return {"rfid": rfid, "existe": False, "count": 0, "error": str(e)}


# ===== Inventario CRUD y utilidades usadas por Operación =====

def _generar_lote_automatico(db: Session, tenant_schema: str) -> str:
    """Genera lote YYYYMMDDXXX incrementando el último del día."""
    try:
        fecha_actual = datetime.now().strftime("%Y%m%d")
        q = text(
            f"""
            SELECT lote FROM {tenant_schema}.inventario_credocubes
            WHERE lote LIKE :prefijo
            ORDER BY lote DESC
            LIMIT 1
            """
        )
        ultimo = db.execute(q, {"prefijo": f"{fecha_actual}%"}).fetchone()
        sec = 1
        if ultimo and ultimo[0] and isinstance(ultimo[0], str) and len(ultimo[0]) >= 11:
            try:
                sec = int(ultimo[0][-3:]) + 1
            except Exception:
                sec = 1
        return f"{fecha_actual}{sec:03d}"
    except Exception:
        # Fallback simple
        return datetime.now().strftime("%Y%m%d001")


@app.get("/api/inventory/inventario/", response_model=List[InventarioResponse])
def api_inventory_list(
    skip: int = 0,
    limit: int = 1000,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    """Lista completa del inventario activo, unida con modelos."""
    tenant_schema = _get_tenant_schema_from_user(current_user)
    try:
        q = text(
            f"""
            SELECT i.id, i.modelo_id, m.nombre_modelo, i.nombre_unidad, i.rfid,
                   i.lote, i.estado, i.sub_estado, i.validacion_limpieza,
                   i.validacion_goteo, i.validacion_desinfeccion, i.categoria,
                   i.fecha_ingreso, i.ultima_actualizacion, i.fecha_vencimiento, i.activo
            FROM {tenant_schema}.inventario_credocubes i
            LEFT JOIN {tenant_schema}.modelos m ON i.modelo_id = m.modelo_id
            WHERE i.activo = true
            ORDER BY i.ultima_actualizacion DESC, i.fecha_ingreso DESC
            OFFSET :skip LIMIT :limit
            """
        )
        rows = db.execute(q, {"skip": skip, "limit": limit})
        return [InventarioResponse(**dict(r._mapping)) for r in rows]
    except Exception as e:
        print(f"Error listando inventario ({tenant_schema}): {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo inventario")


@app.post("/api/inventory/inventario/")
def api_inventory_create(
    item: InventarioCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    tenant_schema = _get_tenant_schema_from_user(current_user)
    try:
        # evitar duplicados de RFID activos
        exists = db.execute(
            text(f"SELECT id FROM {tenant_schema}.inventario_credocubes WHERE rfid = :rfid AND activo = true"),
            {"rfid": item.rfid},
        ).fetchone()
        if exists:
            raise HTTPException(status_code=400, detail=f"Ya existe un credcube con RFID {item.rfid}")

        q = text(
            f"""
            INSERT INTO {tenant_schema}.inventario_credocubes
            (modelo_id, nombre_unidad, rfid, lote, estado, sub_estado,
             validacion_limpieza, validacion_goteo, validacion_desinfeccion, categoria,
             fecha_ingreso, ultima_actualizacion, activo)
            VALUES (:modelo_id, :nombre_unidad, :rfid, :lote, :estado, :sub_estado,
                    :validacion_limpieza, :validacion_goteo, :validacion_desinfeccion, :categoria,
                    NOW(), NOW(), true)
            RETURNING id
            """
        )
        new_id = db.execute(q, item.model_dump()).fetchone()[0]
        db.commit()
        return {"id": new_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error creando inventario ({tenant_schema}): {e}")
        raise HTTPException(status_code=500, detail="Error creando inventario")


@app.put("/api/inventory/inventario/{inventario_id}", response_model=InventarioResponse)
def api_inventory_update(
    inventario_id: int,
    inventario: InventarioUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    tenant_schema = _get_tenant_schema_from_user(current_user)
    try:
        exists = db.execute(
            text(f"SELECT id FROM {tenant_schema}.inventario_credocubes WHERE id = :id"),
            {"id": inventario_id},
        ).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Inventario no encontrado")

        # Verificar RFID único si se cambia
        if inventario.rfid is not None:
            r = db.execute(
                text(
                    f"SELECT id FROM {tenant_schema}.inventario_credocubes WHERE rfid = :rfid AND id != :id"
                ),
                {"rfid": inventario.rfid, "id": inventario_id},
            ).fetchone()
            if r:
                raise HTTPException(status_code=400, detail=f"Ya existe un credcube con RFID {inventario.rfid}")

        fields = []
        params: Dict[str, Any] = {"id": inventario_id}
        for k, v in inventario.model_dump(exclude_unset=True).items():
            fields.append(f"{k} = :{k}")
            params[k] = v
        if not fields:
            raise HTTPException(status_code=400, detail="No hay campos para actualizar")
        fields.append("ultima_actualizacion = CURRENT_TIMESTAMP")
        q = text(
            f"""
            UPDATE {tenant_schema}.inventario_credocubes
            SET {', '.join(fields)}
            WHERE id = :id
            RETURNING id, modelo_id, (SELECT nombre_modelo FROM {tenant_schema}.modelos m WHERE m.modelo_id = {tenant_schema}.inventario_credocubes.modelo_id) as nombre_modelo,
                      nombre_unidad, rfid, lote, estado, sub_estado,
                      validacion_limpieza, validacion_goteo, validacion_desinfeccion,
                      categoria, fecha_ingreso, ultima_actualizacion, fecha_vencimiento, activo
            """
        )
        row = db.execute(q, params).fetchone()
        db.commit()
        return InventarioResponse(**dict(row._mapping))
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error actualizando inventario ({tenant_schema}): {e}")
        raise HTTPException(status_code=500, detail="Error actualizando inventario")


@app.patch("/api/inventory/inventario/{inventario_id}/estado", response_model=InventarioResponse)
def api_inventory_update_estado(
    inventario_id: int,
    estado_update: EstadoUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    tenant_schema = _get_tenant_schema_from_user(current_user)
    try:
        exists = db.execute(
            text(f"SELECT id FROM {tenant_schema}.inventario_credocubes WHERE id = :id"),
            {"id": inventario_id},
        ).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Inventario no encontrado")

        set_lote = None
        if estado_update.estado and estado_update.sub_estado:
            est = estado_update.estado.strip().lower()
            sub = estado_update.sub_estado.strip().lower() if estado_update.sub_estado else ""
            if est in ["pre-acondicionamiento", "preacondicionamiento"] and sub in ["congelación", "congelacion", "atemperamiento"]:
                # Si no tiene lote, asignar automático
                lote_row = db.execute(
                    text(f"SELECT lote FROM {tenant_schema}.inventario_credocubes WHERE id = :id"),
                    {"id": inventario_id},
                ).fetchone()
                if not lote_row or not lote_row[0]:
                    set_lote = _generar_lote_automatico(db, tenant_schema)

        if set_lote:
            q = text(
                f"""
                UPDATE {tenant_schema}.inventario_credocubes
                SET estado = :estado, sub_estado = :sub_estado, lote = :lote,
                    ultima_actualizacion = CURRENT_TIMESTAMP
                WHERE id = :id
                RETURNING id, modelo_id, (SELECT nombre_modelo FROM {tenant_schema}.modelos m WHERE m.modelo_id = {tenant_schema}.inventario_credocubes.modelo_id) as nombre_modelo,
                          nombre_unidad, rfid, lote, estado, sub_estado,
                          validacion_limpieza, validacion_goteo, validacion_desinfeccion,
                          categoria, fecha_ingreso, ultima_actualizacion, fecha_vencimiento, activo
                """
            )
            row = db.execute(
                q,
                {
                    "id": inventario_id,
                    "estado": estado_update.estado,
                    "sub_estado": estado_update.sub_estado,
                    "lote": set_lote,
                },
            ).fetchone()
        else:
            q = text(
                f"""
                UPDATE {tenant_schema}.inventario_credocubes
                SET estado = :estado, sub_estado = :sub_estado,
                    ultima_actualizacion = CURRENT_TIMESTAMP
                WHERE id = :id
                RETURNING id, modelo_id, (SELECT nombre_modelo FROM {tenant_schema}.modelos m WHERE m.modelo_id = {tenant_schema}.inventario_credocubes.modelo_id) as nombre_modelo,
                          nombre_unidad, rfid, lote, estado, sub_estado,
                          validacion_limpieza, validacion_goteo, validacion_desinfeccion,
                          categoria, fecha_ingreso, ultima_actualizacion, fecha_vencimiento, activo
                """
            )
            row = db.execute(
                q,
                {"id": inventario_id, "estado": estado_update.estado, "sub_estado": estado_update.sub_estado},
            ).fetchone()
        db.commit()
        return InventarioResponse(**dict(row._mapping))
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error actualizando estado inventario ({tenant_schema}): {e}")
        raise HTTPException(status_code=500, detail="Error actualizando estado")


@app.delete("/api/inventory/inventario/{inventario_id}", status_code=status.HTTP_200_OK)
def api_inventory_delete_inventario(
    inventario_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    """Eliminar un item del inventario (soft delete)"""
    tenant_schema = _get_tenant_schema_from_user(current_user)
    try:
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


# -------- Operaciones auxiliares: bulk y envío --------
class AsignarLoteAutomaticoRequest(BaseModel):
    rfids: List[str]
    estado: str
    sub_estado: str


@app.patch("/api/inventory/inventario/asignar-lote-automatico")
def api_inventory_asignar_lote_automatico(
    req: AsignarLoteAutomaticoRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    tenant_schema = _get_tenant_schema_from_user(current_user)
    try:
        if not req.rfids:
            raise HTTPException(status_code=400, detail="Debe proporcionar RFIDs")
        lote = _generar_lote_automatico(db, tenant_schema)
        q = text(
            f"""
            UPDATE {tenant_schema}.inventario_credocubes
            SET lote = :lote, estado = :estado, sub_estado = :sub_estado,
                ultima_actualizacion = CURRENT_TIMESTAMP
            WHERE rfid = ANY(:rfids) AND activo = true
            RETURNING id, nombre_unidad, rfid, lote, estado, sub_estado
            """
        )
        rows = db.execute(q, {"lote": lote, "estado": req.estado, "sub_estado": req.sub_estado, "rfids": req.rfids}).fetchall()
        db.commit()
        return {
            "message": f"Lote automático '{lote}' asignado",
            "lote_generado": lote,
            "items_actualizados": len(rows),
            "items": [
                {"id": r[0], "nombre_unidad": r[1], "rfid": r[2], "lote": r[3], "estado": r[4], "sub_estado": r[5]}
                for r in rows
            ],
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error asignando lote automático ({tenant_schema}): {e}")
        raise HTTPException(status_code=500, detail="Error asignando lote automático")


class IniciarEnvioRequest(BaseModel):
    items_ids: List[int]
    tiempo_envio_minutos: Optional[int] = None
    descripcion_adicional: Optional[str] = None


@app.post("/api/inventory/inventario/iniciar-envio")
def api_inventory_iniciar_envio(
    req: IniciarEnvioRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    tenant_schema = _get_tenant_schema_from_user(current_user)
    try:
        if not req.items_ids:
            raise HTTPException(status_code=400, detail="Debe proporcionar items")
        # Verificar existencia
        chk = db.execute(
            text(f"SELECT id FROM {tenant_schema}.inventario_credocubes WHERE id = ANY(:ids) AND activo = true"),
            {"ids": req.items_ids},
        ).fetchall()
        if len(chk) != len(req.items_ids):
            raise HTTPException(status_code=404, detail="Algunos items no existen o no están activos")
        q = text(
            f"""
            UPDATE {tenant_schema}.inventario_credocubes
            SET estado = 'operación', sub_estado = 'En transito', ultima_actualizacion = CURRENT_TIMESTAMP
            WHERE id = ANY(:ids)
            RETURNING id, rfid, estado, sub_estado, lote
            """
        )
        rows = db.execute(q, {"ids": req.items_ids}).fetchall()
        db.commit()
        return {
            "message": f"Proceso de envío iniciado para {len(rows)} items",
            "items": [
                {"id": r[0], "rfid": r[1], "estado": r[2], "sub_estado": r[3], "lote": r[4]}
                for r in rows
            ],
            "tiempo_estimado_minutos": req.tiempo_envio_minutos,
            "descripcion": req.descripcion_adicional,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error iniciando envío ({tenant_schema}): {e}")
        raise HTTPException(status_code=500, detail="Error iniciando envío")


@app.patch("/api/inventory/inventario/{item_id}/completar-envio")
def api_inventory_completar_envio(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    tenant_schema = _get_tenant_schema_from_user(current_user)
    try:
        r = db.execute(
            text(f"SELECT id FROM {tenant_schema}.inventario_credocubes WHERE id = :id AND activo = true"),
            {"id": item_id},
        ).fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Item no encontrado")
        q = text(
            f"""
            UPDATE {tenant_schema}.inventario_credocubes
            SET estado = 'operación', sub_estado = 'entregado', ultima_actualizacion = CURRENT_TIMESTAMP
            WHERE id = :id
            RETURNING id, rfid, estado, sub_estado, lote
            """
        )
        row = db.execute(q, {"id": item_id}).fetchone()
        db.commit()
        return {
            "message": "Envío completado",
            "item": {"id": row[0], "rfid": row[1], "estado": row[2], "sub_estado": row[3], "lote": row[4]},
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error completando envío ({tenant_schema}): {e}")
        raise HTTPException(status_code=500, detail="Error completando envío")


class CancelarEnvioRequest(BaseModel):
    motivo: Optional[str] = "Cancelado por usuario"


@app.patch("/api/inventory/inventario/{item_id}/cancelar-envio")
def api_inventory_cancelar_envio(
    item_id: int,
    req: CancelarEnvioRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    tenant_schema = _get_tenant_schema_from_user(current_user)
    try:
        r = db.execute(
            text(f"SELECT id FROM {tenant_schema}.inventario_credocubes WHERE id = :id AND activo = true"),
            {"id": item_id},
        ).fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Item no encontrado")
        q = text(
            f"""
            UPDATE {tenant_schema}.inventario_credocubes
            SET estado = 'En bodega', sub_estado = 'Disponible', ultima_actualizacion = CURRENT_TIMESTAMP
            WHERE id = :id
            RETURNING id, rfid, estado, sub_estado, lote
            """
        )
        row = db.execute(q, {"id": item_id}).fetchone()
        db.commit()
        return {
            "message": f"Envío cancelado: {req.motivo}",
            "item": {"id": row[0], "rfid": row[1], "estado": row[2], "sub_estado": row[3], "lote": row[4]},
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error cancelando envío ({tenant_schema}): {e}")
        raise HTTPException(status_code=500, detail="Error cancelando envío")


class BulkUpdateRequest(BaseModel):
    updates: List[Dict[str, Any]]


@app.post("/api/inventory/inventario/bulk-update")
def api_inventory_bulk_update(
    req: BulkUpdateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    tenant_schema = _get_tenant_schema_from_user(current_user)
    try:
        if not req.updates:
            raise HTTPException(status_code=400, detail="Debe proporcionar actualizaciones")
        updated = 0
        for up in req.updates:
            if "id" not in up:
                continue
            clauses = []
            params: Dict[str, Any] = {"id": up["id"]}
            for k, v in up.items():
                if k == "id":
                    continue
                clauses.append(f"{k} = :{k}")
                params[k] = v
            if not clauses:
                continue
            clauses.append("ultima_actualizacion = CURRENT_TIMESTAMP")
            q = text(
                f"UPDATE {tenant_schema}.inventario_credocubes SET {', '.join(clauses)} WHERE id = :id AND activo = true"
            )
            res = db.execute(q, params)
            updated += res.rowcount or 0
        db.commit()
        return {"message": "Actualización masiva completada", "items_actualizados": int(updated)}
    except Exception as e:
        db.rollback()
        print(f"Error en bulk-update ({tenant_schema}): {e}")
        raise HTTPException(status_code=500, detail="Error en actualización masiva")


class BulkActivitiesRequest(BaseModel):
    activities: List[Dict[str, Any]]


@app.post("/api/inventory/inventario/bulk-activities")
def api_inventory_bulk_activities(
    req: BulkActivitiesRequest,
    current_user: dict = Depends(get_current_user_from_token),
):
    # Placeholder, el cliente solo espera 200 OK
    return {"message": "Actividades masivas procesadas", "activities_procesadas": len(req.activities)}


class BulkStateChangeRequest(BaseModel):
    updates: List[Dict[str, Any]]


@app.post("/api/inventory/inventario/bulk-state-change")
def api_inventory_bulk_state_change(
    req: BulkStateChangeRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    tenant_schema = _get_tenant_schema_from_user(current_user)
    try:
        if not req.updates:
            raise HTTPException(status_code=400, detail="Debe proporcionar actualizaciones")
        updated = 0
        for up in req.updates:
            if "id" not in up or "estado" not in up:
                continue
            q = text(
                f"""
                UPDATE {tenant_schema}.inventario_credocubes
                SET estado = :estado, sub_estado = :sub_estado,
                    ultima_actualizacion = CURRENT_TIMESTAMP
                WHERE id = :id AND activo = true
                """
            )
            res = db.execute(q, {"id": up["id"], "estado": up["estado"], "sub_estado": up.get("sub_estado")})
            updated += res.rowcount or 0
        db.commit()
        return {"message": "Cambio de estado masivo completado", "items_actualizados": int(updated)}
    except Exception as e:
        db.rollback()
        print(f"Error en bulk-state-change ({tenant_schema}): {e}")
        raise HTTPException(status_code=500, detail="Error en cambio de estado masivo")


class ActividadCreate(BaseModel):
    inventario_id: Optional[int] = None
    usuario_id: Optional[int] = None
    descripcion: str
    estado_nuevo: str
    sub_estado_nuevo: Optional[str] = None


@app.post("/api/activities/actividades/")
def api_activities_create(
    act: ActividadCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    tenant_schema = _get_tenant_schema_from_user(current_user)
    try:
        q = text(
            f"""
            INSERT INTO {tenant_schema}.actividades_operacion
            (inventario_id, usuario_id, descripcion, estado_nuevo, sub_estado_nuevo, timestamp)
            VALUES (:inventario_id, :usuario_id, :descripcion, :estado_nuevo, :sub_estado_nuevo, NOW())
            RETURNING id
            """
        )
        new_id = db.execute(q, act.model_dump()).fetchone()[0]
        db.commit()
        # Notificar a clientes por WS (best-effort)
        try:
            asyncio.create_task(send_ws_notification("inventory_update", {"actividad_id": new_id}))
        except Exception:
            pass
        return {"id": new_id}
    except Exception as e:
        db.rollback()
        print(f"Error creando actividad ({tenant_schema}): {e}")
        raise HTTPException(status_code=500, detail="Error creando actividad")


@app.get("/api/activities/actividades/")
def api_activities_list(
    inventario_id: Optional[int] = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    tenant_schema = _get_tenant_schema_from_user(current_user)
    try:
        base = f"SELECT id, inventario_id, usuario_id, descripcion, estado_nuevo, sub_estado_nuevo, timestamp FROM {tenant_schema}.actividades_operacion"
        params: Dict[str, Any] = {}
        if inventario_id is not None:
            base += " WHERE inventario_id = :inventario_id"
            params["inventario_id"] = inventario_id
        base += " ORDER BY timestamp DESC LIMIT :limit"
        params["limit"] = limit
        rows = db.execute(text(base), params).fetchall()
        return [
            {
                "id": r[0],
                "inventario_id": r[1],
                "usuario_id": r[2],
                "descripcion": r[3],
                "estado_nuevo": r[4],
                "sub_estado_nuevo": r[5],
                "timestamp": r[6],
            }
            for r in rows
        ]
    except Exception as e:
        print(f"Error listando actividades ({tenant_schema}): {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo actividades")

# Configuración de OAuth2
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Función para obtener todos los esquemas de tenant
def get_tenant_schemas(db: Session):
    from sqlalchemy import text
    # 1) Permitir override por entorno: TENANT_SCHEMAS=tenant_base,tenant_brandon,tenant_cruz_verde
    env_list = os.getenv("TENANT_SCHEMAS")
    if env_list:
        schemas = [s.strip() for s in env_list.split(",") if s.strip()]
        # Normalizar y filtrar duplicados
        unique = []
        for s in schemas:
            if s not in unique:
                unique.append(s)
        return unique
    # 2) Descubrir desde information_schema
    try:
        result = db.execute(text("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%'"))
        schemas = [row[0] for row in result.fetchall()]
        return schemas
    except Exception as e:
        print(f"Error obteniendo esquemas de tenant: {e}")
        # En error, retornar lista vacía (el resto de endpoints decidirán qué hacer)
        return []

# Helper para listar usuarios desde un esquema específico (solo prueba/diagnóstico)
def _list_users_from_schema(db: Session, tenant_schema: str):
    query = text(
        f"SELECT id, nombre, correo, telefono, rol, activo, fecha_creacion, ultimo_ingreso FROM {tenant_schema}.usuarios ORDER BY id LIMIT 100"
    )
    result = db.execute(query)
    users = []
    for row in result.fetchall():
        users.append({
            "id": row[0],
            "nombre": row[1],
            "correo": row[2],
            "telefono": row[3],
            "rol": row[4],
            "activo": row[5],
            "fecha_creacion": row[6].isoformat() if row[6] else None,
            "ultimo_ingreso": row[7].isoformat() if row[7] else None,
            "tenant": tenant_schema,
        })
    return users

# Función para obtener usuario por ID con tenant dinámico
def get_user_by_id(db: Session, usuario_id: int, tenant_schema: str = None):
    from sqlalchemy import text
    
    # Si no se proporciona tenant_schema, buscar en todos los tenants
    if tenant_schema:
        schemas_to_search = [tenant_schema]
    else:
        tenant_schemas = get_tenant_schemas(db)
        schemas_to_search = tenant_schemas
    
    for schema in schemas_to_search:
        try:
            result = db.execute(text(f"SELECT *, '{schema}' as tenant_schema FROM {schema}.usuarios WHERE id = :id"), {"id": usuario_id})
            user_row = result.fetchone()
            if user_row:
                # Crear objeto Usuario manualmente
                user = Usuario()
                for key, value in user_row._mapping.items():
                    setattr(user, key, value)
                return user
        except Exception as e:
            print(f"Error buscando usuario en esquema {schema}: {e}")
            continue
    
    return None

# Función para autenticar usuario
def authenticate_user(db: Session, correo: str, contrasena: str):
    try:
        user = get_user_by_email(db, correo)
        if not user:
            print(f"Autenticación fallida: Usuario {correo} no encontrado")
            return False
        
        # Verificar la contraseña con el hash almacenado
        if verify_password(contrasena, user.password):
            print(f"Autenticación exitosa para {correo} en tenant {user.tenant_schema}")
            # Actualizar último ingreso usando el tenant correcto
            try:
                from sqlalchemy import text
                db.execute(text(f"UPDATE {user.tenant_schema}.usuarios SET ultimo_ingreso = NOW() WHERE correo = :correo"), {"correo": correo})
                db.commit()
            except Exception as e:
                print(f"Error al actualizar último ingreso: {e}")
            return user
        else:
            print(f"Autenticación fallida: Contraseña incorrecta para {correo}")
            return False
    except Exception as e:
        print(f"Error en authenticate_user: {e}")
        return False

# Endpoint para registro de usuarios
@app.post("/usuarios/", response_model=UsuarioSchema, status_code=status.HTTP_201_CREATED)
def create_user(usuario: UsuarioCreate, db: Session = Depends(get_db)):
    db_user = get_user_by_email(db, usuario.correo)
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El correo ya está registrado"
        )
    
    hashed_password = get_password_hash(usuario.contrasena)
    db_user = Usuario(
        nombre=usuario.nombre,
        correo=usuario.correo,
        telefono=usuario.telefono,
        password=hashed_password,
        rol=usuario.rol
    )
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

# Endpoint para inicio de sesión
@app.post("/token", response_model=Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    print(f"Intento de login para: {form_data.username}")
    
    # Autenticar usuario contra la base de datos
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verificar si el usuario está activo
    if not user.activo:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario inactivo. Contacte al administrador.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Crear token de acceso con datos del usuario real incluyendo tenant
    access_token_expires = timedelta(minutes=30)
    tenant_schema = getattr(user, 'tenant_schema', 'tenant_base')  # Default a tenant_base si no se especifica
    print(f"DEBUG: Generando JWT para {user.correo} con tenant: {tenant_schema}")
    access_token = create_access_token(
        data={
            "sub": user.correo, 
            "id": user.id, 
            "rol": user.rol,
            "tenant": tenant_schema
        },
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

# Endpoint de prueba sin autenticación
@app.get("/usuarios/test")
def get_users_test(
    schema: Optional[str] = Query(None, description="Esquema tenant a consultar o 'all' para todos"),
    db: Session = Depends(get_db)
):
    from sqlalchemy import text
    try:
        if schema == "all":
            schemas = get_tenant_schemas(db)
            print(f"DEBUG: /usuarios/test agregando usuarios de todos los tenants: {schemas}")
            aggregated = []
            errors = []
            for s in schemas:
                try:
                    aggregated.extend(_list_users_from_schema(db, s))
                except Exception as e:
                    msg = f"Error listando usuarios en {s}: {e}"
                    print(f"WARN: {msg}")
                    errors.append({"schema": s, "error": str(e)})
                    continue
            return {"status": "success", "users": aggregated, "count": len(aggregated), "schemas": schemas, "errors": errors}
        # Caso por esquema específico o default
        tenant_schema = schema or DEFAULT_TENANT_SCHEMA
        print(f"DEBUG: Endpoint /usuarios/test usando tenant: {tenant_schema}")
        users = _list_users_from_schema(db, tenant_schema)
        print(f"DEBUG: Retornando {len(users)} usuarios de {tenant_schema}")
        return {"status": "success", "users": users, "count": len(users)}
    except Exception as e:
        # No lanzar 500; retornar detalle para diagnóstico
        return {"status": "error", "message": str(e)}

# Endpoint de búsqueda rápida de usuario por correo, explora todos los tenants
@app.get("/usuarios/search")
def search_user_by_email(correo: str = Query(..., description="Email a buscar"), db: Session = Depends(get_db)):
    try:
        user = get_user_by_email(db, correo)
        if not user:
            return {"status": "not_found", "correo": correo}
        return {
            "status": "success",
            "user": {
                "id": user.id,
                "nombre": getattr(user, "nombre", None),
                "correo": user.correo,
                "rol": getattr(user, "rol", None),
                "tenant": getattr(user, "tenant_schema", None),
            },
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

# Endpoint para probar conectividad a la base de datos
@app.get("/db/ping")
def db_ping():
    from sqlalchemy import text
    try:
        eng = get_engine()
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "db": "reachable"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# Endpoint para obtener todos los usuarios del tenant actual
@app.get("/usuarios/", response_model=List[UsuarioSchema])
def get_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user_from_token)):
    from sqlalchemy import text
    
    # Obtener el tenant del usuario actual
    tenant_schema = current_user.get('tenant', 'tenant_base')
    
    try:
        # Consulta SQL dinámica usando el esquema del tenant
        query = text(f"""
            SELECT id, nombre, correo, telefono, rol, activo, fecha_creacion, ultimo_ingreso
            FROM {tenant_schema}.usuarios 
            ORDER BY id 
            LIMIT :limit OFFSET :skip
        """)
        
        result = db.execute(query, {"limit": limit, "skip": skip})
        users = []
        
        for row in result.fetchall():
            users.append({
                "id": row[0],
                "nombre": row[1],
                "correo": row[2],
                "telefono": row[3],
                "rol": row[4],
                "activo": row[5],
                "fecha_creacion": row[6].isoformat() if row[6] else None,
                "ultimo_ingreso": row[7].isoformat() if row[7] else None
            })
        
        return users
        
    except Exception as e:
        print(f"Error obteniendo usuarios del tenant {tenant_schema}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al obtener usuarios del tenant {tenant_schema}"
        )

# Endpoint para obtener un usuario por ID
@app.get("/usuarios/{usuario_id}", response_model=UsuarioSchema)
def get_user(usuario_id: int, db: Session = Depends(get_db)):
    db_user = get_user_by_id(db, usuario_id)
    if db_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )
    return db_user

# Endpoint para actualizar un usuario
@app.put("/usuarios/{usuario_id}", response_model=UsuarioSchema)
def update_user(usuario_id: int, usuario: UsuarioUpdate, db: Session = Depends(get_db)):
    db_user = get_user_by_id(db, usuario_id)
    if db_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )
    
    # Actualizar campos si están presentes
    if usuario.nombre is not None:
        db_user.nombre = usuario.nombre
    if usuario.correo is not None:
        db_user.correo = usuario.correo
    if usuario.telefono is not None:
        db_user.telefono = usuario.telefono
    if usuario.rol is not None:
        db_user.rol = usuario.rol
    if usuario.activo is not None:
        db_user.activo = usuario.activo
    
    db.commit()
    db.refresh(db_user)
    return db_user

# Endpoint para eliminar un usuario
@app.delete("/usuarios/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(usuario_id: int, db: Session = Depends(get_db)):
    db_user = get_user_by_id(db, usuario_id)
    if db_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )
    
    db.delete(db_user)
    db.commit()
    return None

# Endpoint para crear un nuevo usuario (multitenant)
@app.post("/usuarios/", status_code=status.HTTP_201_CREATED)
def create_user_multitenant(usuario: UsuarioCreate, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user_from_token)):
    try:
        tenant_schema = current_user.get('tenant', 'tenant_base')
        
        # Verificar si el correo ya existe en el tenant
        check_query = text(f"""
            SELECT id FROM {tenant_schema}.usuarios 
            WHERE correo = :correo
        """)
        existing_user = db.execute(check_query, {"correo": usuario.correo}).fetchone()
        
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El correo ya está registrado en este tenant"
            )
        
        # Hash de la contraseña
        hashed_password = get_password_hash(usuario.password)
        
        # Insertar nuevo usuario
        insert_query = text(f"""
            INSERT INTO {tenant_schema}.usuarios (nombre, correo, telefono, password, rol, activo, fecha_creacion)
            VALUES (:nombre, :correo, :telefono, :password, :rol, :activo, NOW())
            RETURNING id, nombre, correo, telefono, rol, activo, fecha_creacion, ultimo_ingreso
        """)
        
        result = db.execute(insert_query, {
            "nombre": usuario.nombre,
            "correo": usuario.correo,
            "telefono": usuario.telefono,
            "password": hashed_password,
            "rol": usuario.rol,
            "activo": usuario.activo
        })
        
        db.commit()
        row = result.fetchone()
        
        return {
            "id": row[0],
            "nombre": row[1],
            "correo": row[2],
            "telefono": row[3],
            "rol": row[4],
            "activo": row[5],
            "fecha_creacion": row[6].isoformat() if row[6] else None,
            "ultimo_ingreso": row[7].isoformat() if row[7] else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error creando usuario en tenant {tenant_schema}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al crear usuario en tenant {tenant_schema}"
        )

# Endpoint para actualizar un usuario (multitenant)
@app.put("/usuarios/{usuario_id}", status_code=status.HTTP_200_OK)
def update_user_multitenant(usuario_id: int, usuario: UsuarioUpdate, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user_from_token)):
    try:
        tenant_schema = current_user.get('tenant', 'tenant_base')
        
        # Verificar si el usuario existe
        check_query = text(f"""
            SELECT id FROM {tenant_schema}.usuarios 
            WHERE id = :usuario_id
        """)
        existing_user = db.execute(check_query, {"usuario_id": usuario_id}).fetchone()
        
        if not existing_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuario no encontrado"
            )
        
        # Construir query de actualización dinámicamente
        update_fields = []
        params = {"usuario_id": usuario_id}
        
        if usuario.nombre is not None:
            update_fields.append("nombre = :nombre")
            params["nombre"] = usuario.nombre
        if usuario.correo is not None:
            update_fields.append("correo = :correo")
            params["correo"] = usuario.correo
        if usuario.telefono is not None:
            update_fields.append("telefono = :telefono")
            params["telefono"] = usuario.telefono
        if usuario.rol is not None:
            update_fields.append("rol = :rol")
            params["rol"] = usuario.rol
        if usuario.activo is not None:
            update_fields.append("activo = :activo")
            params["activo"] = usuario.activo
        
        if not update_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No hay campos para actualizar"
            )
        
        update_query = text(f"""
            UPDATE {tenant_schema}.usuarios 
            SET {', '.join(update_fields)}
            WHERE id = :usuario_id
            RETURNING id, nombre, correo, telefono, rol, activo, fecha_creacion, ultimo_ingreso
        """)
        
        result = db.execute(update_query, params)
        db.commit()
        row = result.fetchone()
        
        return {
            "id": row[0],
            "nombre": row[1],
            "correo": row[2],
            "telefono": row[3],
            "rol": row[4],
            "activo": row[5],
            "fecha_creacion": row[6].isoformat() if row[6] else None,
            "ultimo_ingreso": row[7].isoformat() if row[7] else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error actualizando usuario en tenant {tenant_schema}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al actualizar usuario en tenant {tenant_schema}"
        )

# Endpoint para eliminar un usuario (multitenant)
@app.delete("/usuarios/{usuario_id}", status_code=status.HTTP_200_OK)
def delete_user_multitenant(usuario_id: int, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user_from_token)):
    try:
        tenant_schema = current_user.get('tenant', 'tenant_base')
        # Verificar si el usuario existe
        check_query = text(f"SELECT id FROM {tenant_schema}.usuarios WHERE id = :usuario_id")
        existing_user = db.execute(check_query, {"usuario_id": usuario_id}).fetchone()
        if not existing_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuario no encontrado"
            )
        # Eliminar usuario
        delete_query = text(f"DELETE FROM {tenant_schema}.usuarios WHERE id = :usuario_id")
        result = db.execute(delete_query, {"usuario_id": usuario_id})
        db.commit()
        return {"message": "Usuario eliminado exitosamente"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error creando usuario en tenant {tenant_schema}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al crear usuario en tenant {tenant_schema}"
        )

# Endpoint temporal para editar usuario sin autenticación (solo para desarrollo)
@app.put("/usuarios/edit-temp/{usuario_id}", status_code=status.HTTP_200_OK)
def update_user_temp(usuario_id: int, usuario: UsuarioUpdate, db: Session = Depends(get_db)):
    try:
        print(f"Editando usuario ID: {usuario_id}")
        tenant_schema = 'tenant_base'  # Usar tenant base por defecto
        # Verificar si el usuario existe
        check_query = text(f"SELECT id FROM {tenant_schema}.usuarios WHERE id = :usuario_id")
        existing_user = db.execute(check_query, {"usuario_id": usuario_id}).fetchone()
        if not existing_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuario no encontrado"
            )
        # Construir query de actualización dinámicamente
        update_fields = []
        params = {"usuario_id": usuario_id}
        if usuario.nombre is not None:
            update_fields.append("nombre = :nombre")
            params["nombre"] = usuario.nombre
        if usuario.correo is not None:
            update_fields.append("correo = :correo")
            params["correo"] = usuario.correo
        if usuario.telefono is not None:
            update_fields.append("telefono = :telefono")
            params["telefono"] = usuario.telefono
        if usuario.rol is not None:
            update_fields.append("rol = :rol")
            params["rol"] = usuario.rol
        if usuario.activo is not None:
            update_fields.append("activo = :activo")
            params["activo"] = usuario.activo
        if not update_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No hay campos para actualizar"
            )
        update_query = text(f"UPDATE {tenant_schema}.usuarios SET {', '.join(update_fields)} WHERE id = :usuario_id RETURNING id, nombre, correo, telefono, rol, activo, fecha_creacion, ultimo_ingreso")
        result = db.execute(update_query, params)
        db.commit()
        row = result.fetchone()
        return {
            "id": row[0],
            "nombre": row[1],
            "correo": row[2],
            "telefono": row[3],
            "rol": row[4],
            "activo": row[5],
            "fecha_creacion": row[6].isoformat() if row[6] else None,
            "ultimo_ingreso": row[7].isoformat() if row[7] else None
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error actualizando usuario en tenant {tenant_schema}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al actualizar usuario en tenant {tenant_schema}"
        )

# Endpoint temporal para eliminar usuario sin autenticación (solo para desarrollo)
@app.delete("/usuarios/delete-temp/{usuario_id}", status_code=status.HTTP_200_OK)
def delete_user_temp(usuario_id: int, db: Session = Depends(get_db)):
    try:
        print(f"Eliminando usuario ID: {usuario_id}")
        tenant_schema = 'tenant_base'  # Usar tenant base por defecto
        # Verificar si el usuario existe
        check_query = text(f"SELECT id FROM {tenant_schema}.usuarios WHERE id = :usuario_id")
        existing_user = db.execute(check_query, {"usuario_id": usuario_id}).fetchone()
        if not existing_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuario no encontrado"
            )
        # Eliminar usuario
        delete_query = text(f"DELETE FROM {tenant_schema}.usuarios WHERE id = :usuario_id")
        db.execute(delete_query, {"usuario_id": usuario_id})
        db.commit()
        return {"message": "Usuario eliminado exitosamente"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error eliminando usuario en tenant {tenant_schema}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al eliminar usuario en tenant {tenant_schema}"
        )

# Endpoint para cambiar contraseña de un usuario (multitenant)
@app.put("/usuarios/change-password/{usuario_id}")
def change_password_multitenant(usuario_id: int, password_data: dict = Body(...), db: Session = Depends(get_db), current_user: dict = Depends(get_current_user_from_token)):
    """
    # Cambiar contraseña de un usuario respetando el aislamiento multitenant
    """
    # Obtener el tenant del usuario autenticado
    tenant_schema = current_user.get('tenant', 'tenant_base')
    print(f"DEBUG: Usuario autenticado en tenant: {tenant_schema}")
    print(f"DEBUG: Cambiando contraseña para usuario ID {usuario_id} en tenant {tenant_schema}")
    
    # Buscar el usuario SOLO en el tenant del usuario autenticado
    try:
        query = text(f"SELECT id, nombre, correo, telefono, rol, activo, fecha_creacion, ultimo_ingreso FROM {tenant_schema}.usuarios WHERE id = :usuario_id")
        result = db.execute(query, {"usuario_id": usuario_id})
        row = result.fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Usuario con ID {usuario_id} no encontrado en tenant {tenant_schema}"
            )
        usuario_encontrado = {
            "id": row[0],
            "nombre": row[1],
            "correo": row[2],
            "telefono": row[3],
            "rol": row[4],
            "activo": row[5],
            "fecha_creacion": row[6].isoformat() if row[6] else None,
            "ultimo_ingreso": row[7].isoformat() if row[7] else None
        }
        print(f"DEBUG: Usuario encontrado: {usuario_encontrado['correo']} en tenant {tenant_schema}")
    except Exception as e:
        print(f"Error buscando usuario en tenant {tenant_schema}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al buscar usuario en tenant {tenant_schema}"
        )
    # Obtener la nueva contraseña del cuerpo de la petición
    nueva_password = password_data.get("password")
    if not nueva_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Se requiere el campo 'password'"
        )
    print(f"DEBUG: Nueva contraseña recibida para usuario {usuario_id}")
    # Hash de la nueva contraseña
    hashed_password = get_password_hash(nueva_password)
    print(f"DEBUG: Hash generado: {hashed_password[:20]}...")
    # Actualizar la contraseña en la base de datos
    try:
        update_query = text(f"UPDATE {tenant_schema}.usuarios SET password = :password WHERE id = :usuario_id")
        print(f"DEBUG: Ejecutando query: UPDATE {tenant_schema}.usuarios SET password = [HASH] WHERE id = {usuario_id}")
        result = db.execute(update_query, {
            "password": hashed_password,
            "usuario_id": usuario_id
        })
        print(f"DEBUG: Filas afectadas: {result.rowcount}")
        db.commit()
        print("DEBUG: Commit exitoso")
        return {
            "message": "Contraseña actualizada exitosamente",
            "usuario_id": usuario_id,
            "usuario_correo": usuario_encontrado['correo'],
            "tenant": tenant_schema
        }
    except Exception as e:
        db.rollback()
        print(f"Error actualizando contraseña en tenant {tenant_schema}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al actualizar contraseña en tenant {tenant_schema}"
        )

# Endpoint temporal para cambiar contraseña con autenticación (respeta aislamiento multitenant)
@app.put("/usuarios/change-password-temp/{usuario_id}")
def change_password_temp(usuario_id: int, password_data: dict = Body(...), db: Session = Depends(get_db), current_user: dict = Depends(get_current_user_from_token)):
    """
    # Cambiar contraseña de un usuario respetando el aislamiento multitenant
    """
    # Obtener el tenant del usuario autenticado
    tenant_schema = current_user.get('tenant', 'tenant_base')
    print(f"DEBUG: Usuario autenticado en tenant: {tenant_schema}")
    print(f"DEBUG: Cambiando contraseña para usuario ID {usuario_id} en tenant {tenant_schema}")
    
    # Buscar el usuario SOLO en el tenant del usuario autenticado
    try:
        query = text(f"SELECT id, nombre, correo, telefono, rol, activo, fecha_creacion, ultimo_ingreso FROM {tenant_schema}.usuarios WHERE id = :usuario_id")
        result = db.execute(query, {"usuario_id": usuario_id})
        row = result.fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Usuario con ID {usuario_id} no encontrado en tenant {tenant_schema}"
            )
        usuario_encontrado = {
            "id": row[0],
            "nombre": row[1],
            "correo": row[2],
            "telefono": row[3],
            "rol": row[4],
            "activo": row[5],
            "fecha_creacion": row[6].isoformat() if row[6] else None,
            "ultimo_ingreso": row[7].isoformat() if row[7] else None
        }
        print(f"DEBUG: Usuario encontrado: {usuario_encontrado['correo']} en tenant {tenant_schema}")
    except Exception as e:
        print(f"Error buscando usuario en tenant {tenant_schema}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al buscar usuario en tenant {tenant_schema}"
        )
    # Obtener la nueva contraseña del cuerpo de la petición
    nueva_password = password_data.get("password")
    if not nueva_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Se requiere el campo 'password'"
        )
    print(f"DEBUG: Nueva contraseña recibida: {nueva_password}")
    # Hash de la nueva contraseña
    hashed_password = get_password_hash(nueva_password)
    print(f"DEBUG: Hash generado: {hashed_password[:20]}...")
    # Actualizar la contraseña en la base de datos
    try:
        update_query = text(f"UPDATE {tenant_schema}.usuarios SET password = :password WHERE id = :usuario_id")
        print(f"DEBUG: Ejecutando query: UPDATE {tenant_schema}.usuarios SET password = [HASH] WHERE id = {usuario_id}")
        result = db.execute(update_query, {
            "password": hashed_password,
            "usuario_id": usuario_id
        })
        print(f"DEBUG: Filas afectadas: {result.rowcount}")
        db.commit()
        print("DEBUG: Commit exitoso")
        return {
            "message": "Contraseña actualizada exitosamente",
            "usuario_id": usuario_id,
            "usuario_correo": usuario_encontrado['correo'],
            "tenant": tenant_schema
        }
    except Exception as e:
        db.rollback()
        print(f"Error actualizando contraseña en tenant {tenant_schema}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al actualizar contraseña en tenant {tenant_schema}"
        )

# Endpoint para verificar salud del servicio
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "auth_service"}

# =========================
# Aliases bajo /api/auth/* para compatibilidad con el cliente
# (delegan a los handlers existentes ya multitenant)
# =========================

@app.get("/api/auth/usuarios/", response_model=List[UsuarioSchema])
def api_alias_get_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    return get_users(skip=skip, limit=limit, db=db, current_user=current_user)


@app.post("/api/auth/usuarios/", response_model=UsuarioSchema, status_code=status.HTTP_201_CREATED)
def api_alias_create_user(
    usuario: UsuarioCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    return create_user_multitenant(usuario=usuario, db=db, current_user=current_user)


@app.put("/api/auth/usuarios/{usuario_id}", response_model=UsuarioSchema)
def api_alias_update_user(
    usuario_id: int,
    usuario: UsuarioUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    return update_user_multitenant(usuario_id=usuario_id, usuario=usuario, db=db, current_user=current_user)


@app.delete("/api/auth/usuarios/{usuario_id}", status_code=status.HTTP_200_OK)
def api_alias_delete_user(
    usuario_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    return delete_user_multitenant(usuario_id=usuario_id, db=db, current_user=current_user)


@app.put("/api/auth/usuarios/change-password/{usuario_id}")
def api_alias_change_password(
    usuario_id: int,
    password_data: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    return change_password_multitenant(usuario_id=usuario_id, password_data=password_data, db=db, current_user=current_user)

# Endpoint de diagnóstico: lista los esquemas tenant detectados y el tenant por defecto
@app.get("/tenants")
def list_tenants(db: Session = Depends(get_db)):
    try:
        schemas = get_tenant_schemas(db)
        return {"status": "success", "schemas": schemas, "default": DEFAULT_TENANT_SCHEMA}
    except Exception as e:
        return {"status": "error", "message": str(e), "default": DEFAULT_TENANT_SCHEMA}

# Endpoint para inspeccionar el usuario actual (incluye el tenant del JWT)
@app.get("/me")
def who_am_i(current_user: dict = Depends(get_current_user_from_token)):
    """Devuelve los datos decodificados del token (correo, id, rol, tenant)."""
    return current_user

# Timer service startup event
@app.on_event("startup")
async def startup_event():
    """Iniciar el loop de actualización de timers"""
    timer_logger.info("=== STARTUP EVENT EJECUTADO ===")
    timer_logger.info(f"Timer manager inicializado: {timer_manager is not None}")
    timer_logger.info(f"Timer manager timers: {len(timer_manager.timers) if timer_manager else 0}")
    
    task = asyncio.create_task(timer_manager.tick_timers())
    timer_logger.info("=== BACKGROUND TASK CREADO ===")
    timer_logger.info("Servicio de timers iniciado con background task")

# Health check endpoint for timers
@app.get("/api/timers/health")
async def timer_health_check():
    """Endpoint de salud para timers"""
    return {
        "status": "healthy",
        "timers_count": len(timer_manager.timers),
        "connections_count": len(timer_manager.connections),
        "timestamp": datetime.utcnow().isoformat()
    }

# REST API endpoint for timers
@app.get("/api/timers")
async def get_timers():
    """Obtener todos los timers (REST API)"""
    return {
        "timers": [timer.dict() for timer in timer_manager.timers.values()],
        "count": len(timer_manager.timers)
    }

# REST API endpoint para crear timer
@app.post("/api/timers")
async def create_timer(timer_data: dict):
    """Crear un timer via REST API"""
    try:
        # Validar datos mínimos
        if not timer_data.get("nombre"):
            raise HTTPException(status_code=400, detail="nombre es requerido")
        if not timer_data.get("tipoOperacion"):
            raise HTTPException(status_code=400, detail="tipoOperacion es requerido")
        if not timer_data.get("tiempoInicialMinutos"):
            raise HTTPException(status_code=400, detail="tiempoInicialMinutos es requerido")
            
        # Completar datos faltantes para el modelo Timer
        now = get_utc_now()
        tiempo_inicial_minutos = timer_data["tiempoInicialMinutos"]
        tiempo_restante_segundos = tiempo_inicial_minutos * 60
        
        timer_completo = {
            "id": str(uuid.uuid4()),
            "nombre": timer_data["nombre"],
            "tipoOperacion": timer_data["tipoOperacion"],
            "tiempoInicialMinutos": tiempo_inicial_minutos,
            "tiempoRestanteSegundos": tiempo_restante_segundos,
            "fechaInicio": now,
            "fechaFin": now + timedelta(minutes=tiempo_inicial_minutos),
            "activo": True,
            "completado": False
        }
            
        # Crear timer usando el timer_manager
        await timer_manager.create_timer(timer_completo, websocket=None)
        
        return {
            "message": "Timer creado exitosamente",
            "timer_id": timer_completo["id"],
            "timer": timer_completo,
            "timers_count": len(timer_manager.timers)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creando timer: {str(e)}")

# Endpoint para iniciar timers masivos desde inventario
@app.post("/api/inventory/iniciar-timers-masivo")
async def iniciar_timers_masivo(
    request: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    """Iniciar timers para múltiples items del inventario"""
    try:
        tenant_schema = _get_tenant_schema_from_user(current_user)
        items_ids = request.get("items_ids", [])
        tipo_operacion = request.get("tipoOperacion", "congelamiento")
        tiempo_minutos = request.get("tiempoMinutos", 30)
        
        if not items_ids:
            raise HTTPException(status_code=400, detail="Debe proporcionar items_ids")
            
        # Obtener información de los items
        query = text(f"""
            SELECT id, rfid, nombre_unidad 
            FROM {tenant_schema}.inventario_credocubes 
            WHERE id = ANY(:ids) AND activo = true
        """)
        items = db.execute(query, {"ids": items_ids}).fetchall()
        
        if not items:
            raise HTTPException(status_code=404, detail="No se encontraron items válidos")
            
        # Crear timers para cada item
        timers_creados = []
        now = get_utc_now()
        
        for item in items:
            timer_data = {
                "id": str(uuid.uuid4()),
                "nombre": f"Timer {item.nombre_unidad} - {item.rfid}",
                "tipoOperacion": tipo_operacion,
                "tiempoInicialMinutos": tiempo_minutos,
                "tiempoRestanteSegundos": tiempo_minutos * 60,
                "fechaInicio": now,
                "fechaFin": now + timedelta(minutes=tiempo_minutos),
                "activo": True,
                "completado": False,
                "inventario_id": item.id,  # Vincular con el item del inventario
                "rfid": item.rfid
            }
            
            # Crear timer usando el timer_manager
            await timer_manager.create_timer(timer_data, websocket=None)
            timers_creados.append(timer_data)
        
        return {
            "message": f"Timers iniciados para {len(timers_creados)} items",
            "timers_creados": len(timers_creados),
            "timers_activos_total": len(timer_manager.timers),
            "items": [{"id": item.id, "rfid": item.rfid, "nombre": item.nombre_unidad} for item in items]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error iniciando timers masivos: {str(e)}")

# Test endpoint sin autenticación
@app.get("/api/test/simple")
def test_simple():
    return {"status": "working", "message": "Endpoint sin autenticación funcionando"}

# Test endpoint de alertas sin autenticación  
@app.get("/api/test/alerts")
def test_alerts_no_auth():
    return {"status": "working", "message": "Test alertas sin autenticación", "data": []}

# Debug endpoint para ver rutas registradas
@app.get("/debug/routes")
def debug_routes():
    routes = []
    for route in app.routes:
        if hasattr(route, 'methods') and hasattr(route, 'path'):
            routes.append({
                "path": route.path,
                "methods": list(route.methods),
                "name": getattr(route, 'name', 'unnamed')
            })
    return {"routes": routes, "total": len(routes)}

if __name__ == "__main__":
    import uvicorn
    import os
    
    port = int(os.environ.get("PORT", 8001))
    # Ejecutar usando el objeto app directamente para evitar problemas de import
    uvicorn.run(app, host="0.0.0.0", port=port, reload=False)