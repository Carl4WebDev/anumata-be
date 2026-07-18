#!/bin/bash
echo "===================================="
echo " Anumata AI Service Startup"
echo "===================================="
echo ""
echo "Starting FastAPI on port 8001..."
echo ""

cd "$(dirname "$0")/src/ai"
python main.py
