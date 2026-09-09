@echo off
pushd "%~dp0backend"
venv\Scripts\python.exe -m alembic upgrade head
if errorlevel 1 exit /b 1
popd
start "Backend" /D "%~dp0" cmd /k "backend\venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8001"
start "Ticket Worker" /D "%~dp0" cmd /k "backend\venv\Scripts\python.exe -m backend.worker"
timeout /t 3
start "Frontend" /D "%~dp0frontend" cmd /k "npm run dev"
