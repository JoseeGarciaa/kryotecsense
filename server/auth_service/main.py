from fastapi import FastAPI, Depends, HTTPException, status, Body, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import text

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
from datetime import datetime, timedelta
from typing import List, Optional, Dict
from pydantic import BaseModel
import json
import asyncio

from shared.database import get_db, get_engine
from shared.utils import verify_password, get_password_hash, create_access_token, get_current_user_from_token
from .models import Usuario
from .schemas import UsuarioCreate, Usuario as UsuarioModel, UsuarioSchema, Token, LoginRequest, UsuarioUpdate

# Crear aplicación FastAPI
app = FastAPI(
    title="Servicio de Autenticación - KryoTecSense",
    description="Microservicio para gestión de usuarios y autenticación",
    version="1.0.0"
)

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


allow_all = os.getenv("CORS_ALLOW_ALL", "false").lower() == "true"
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
        },
    }

# ==========================================================
#  WebSocket de Timers + Endpoint de Alertas (monolito)
#  Esto permite usar solo CLIENT + este BACKEND.
#  El cliente se conecta a wss://<backend>/ws/timers y
#  publica eventos a POST /api/alerts/timer-completed
# ==========================================================

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


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"✅ Nueva conexión WebSocket (timers). Total: {len(self.active_connections)}")

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
        for conn in disconnected:
            self.disconnect(conn)


manager = ConnectionManager()


@app.websocket("/ws/timers")
async def websocket_timers(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            print(f"📨 [WS timers] Recibido: {data}")
            try:
                message = json.loads(data)
            except json.JSONDecodeError as e:
                await manager.send_personal_message(json.dumps({"error": "Invalid JSON", "details": str(e)}), websocket)
                continue

            # Lógica de mensajes esperados
            if message.get("type") == "REQUEST_SYNC":
                # Aquí podrías recuperar timers persistidos si existiera almacenamiento en servidor
                await manager.send_personal_message(json.dumps({"type": "TIMER_SYNC", "data": {"timers": []}}), websocket)
            elif message.get("broadcast"):
                await manager.broadcast(json.dumps({"type": "broadcast", "data": message}))
            else:
                # ACK tipado para que el cliente no lo marque como desconocido
                await manager.send_personal_message(json.dumps({"type": "ACK", "data": message}), websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"❌ Error en WebSocket timers: {e}")
        manager.disconnect(websocket)


async def send_ws_notification(message_type: str, data: Dict):
    await manager.broadcast(json.dumps({"type": message_type, "data": data}))


@app.post("/api/alerts/timer-completed")
async def handle_timer_completed(event: TimerCompletedEvent):
    try:
        await send_ws_notification("timer_completed", event.model_dump())
        print(f"✅ Evento timer-completed procesado para: {event.timer.nombre}")
        return {"status": "success"}
    except Exception as e:
        print(f"❌ Error procesando timer-completed: {e}")
        raise HTTPException(status_code=500, detail=f"Error procesando evento: {e}")

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

if __name__ == "__main__":
    import uvicorn
    import os
    
    port = int(os.environ.get("PORT", 8001))
    # Ejecutar usando el objeto app directamente para evitar problemas de import
    uvicorn.run(app, host="0.0.0.0", port=port, reload=False)