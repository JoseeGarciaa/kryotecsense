from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, HTTPException
# El frontend ahora es servido por Nginx
# FastAPI solo maneja las rutas de API y WebSocket
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
import json
import asyncio
from typing import List, Dict, Set
from pydantic import BaseModel, Field
from datetime import datetime, timezone
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

# TimerManager integrado
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

# Modelos para eventos
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

# Crear aplicación FastAPI para el API Gateway
app = FastAPI(
    title="API Gateway - KryoTecSense",
    description="Punto de entrada único para todos los microservicios.",
    version="1.0.0"
)

# Configurar tipos MIME específicos para archivos estáticos
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    app.mount("/assets", 
             StaticFiles(
                 directory=os.path.join(static_dir, "assets"),
                 html=False,
                 check_dir=True
             ), 
             name="assets")
    
    # Servir otros archivos estáticos desde la raíz
    app.mount("/",
             StaticFiles(
                 directory=static_dir,
                 html=True,
                 check_dir=True
             ),
             name="static")


# Instancia global del timer manager
timer_manager = TimerManager()

# Event handlers
@app.on_event("startup")
async def startup_event():
    """Inicializar servicios"""
    try:
        # Iniciar el timer manager
        asyncio.create_task(timer_manager.tick_timers())
        print("🚀 Timer Manager iniciado en API Gateway")
        
        # await message_queue.connect()
        # print("🚀 API Gateway conectado a RabbitMQ exitosamente")
    except Exception as e:
        print(f"❌ Error en startup: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    """Cerrar servicios"""
    timer_manager.running = False
    # await message_queue.disconnect()
    print("🛑 API Gateway servicios detenidos")

# Configuración de CORS para permitir peticiones desde el frontend
frontend_origin = os.getenv("FRONTEND_ORIGIN")
additional_origins = [o.strip() for o in os.getenv("CORS_ADDITIONAL_ORIGINS", "").split(",") if o.strip()]
default_local_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]
allow_origins = default_local_origins + additional_origins
if frontend_origin:
    allow_origins.append(frontend_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# URLs de los servicios internos usando nombres de contenedor Docker
def _service_url(name: str, default_host: str, default_port: str) -> str:
    # Permitir pasar URL completa por env (e.g., https://service.up.railway.app)
    url = os.getenv(f"{name.upper()}_SERVICE_URL")
    if url:
        return url.rstrip("/")
    # O bien construir con HOST/PORT
    host = os.getenv(f"{name.upper()}_SERVICE_HOST", default_host)
    port = os.getenv(f"{name.upper()}_SERVICE_PORT", default_port)
    scheme = os.getenv(f"{name.upper()}_SERVICE_SCHEME", "http")
    return f"{scheme}://{host}:{port}"

SERVICE_URLS = {
    "auth": _service_url("auth", "auth_service", "8001"),
    "inventory": _service_url("inventory", "inventory_service", "8002"),
    "alerts": _service_url("alerts", "alerts_service", "8003"),
    "activities": _service_url("activities", "activities_service", "8004"),
    "reports": _service_url("reports", "reports_service", "8005"),
    "timer": _service_url("timer", "timer_service", "8006"),
    # Dashboard usa inventario
    "dashboard": _service_url("inventory", "inventory_service", "8002"),
}

# Clase para manejar conexiones WebSocket
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"✅ Nueva conexión WebSocket. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        print(f"🔌 Conexión WebSocket cerrada. Total: {len(self.active_connections)}")

    async def send_personal_message(self, message: str, websocket: WebSocket):
        try:
            await websocket.send_text(message)
        except Exception as e:
            print(f"❌ Error enviando mensaje personal: {e}")
            self.disconnect(websocket)

    async def broadcast(self, message: str):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                print(f"❌ Error en broadcast: {e}")
                disconnected.append(connection)
        
        # Remover conexiones desconectadas
        for conn in disconnected:
            self.disconnect(conn)

# Crear instancia del gestor de conexiones
manager = ConnectionManager()

# Endpoint WebSocket para operaciones
@app.websocket("/ws/operaciones/")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Esperar a recibir mensajes
            data = await websocket.receive_text()
            print(f"📨 Mensaje WebSocket recibido: {data}")
            
            # Procesar el mensaje recibido
            try:
                message = json.loads(data)
                print(f"📝 Mensaje parseado: {message}")
                
                # Aquí puedes implementar la lógica para manejar diferentes tipos de mensajes
                # Por ejemplo, enviar notificaciones a otros servicios o actualizar el estado
                
                # Enviar respuesta al cliente
                response = {
                    "status": "received", 
                    "data": message,
                    "timestamp": json.dumps(None, default=str)  # Placeholder para timestamp
                }
                await manager.send_personal_message(json.dumps(response), websocket)
                
                # Si es necesario, también puedes transmitir el mensaje a todos los clientes conectados
                if message.get("broadcast", False):
                    broadcast_message = {
                        "type": "broadcast", 
                        "data": message
                    }
                    await manager.broadcast(json.dumps(broadcast_message))
                    
            except json.JSONDecodeError as e:
                error_response = {"error": "Invalid JSON format", "details": str(e)}
                await manager.send_personal_message(json.dumps(error_response), websocket)
                
    except WebSocketDisconnect:
        print("🔌 Cliente WebSocket desconectado")
        manager.disconnect(websocket)
    except Exception as e:
        print(f"❌ Error en WebSocket: {e}")
        manager.disconnect(websocket)

# WebSocket directo para Timer Service (integrado)
@app.websocket("/ws/timers")
async def timer_websocket_endpoint(websocket: WebSocket):
    """Endpoint WebSocket para timers - integrado directamente"""
    await websocket.accept()
    await timer_manager.add_connection(websocket)
    
    try:
        while True:
            # Recibir mensaje del cliente
            data = await websocket.receive_text()
            message = json.loads(data)
            
            print(f"� Timer WebSocket mensaje: {message.get('type', 'UNKNOWN')}")
            
            # Procesar mensaje según tipo
            message_type = message.get("type")
            message_data = message.get("data", {})
            
            if message_type == "REQUEST_SYNC":
                # Cliente solicita sincronización completa
                current_time = get_utc_now()
                timers_actualizados = []
                
                for timer in timer_manager.timers.values():
                    # Recalcular tiempo restante basado en tiempo actual para máxima precisión
                    tiempo_restante_ms = (timer.fechaFin - current_time).total_seconds()
                    nuevo_tiempo_restante = max(0, int(tiempo_restante_ms))
                    
                    # Actualizar timer con tiempo preciso
                    timer.tiempoRestanteSegundos = nuevo_tiempo_restante
                    timer.completado = nuevo_tiempo_restante == 0
                    timer.activo = timer.activo and not timer.completado
                    
                    timers_actualizados.append(timer.to_dict())
                
                print(f"🔄 Sincronización - enviando {len(timers_actualizados)} timers")
                await timer_manager.send_to_client(websocket, {
                    "type": "TIMER_SYNC",
                    "data": {
                        "timers": timers_actualizados,
                        "server_time": current_time.isoformat()
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
                print(f"⚠️ Tipo de mensaje timer no reconocido: {message_type}")
                
    except WebSocketDisconnect:
        print("🔌 Cliente timer WebSocket desconectado")
    except Exception as e:
        print(f"❌ Error en timer WebSocket: {e}")
    finally:
        await timer_manager.remove_connection(websocket)

# Método para enviar notificaciones a través de WebSocket desde otros servicios
# Este método puede ser llamado por otros endpoints cuando ocurren eventos importantes
async def send_websocket_notification(message_type: str, data: Dict):
    message = json.dumps({"type": message_type, "data": data})
    await manager.broadcast(message)
    print(f"📡 Notificación WebSocket enviada: {message_type}")

# Specific route for token
@app.post("/token")
async def token_proxy(request: Request):
    target_service_url = SERVICE_URLS.get("auth")
    if not target_service_url:
        raise HTTPException(status_code=500, detail="Auth service not configured")

    url = f"{target_service_url}/token"
    print(f"🔗 Proxy token request to: {url}")
    
    headers = dict(request.headers)
    content = await request.body()
    print(f"📦 Request content length: {len(content)}")

    async with httpx.AsyncClient() as client:
        try:
            print(f"📡 Sending request to auth service...")
            response = await client.post(url, content=content, headers=headers, timeout=60.0)
            print(f"✅ Auth service responded with status: {response.status_code}")
            response_headers = dict(response.headers)
            response_headers.pop("content-encoding", None)
            return Response(content=response.content, status_code=response.status_code, headers=response_headers)
        except httpx.RequestError as e:
            print(f"❌ Error connecting to auth service: {e}")
            raise HTTPException(status_code=503, detail=f"Error connecting with auth service: {e}")

# Endpoint específico para debug de inventory
@app.get("/api/inventory/debug/items-bodega-sin-auth")
async def debug_inventory():
    """Endpoint temporal de debug para items de bodega sin autenticación"""
    target_service_url = SERVICE_URLS.get("inventory")
    if not target_service_url:
        raise HTTPException(status_code=500, detail="Inventory service not configured")

    url = f"{target_service_url}/debug/items-bodega-sin-auth"
    print(f"🔗 Debug request to inventory service: {url}")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, timeout=60.0)
            print(f"✅ Inventory service debug responded with status: {response.status_code}")
            return response.json()
        except httpx.RequestError as e:
            print(f"❌ Error connecting to inventory service debug: {e}")
            raise HTTPException(status_code=503, detail=f"Error connecting with inventory service: {e}")

# Endpoints REST para Timer Service (integrado)
@app.get("/api/timer/health")
async def timer_health_check():
    """Endpoint de salud para timer service"""
    return {
        "status": "healthy",
        "timers_count": len(timer_manager.timers),
        "connections_count": len(timer_manager.connections),
        "timestamp": get_utc_now().isoformat(),
        "service": "timer_integrated"
    }

@app.get("/api/timer/timers")
async def get_timers():
    """Obtener todos los timers con tiempos recalculados"""
    current_time = get_utc_now()
    timers_actualizados = []
    
    for timer in timer_manager.timers.values():
        # Recalcular tiempo restante basado en tiempo actual para máxima precisión
        tiempo_restante_ms = (timer.fechaFin - current_time).total_seconds()
        nuevo_tiempo_restante = max(0, int(tiempo_restante_ms))
        
        # Actualizar timer con tiempo preciso
        timer.tiempoRestanteSegundos = nuevo_tiempo_restante
        timer.completado = nuevo_tiempo_restante == 0
        timer.activo = timer.activo and not timer.completado
        
        timers_actualizados.append(timer.to_dict())
    
    return {
        "timers": timers_actualizados,
        "count": len(timers_actualizados),
        "server_time": current_time.isoformat()
    }

@app.post("/api/timer/sync")
async def force_timer_sync():
    """Forzar sincronización de todos los timers"""
    current_time = get_utc_now()
    timers_actualizados = []
    
    for timer in timer_manager.timers.values():
        # Recalcular tiempo restante basado en tiempo actual para máxima precisión
        tiempo_restante_ms = (timer.fechaFin - current_time).total_seconds()
        nuevo_tiempo_restante = max(0, int(tiempo_restante_ms))
        
        # Actualizar timer con tiempo preciso
        timer.tiempoRestanteSegundos = nuevo_tiempo_restante
        timer.completado = nuevo_tiempo_restante == 0
        timer.activo = timer.activo and not timer.completado
        
        timers_actualizados.append(timer.to_dict())
    
    # Broadcast a todos los clientes conectados
    if timers_actualizados:
        await timer_manager.broadcast({
            "type": "TIMER_SYNC",
            "data": {
                "timers": timers_actualizados,
                "server_time": current_time.isoformat()
            }
        })
    
    return {
        "message": "Sincronización forzada completada",
        "timers": timers_actualizados,
        "count": len(timers_actualizados),
        "server_time": current_time.isoformat()
    }
@app.post("/api/alerts/timer-completed")
async def handle_timer_completed(event: TimerCompletedEvent):
    """Manejar eventos de timer completado (sin RabbitMQ por ahora)"""
    try:
        # # Publicar evento en RabbitMQ para que el servicio de alertas lo procese
        # await publish_timer_completed(event.model_dump())
        
        # Enviar notificación por WebSocket a clientes conectados
        await send_websocket_notification("timer_completed", event.model_dump())
        
        print(f"✅ Evento de timer completado procesado para TIC: {event.timer.nombre}")
        
        return {"status": "success", "message": "Evento de timer completado procesado correctamente"}
        
    except Exception as e:
        print(f"❌ Error procesando evento de timer completado: {e}")
        raise HTTPException(status_code=500, detail=f"Error procesando evento: {str(e)}")

# General proxy for other routes
@app.api_route("/api/{service}/{actual_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def general_proxy(request: Request, service: str, actual_path: str):
    target_service_url = SERVICE_URLS.get(service)
    if not target_service_url:
        raise HTTPException(status_code=404, detail=f"Servicio '{service}' no encontrado.")

    url = f"{target_service_url}/{actual_path}"
    
    headers = dict(request.headers)
    params = request.query_params
    content = await request.body()
    method = request.method

    async with httpx.AsyncClient() as client:
        try:
            response = await client.request(
                method=method,
                url=url,
                headers=headers,
                params=params,
                content=content,
                timeout=60.0,
            )
            response_headers = dict(response.headers)
            response_headers.pop("content-encoding", None)
            return Response(content=response.content, status_code=response.status_code, headers=response_headers)
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Error conectando con el servicio '{service}': {e}")

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "api_gateway"}

if __name__ == "__main__":
    import uvicorn
    import os
    
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port, reload=False)