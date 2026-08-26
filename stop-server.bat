@echo off
title RCC-HIROS - Stop Server
echo ============================================
echo   RCC-HIROS - Stopping Dev Server
echo ============================================
echo.

set FOUND=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":3000"') do (
  taskkill /PID %%a /F >nul 2>&1
  set FOUND=1
)
if %FOUND%==1 (
  echo [1/2] Dev server on port 3000 stopped.
) else (
  echo [1/2] Dev server was not running.
)

echo [2/2] Stopping MySQL...
if exist "C:\xampp\mysql_stop.bat" (
  call "C:\xampp\mysql_stop.bat"
) else (
  echo WARNING: XAMPP not found - stop MySQL from the XAMPP Control Panel.
)

echo.
echo Done.
timeout /t 3 /nobreak >nul
