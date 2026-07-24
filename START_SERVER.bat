@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>&1
if not errorlevel 1 (
  start "" "http://localhost:8080"
  python -m http.server 8080
  exit /b
)
where py >nul 2>&1
if not errorlevel 1 (
  start "" "http://localhost:8080"
  py -m http.server 8080
  exit /b
)
echo Python was not found. Starting the built-in PowerShell server...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
