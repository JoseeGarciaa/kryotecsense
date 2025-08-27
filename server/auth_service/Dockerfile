# Use an official Python runtime as a parent image
FROM python:3.12-slim

# Set the working directory in the container
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt ./requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared folder and this service code
COPY server/shared ./shared
COPY server/auth_service ./auth_service

# Set working directory to the service
WORKDIR /app/auth_service

# Create a non-root user
RUN useradd --create-home --shell /bin/bash app
USER app

# Railway will set the PORT environment variable
CMD ["python", "main.py"]
