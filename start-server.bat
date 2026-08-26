@echo off
title RCC-HIROS Dev Server
echo ============================================
echo   RCC-HIROS - Starting Dev Server
echo ============================================
echo.

echo [1/2] Starting MySQL (XAMPP)...
if exist "C:\xampp\mysql_start.bat" (
  call "C:\xampp\mysql_start.bat"
) else (
  echo WARNING: XAMPP not found at C:\xampp - start MySQL manually.
)
timeout /t 4 /nobreak >nul

echo [2/2] Starting RCC-HIROS on http://localhost:3000 ...
echo.
echo   Keep this window OPEN while developing.
echo   To stop: close this window (or press Ctrl+C), then run stop-server.bat
echo.
npx next dev -p 3000

echo.
echo Dev server exited.
pause
