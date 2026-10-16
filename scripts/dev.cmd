@echo off
REM local dev server (default http://localhost:3100)
cd /d "%~dp0.."
set "PATH=C:\Program Files\nodejs;%PATH%"
if "%PORT%"=="" set "PORT=3100"
node node_modules\next\dist\bin\next dev --port %PORT%
