@echo off
start "Backend" cmd /k "cd /d C:\Users\Haide\Documents\P1-Automated Ticketing System\ai-ticketing-system && venv\Scripts\python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000"
timeout /t 3
start "Frontend" cmd /k "cd /d C:\Users\Haide\Documents\P1-Automated Ticketing System\ai-ticketing-system\frontend && npm run dev"
