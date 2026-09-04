@echo off
start "Backend" /D "%~dp0" cmd /k "backend\venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8001"
timeout /t 3
start "Frontend" /D "%~dp0frontend" cmd /k "npm run dev"
