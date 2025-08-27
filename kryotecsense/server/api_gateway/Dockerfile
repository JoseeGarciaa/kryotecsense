# Use an official Python runtime as a parent image
FROM python:3.12-slim

# Set the working directory in the container
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements from the api_gateway directory
COPY api_gateway/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the shared modules
COPY shared ./shared

# Copy the API gateway code
COPY api_gateway ./api_gateway

# Set Python path
ENV PYTHONPATH=/app

# Create a non-root user
RUN useradd --create-home --shell /bin/bash app
USER app

# Command will be specified in docker-compose.yml
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
