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
from typing import List, Dict
from pydantic import BaseModel

# Importar message queue para publicar eventos
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

# from shared.message_queue import message_queue, publish_timer_completed
# Comentado temporalmente para evitar dependencia de aio_pika

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


# Frontend routes are now handled by Nginx

# Event handlers
# @app.on_event("startup")
# async def startup_event():
#     """Inicializar conexión a RabbitMQ"""
#     try:
#         await message_queue.connect()
#         print("🚀 API Gateway conectado a RabbitMQ exitosamente")
#     except Exception as e:
#         print(f"❌ Error conectando a RabbitMQ en API Gateway: {e}")

# @app.on_event("shutdown")
# async def shutdown_event():
#     """Cerrar conexión a RabbitMQ"""
#     await message_queue.disconnect()
#     print("🛑 API Gateway desconectado de RabbitMQ")

# Configuración de CORS para permitir peticiones desde el frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173", 
        "http://localhost:5174", 
        "http://127.0.0.1:5174",
        "https://kryotecsense-production.up.railway.app",  # Railway production URL
    ], # Orígenes permitidos
    allow_credentials=True,
    allow_methods=["*"], # Métodos permitidos
    allow_headers=["*"], # Cabeceras permitidas
)

# URLs de los servicios internos usando nombres de contenedor Docker
SERVICE_URLS = {
    "auth": "http://auth_service:8001",
    "inventory": "http://inventory_service:8002",
    "alerts": "http://alerts_service:8003",
    "activities": "http://activities_service:8004",
    "reports": "http://reports_service:8005",
    "dashboard": "http://inventory_service:8002",  # Dashboard metrics from inventory
    # Añade otros servicios aquí si es necesario
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

# Endpoint específico para eventos de timer completado
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
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)