# Despliegue en Railway (monorepo, Docker)

Este proyecto está listo para desplegarse en Railway usando Docker por servicio.
No se sube base de datos; usa una PostgreSQL ya existente en la nube.

## Servicios a crear en Railway

Crea un servicio por cada uno:

- client (Frontend React + Nginx)
- api-gateway (FastAPI)
- auth-service (FastAPI)
- inventory-service (FastAPI)
- alerts-service (FastAPI)
- activities-service (FastAPI)
- reports-service (FastAPI)
- timer-service (FastAPI + WebSocket)

## 1) Conectar el repo

1. En Railway, crea un proyecto y elige “Deploy from GitHub repo”.
2. Selecciona este repositorio.

## 2) Crear servicios y apuntar al subdirectorio correcto

Para cada servicio usa estos valores.

- client
  - Root Directory: `client`
  - Dockerfile: `client/Dockerfile`
  - Start Command: (vacío; usa el CMD del Dockerfile de Nginx)
  - Build variables (scope Build):
    - `VITE_API_URL = https://<api-gateway>.up.railway.app`
    - `VITE_TIMER_WS_URL = wss://<timer-service>.up.railway.app/ws/timers`

- api-gateway
  - Root Directory: `server`
  - Dockerfile: `server/api_gateway/Dockerfile`
  - Start Command:
    - `uvicorn api_gateway.main:app --host 0.0.0.0 --port $PORT`
  - Runtime variables:
    - `FRONTEND_ORIGIN = https://<client>.up.railway.app`
    - `CORS_ADDITIONAL_ORIGINS =` (opcional, lista separada por coma)
    - `AUTH_SERVICE_URL = https://<auth-service>.up.railway.app`
    - `INVENTORY_SERVICE_URL = https://<inventory-service>.up.railway.app`
    - `ALERTS_SERVICE_URL = https://<alerts-service>.up.railway.app`
    - `ACTIVITIES_SERVICE_URL = https://<activities-service>.up.railway.app`
    - `REPORTS_SERVICE_URL = https://<reports-service>.up.railway.app`
    - (DB y JWT no son usados directamente aquí, pero puedes mantenerlos si quieres)

- auth-service
  - Root Directory: `server`
  - Dockerfile: `server/Dockerfile`
  - Start Command:
    - `uvicorn auth_service.main:app --host 0.0.0.0 --port $PORT`
  - Runtime variables (DB + Auth):
    - `DB_HOST = <host de tu Postgres en la nube>`
    - `DB_PORT = 5432`
    - `DB_USER = <user>`
    - `DB_PASSWORD = <password>`
    - `DB_NAME = <db>`
    - `JWT_SECRET = <cadena segura>`
    - `JWT_ALGORITHM = HS256`
    - `ACCESS_TOKEN_EXPIRE_MINUTES = 30`

- inventory-service
  - Root Directory: `server`
  - Dockerfile: `server/Dockerfile`
  - Start Command:
    - `uvicorn inventory_service.main:app --host 0.0.0.0 --port $PORT`
  - Runtime variables (DB): mismas que auth-service

- alerts-service
  - Root Directory: `server`
  - Dockerfile: `server/Dockerfile`
  - Start Command:
    - `uvicorn alerts_service.main:app --host 0.0.0.0 --port $PORT`
  - Runtime variables (DB): mismas que auth-service
  - RabbitMQ: opcional. Si no configuras, el servicio sigue en pie (continúa sin MQ).
    - `RABBITMQ_HOST`, `RABBITMQ_PORT`, `RABBITMQ_USER`, `RABBITMQ_PASS` (si decides añadir un RabbitMQ)

- activities-service
  - Root Directory: `server`
  - Dockerfile: `server/Dockerfile`
  - Start Command:
    - `uvicorn activities_service.main:app --host 0.0.0.0 --port $PORT`
  - Runtime variables (DB): mismas que auth-service

- reports-service
  - Root Directory: `server`
  - Dockerfile: `server/Dockerfile`
  - Start Command:
    - `uvicorn reports_service.main:app --host 0.0.0.0 --port $PORT`
  - Runtime variables (DB): mismas que auth-service

- timer-service
  - Root Directory: `server`
  - Dockerfile: `server/Dockerfile`
  - Start Command:
    - `uvicorn timer_service.main:app --host 0.0.0.0 --port $PORT --ws auto`
  - Runtime variables: (ninguna obligatoria)

Notas:
- Usa el dominio público de cada servicio de Railway (botón “Open”/“Settings > Domains”) para rellenar las variables `*_SERVICE_URL` y las del frontend.
- Asegúrate de que tu base de datos acepta conexiones desde Railway (IP/Allowlist, SSL si aplica).

## 3) Orden de despliegue recomendado

1) Desplegar auth-service, inventory-service, activities-service, reports-service, alerts-service, timer-service.
2) Cuando cada uno tenga dominio público, configúralos en api-gateway mediante las variables `*_SERVICE_URL` y `FRONTEND_ORIGIN`.
3) Desplegar api-gateway.
4) Configurar variables de build del cliente (`VITE_API_URL`, `VITE_TIMER_WS_URL`) y desplegar client.

## 4) Comprobaciones rápidas

- `GET https://<api-gateway>/health` → debe responder `{ "status": "ok" }`.
- `GET https://<inventory-service>/health` → ok.
- `GET https://<auth-service>/usuarios/test` → debe responder si DB está bien conectada.
- En el frontend, el login debe redirigir correctamente y el dashboard cargar datos.
- El WebSocket de timers debe conectar a `wss://<timer-service>/ws/timers`.

## 5) Opcional: RabbitMQ

El sistema funciona sin RabbitMQ (se usa WebSocket directo y endpoints HTTP).
Si más adelante quieres habilitar eventos asíncronos:
- Crea un servicio adicional en Railway con la imagen `rabbitmq:3-management`.
- Expón el puerto 5672 y configura en los servicios las variables: `RABBITMQ_HOST`, `RABBITMQ_PORT=5672`, `RABBITMQ_USER`, `RABBITMQ_PASS`.
- Quita los comentarios de uso de MQ en `api_gateway` si deseas publicar eventos desde ahí.

## 6) Variables comunes (resumen)

- DB (en servicios backend): `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- Auth (en auth-service): `JWT_SECRET`, `JWT_ALGORITHM=HS256`, `ACCESS_TOKEN_EXPIRE_MINUTES=30`
- API Gateway: `FRONTEND_ORIGIN`, `AUTH_SERVICE_URL`, `INVENTORY_SERVICE_URL`, `ALERTS_SERVICE_URL`, `ACTIVITIES_SERVICE_URL`, `REPORTS_SERVICE_URL`
- Client (Build): `VITE_API_URL`, `VITE_TIMER_WS_URL`

## 7) Notas de seguridad

- No publiques secretos en el repo. Usa Variables de Railway.
- Revisa CORS: `FRONTEND_ORIGIN` debe apuntar a tu dominio público del frontend.
- Usa `wss://` para el WebSocket en producción.
