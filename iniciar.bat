@echo off
REM Inicia SINAPSIS en este equipo y abre la consola del anfitrion.
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8080/host.html
  node tools\servidor.mjs 8080
) else (
  echo No se encontro Node.js. Intentando con Python...
  start "" http://localhost:8080/host.html
  python -m http.server 8080
)
