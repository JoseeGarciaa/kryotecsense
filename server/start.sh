#!/bin/bash
cd /app
pip install -r requirements.txt
cd /app/api_gateway
python main.py
