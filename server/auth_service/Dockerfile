# Usa una imagen oficial de Python
FROM python:3.12-slim

# Setear directorio de trabajo
WORKDIR /app

# Copiar requirements primero (mejor cacheo)
COPY ../requirements.txt .
COPY ../shared ./shared

# Instalar dependencias Python
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código del servicio
COPY . .

# Crear usuario no root
RUN useradd --create-home --shell /bin/bash app
USER app

# Railway usa la variable PORT automáticamente
CMD ["python", "main.py"]
