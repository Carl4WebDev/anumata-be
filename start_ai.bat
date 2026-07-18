@echo off
echo ====================================
echo  Anumata AI Service Startup
echo ====================================
echo.
echo Starting FastAPI on port 8001...
echo.

cd /d "%~dp0src\ai"
python main.py

pause
