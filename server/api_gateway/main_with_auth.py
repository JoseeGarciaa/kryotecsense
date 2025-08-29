#!/usr/bin/env python3
"""
API Gateway Unificado - KryotecSense
Gestiona autenticación y temporizadores desde un solo servicio
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Set
import uuid
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
import uvicorn

# JWT imports
from jose import JWTError, jwt
from passlib.context import CryptContext

# Database imports
from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuración JWT
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here-please-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Configuración base de datos
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:pass@localhost/dbname")

# Configuración de password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Configurar base de datos
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Modelo de usuario para la base de datos
class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

# Crear tablas
Base.metadata.create_all(bind=engine)

# Funciones de utilidad para fechas
def get_utc_now():
    """Obtener tiempo UTC actual con zona horaria"""
    return datetime.now(timezone.utc)

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

# Modelos Pydantic para autenticación
class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    is_active: bool

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

# Modelos para timers
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

# Funciones de autenticación
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_user(db: Session, username: str):
    return db.query(User).filter(User.username == username).first()

def authenticate_user(db: Session, username: str, password: str):
    user = get_user(db, username)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except JWTError:
        raise credentials_exception
    user = get_user(db, username=token_data.username)
    if user is None:
        raise credentials_exception
    return user

# Timer Manager (copiado del timer service)
class TimerManager:
    def __init__(self):
        self.timers: Dict[str, Timer] = {}
        self.connections: Set[WebSocket] = set()
        self.running = True
        self.server_start_time = get_utc_now()
        
    def get_server_timestamp(self):
        """Obtener timestamp del servidor en milisegundos"""
        return int(get_utc_now().timestamp() * 1000)
        
    def calculate_remaining_time(self, timer: Timer) -> int:
        """Calcular tiempo restante basado SOLO en tiempo del servidor"""
        server_now = get_utc_now()
        if timer.fechaFin <= server_now:
            return 0
        
        remaining_seconds = int((timer.fechaFin - server_now).total_seconds())
        return max(0, remaining_seconds)
        
    async def add_connection(self, websocket: WebSocket):
        """Agregar nueva conexión WebSocket"""
        self.connections.add(websocket)
        logger.info(f"Nueva conexión WebSocket. Total: {len(self.connections)}")
        
        # ENVIAR ESTADO ACTUAL CON TIEMPO DEL SERVIDOR
        server_timestamp = self.get_server_timestamp()
        timers_data = []
        
        for timer in self.timers.values():
            remaining_time = self.calculate_remaining_time(timer)
            
            # Actualizar el timer con el tiempo calculado por el servidor
            timer.tiempoRestanteSegundos = remaining_time
            timer.completado = remaining_time == 0
            timer.activo = timer.activo and not timer.completado
            
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
                
        # Remover conexiones desconectadas
        for conn in disconnected:
            await self.remove_connection(conn)
            
    async def create_timer(self, timer_data: Dict, websocket: Optional[WebSocket] = None):
        """Crear nuevo temporizador basado en tiempo del servidor"""
        timer_id = timer_data.get('id')
        if timer_id and timer_id in self.timers:
            logger.info(f"Timer ya existe, actualizando: {timer_id}")
            await self.update_timer(timer_id, timer_data, websocket)
            return
        
        # Usar tiempo del servidor para crear el timer
        server_now = get_utc_now()
        
        # Si vienen fechas del cliente, las ignoramos y usamos las del servidor
        duracion_minutos = timer_data.get('tiempoInicialMinutos', 0)
        
        # Crear fechas basadas en el servidor
        fecha_inicio = server_now
        fecha_fin = server_now + timedelta(minutes=duracion_minutos)
        
        timer_data['fechaInicio'] = fecha_inicio
        timer_data['fechaFin'] = fecha_fin
        timer_data['tiempoRestanteSegundos'] = duracion_minutos * 60
        
        timer = Timer(**timer_data)
        self.timers[timer.id] = timer
        
        logger.info(f"Timer creado con tiempo del servidor: {timer.nombre} ({timer.id}) - {duracion_minutos} minutos")
        
        # Broadcast a todos los clientes
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
        """Actualizar todos los timers activos cada segundo - TIEMPO DEL SERVIDOR"""
        while self.running:
            try:
                server_timestamp = self.get_server_timestamp()
                updates_to_send = []
                
                for timer_id, timer in list(self.timers.items()):
                    # Calcular tiempo restante basado SOLO en el servidor
                    remaining_time = self.calculate_remaining_time(timer)
                    
                    # El servidor es la ÚNICA fuente de verdad
                    old_remaining = timer.tiempoRestanteSegundos
                    timer.tiempoRestanteSegundos = remaining_time
                    
                    # Verificar si se completó
                    if remaining_time == 0 and not timer.completado:
                        timer.completado = True
                        timer.activo = False
                        logger.info(f"Timer completado: {timer.nombre} ({timer_id})")
                    
                    # SIEMPRE enviar actualización para timers activos O si cambió el estado
                    if timer.activo or (old_remaining != remaining_time):
                        updates_to_send.append({
                            "timerId": timer_id,
                            "tiempoRestanteSegundos": remaining_time,
                            "completado": timer.completado,
                            "activo": timer.activo,
                            "server_timestamp": server_timestamp
                        })
                
                # Enviar todas las actualizaciones
                for update in updates_to_send:
                    await self.broadcast({
                        "type": "TIMER_TIME_UPDATE",
                        "data": update
                    })
                
                await asyncio.sleep(1)  # Tick cada segundo exacto
                
            except Exception as e:
                logger.error(f"Error en tick_timers: {e}")
                await asyncio.sleep(1)

# Crear la aplicación FastAPI
app = FastAPI(
    title="KryotecSense API Gateway",
    description="API Gateway Unificado con Autenticación y Temporizadores",
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

# Instancia global del timer manager
timer_manager = TimerManager()

@app.on_event("startup")
async def startup_event():
    """Iniciar el loop de actualización de timers"""
    asyncio.create_task(timer_manager.tick_timers())
    logger.info("API Gateway iniciado con servicio de timers y autenticación")

@app.on_event("shutdown")
async def shutdown_event():
    """Detener el servicio"""
    timer_manager.running = False
    logger.info("API Gateway detenido")

# Rutas de autenticación
@app.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/register", response_model=UserResponse)
async def register_user(user: UserCreate, db: Session = Depends(get_db)):
    # Verificar si el usuario ya existe
    db_user = get_user(db, user.username)
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    # Crear nuevo usuario
    hashed_password = get_password_hash(user.password)
    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    return UserResponse(
        id=db_user.id,
        username=db_user.username,
        email=db_user.email,
        is_active=db_user.is_active
    )

@app.get("/users/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        is_active=current_user.is_active
    )

# Rutas de timers
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
            
            # Procesar mensaje según tipo
            message_type = message.get("type")
            message_data = message.get("data", {})
            
            if message_type == "REQUEST_SYNC":
                # Cliente solicita sincronización completa
                server_timestamp = timer_manager.get_server_timestamp()
                timers_data = []
                
                for timer in timer_manager.timers.values():
                    remaining_time = timer_manager.calculate_remaining_time(timer)
                    
                    # Actualizar timer con tiempo del servidor
                    timer.tiempoRestanteSegundos = remaining_time
                    timer.completado = remaining_time == 0
                    timer.activo = timer.activo and not timer.completado
                    
                    timers_data.append({
                        **timer.to_dict(),
                        "server_remaining_time": remaining_time,
                        "server_timestamp": server_timestamp
                    })
                
                logger.info(f"Sincronización solicitada - enviando {len(timers_data)} timers con tiempo del servidor")
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
        "service": "api_gateway",
        "timers_count": len(timer_manager.timers),
        "connections_count": len(timer_manager.connections),
        "timestamp": get_utc_now().isoformat()
    }

@app.get("/timers")
async def get_timers():
    """Obtener todos los timers con tiempos recalculados (REST API)"""
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

@app.post("/timers/sync")
async def force_sync():
    """Forzar sincronización de todos los timers (REST API)"""
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

if __name__ == "__main__":
    # Allow PORT to be provided by the platform (e.g., Railway)
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        reload=False,
        log_level="info"
    )
