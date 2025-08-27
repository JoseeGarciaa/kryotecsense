# Usar una imagen oficial de Python
FROM python:3.12-slim

# Establecer el directorio de trabajo
WORKDIR /app

# Instalar dependencias
COPY ./requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código de la aplicación
COPY . .

# El comando se especificará en docker-compose.yml
CMD ["uvicorn", "main:app", "--host", "0.0.0.0"]
