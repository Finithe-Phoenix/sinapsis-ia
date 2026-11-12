@echo off
REM Inicia SINAPSIS en este equipo y abre la consola del anfitrion.
cd /d "%~dp0"

REM Si SINAPSIS ya esta encendido, solo abre la consola
netstat -ano | findstr /R /C:":8080 .*LISTENING" >nul
if %errorlevel%==0 (
  echo SINAPSIS ya esta en ejecucion. Abriendo la consola...
  start "" http://localhost:8080/host.html
  exit /b
)

where node >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8080/host.html
  node tools\servidor.mjs 8080
) else (
  echo No se encontro Node.js. Instalalo desde https://nodejs.org para usar SINAPSIS en vivo.
  pause
)
