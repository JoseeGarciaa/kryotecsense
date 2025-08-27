from fastapi import FastAPI, Depends, HTTPException, status, Body
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
from typing import List, Optional

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

# Configuración de CORS
origins = [
    "http://localhost",
    "http://localhost:5173", # Asume el puerto por defecto de Vite
    "http://127.0.0.1",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuración de OAuth2
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Función para obtener todos los esquemas de tenant
def get_tenant_schemas(db: Session):
    from sqlalchemy import text
    try:
        result = db.execute(text("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%'"))
        schemas = [row[0] for row in result.fetchall()]
        return schemas
    except Exception as e:
        print(f"Error obteniendo esquemas de tenant: {e}")
        try:
            # Usar tenant_base por defecto para la prueba
            tenant_schema = "tenant_base"
            print(f"DEBUG: Endpoint /usuarios/test usando tenant: {tenant_schema}")
            query = text(f"SELECT id, nombre, correo, telefono, rol, activo, fecha_creacion, ultimo_ingreso FROM {tenant_schema}.usuarios ORDER BY id LIMIT 10")
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
                    "ultimo_ingreso": row[7].isoformat() if row[7] else None
                })
            print(f"DEBUG: Retornando {len(users)} usuarios de {tenant_schema}")
            for user in users:
                print(f"  - ID: {user['id']}, Email: {user['correo']}, Nombre: {user['nombre']}")
            return {"status": "success", "users": users, "count": len(users)}
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    print(f"Usuario {correo} no encontrado en ningún tenant")
    return None

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
def get_users_test(db: Session = Depends(get_db)):
    from sqlalchemy import text
    try:
        # Usar esquema por defecto configurable
        tenant_schema = DEFAULT_TENANT_SCHEMA
        print(f"DEBUG: Endpoint /usuarios/test usando tenant: {tenant_schema}")
        query = text(f"SELECT id, nombre, correo, telefono, rol, activo, fecha_creacion, ultimo_ingreso FROM {tenant_schema}.usuarios ORDER BY id LIMIT 10")
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
                "ultimo_ingreso": row[7].isoformat() if row[7] else None
            })
        print(f"DEBUG: Retornando {len(users)} usuarios de {tenant_schema}")
        for user in users:
            print(f"  - ID: {user['id']}, Email: {user['correo']}, Nombre: {user['nombre']}")
        return {"status": "success", "users": users, "count": len(users)}
    except Exception as e:
        # No lanzar 500; retornar detalle para diagnóstico
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