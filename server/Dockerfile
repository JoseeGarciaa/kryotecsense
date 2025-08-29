# Usar una imagen oficial de Python
FROM python:3.12-slim

# Establecer el directorio de trabajo
WORKDIR /app

# Instalar dependencias
COPY ./requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código de la aplicación
COPY . .

# Asegurar que los módulos sean importables vía 'python -m'
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Comando configurable por variable de entorno START_CMD; por defecto levanta api_gateway
# Puedes sobrescribirlo en Railway añadiendo la variable START_CMD, por ejemplo:
#  - START_CMD="python -m auth_service.main"
#  - START_CMD="python -m inventory_service.main"
ENV START_CMD="python -m api_gateway.main"

# Ejecutar el comando configurado (usa $PORT si tu script lo lee)
CMD ["sh", "-c", "$START_CMD"]
