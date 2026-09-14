@echo off
rem ── Spider Garden Simulator ─────────────────────────────
rem Emulacion 1:1 de TheCymaera/minecraft-spider en Node.js
rem Servidor WebSocket para el cliente MiniFeather (miniblox.io)
rem
rem Uso: doble clic, o desde terminal:
rem      start-spider-sim.cmd [puerto]
rem ────────────────────────────────────────────────────────
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [error] Node.js no encontrado. Instalalo desde https://nodejs.org
    pause
    exit /b 1
)

if not "%~1"=="" set SPIDER_SIM_PORT=%~1
if "%SPIDER_SIM_PORT%"=="" set SPIDER_SIM_PORT=8765

echo.
echo   Spider Garden Simulator
echo   ======================
echo   Mundo : %cd%\..\spider-garden-e201\spider-garden
echo   WS    : ws://127.0.0.1:%SPIDER_SIM_PORT%/spiders
echo   Ctrl+C para detener
echo.

node --max-old-space-size=4096 src\server.js
if errorlevel 1 (
    echo.
    echo [error] El simulador termino con error. Revisa el log arriba.
    pause
)
endlocal
