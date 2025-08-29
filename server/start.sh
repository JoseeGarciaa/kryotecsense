#!/bin/bash
cd /app/api_gateway
python -m uvicorn main:app --host 0.0.0.0 --port $PORT
