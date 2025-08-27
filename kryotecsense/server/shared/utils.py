from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from dotenv import load_dotenv
import os

# Cargar variables de entorno
load_dotenv()

# Configuración de JWT
SECRET_KEY = os.getenv("JWT_SECRET")
ALGORITHM = os.getenv("JWT_ALGORITHM")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))

# Configuración de hashing de contraseñas
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica si la contraseña coincide con el hash."""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Genera un hash para la contraseña."""
    return pwd_context.hash(password)

def get_utc_now() -> datetime:
    """
    Obtiene la fecha y hora actual en UTC.
    """
    return datetime.now(timezone.utc)

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    Crea un token JWT de acceso.
    
    Args:
        data: Datos a incluir en el token
        expires_delta: Tiempo de expiración opcional
        
    Returns:
        Token JWT codificado
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = get_utc_now() + expires_delta
    else:
        expire = get_utc_now() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    
    return encoded_jwt

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Decodifica un token JWT y valida su expiración.
    
    Args:
        token: Token JWT a decodificar
        
    Returns:
        Datos del token si es válido, None si no
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        print(f"DEBUG: Token decodificado exitosamente. Payload: {payload}")
        return payload
    except JWTError as e:
        print(f"DEBUG: Error decodificando token: {e}")
        return None

def get_current_user_from_token(token: str = Depends(oauth2_scheme)):
    """
    Obtiene el usuario actual desde el token JWT.
    
    Args:
        token: Token JWT
        
    Returns:
        Datos del usuario
        
    Raises:
        HTTPException: Si el token es inválido
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = decode_access_token(token)
        if payload is None:
            raise credentials_exception
            
        correo: str = payload.get("sub")
        user_id: int = payload.get("id")
        rol: str = payload.get("rol")
        tenant: str = payload.get("tenant", "tenant_base")  # Default a tenant_base si no existe
        
        print(f"DEBUG: Extrayendo datos del JWT - correo: {correo}, id: {user_id}, rol: {rol}, tenant: {tenant}")
        
        if correo is None or user_id is None:
            raise credentials_exception
            
        user_data = {
            "correo": correo,
            "id": user_id,
            "rol": rol,
            "tenant": tenant
        }
        print(f"DEBUG: Datos del usuario final: {user_data}")
        return user_data
    except JWTError:
        raise credentials_exception
