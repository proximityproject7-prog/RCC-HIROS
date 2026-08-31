@echo off
setlocal enabledelayedexpansion
title RCC-HIROS Database Restore
echo ============================================
echo   RCC-HIROS - Database Restore
echo ============================================
echo.

:: Check if a specific backup file was passed as argument
if not "%~1"=="" (
    set "RESTORE_FILE=%~1"
    goto :restore
)

:: List available backups
echo Available backups:
echo.
set COUNT=0
for %%F in (backups\rcc_hiros_*.sql) do (
    set /a COUNT+=1
    set "FILE_!COUNT!=%%F"
    echo   [!COUNT!] %%F
)

if %COUNT%==0 (
    echo   No backup files found in backups\ folder.
    echo   Run backup-database.bat first.
    pause
    exit /b 1
)

echo.
set /p CHOICE="Enter backup number to restore: "

:: Validate input
if not defined CHOICE (
    echo No selection made. Cancelled.
    pause
    exit /b 0
)

set "RESTORE_FILE=!FILE_%CHOICE%!"
if not defined RESTORE_FILE (
    echo ERROR: Invalid selection.
    pause
    exit /b 1
)

:restore
if not exist "%RESTORE_FILE%" (
    echo ERROR: File not found: %RESTORE_FILE%
    pause
    exit /b 1
)

echo.
echo WARNING: This will REPLACE all data in the 'rcc_hiros' database.
echo          File to restore: %RESTORE_FILE%
echo.
set /p CONFIRM="Type YES to confirm: "
if /i not "%CONFIRM%"=="YES" (
    echo Restore cancelled.
    pause
    exit /b 0
)

echo.
echo [1/2] Dropping and recreating database...
"C:\xampp\mysql\bin\mysql.exe" -u root -e "DROP DATABASE IF EXISTS rcc_hiros; CREATE DATABASE rcc_hiros CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

if %errorlevel% neq 0 (
    echo ERROR: Could not recreate database. Make sure MySQL is running.
    pause
    exit /b 1
)

echo [2/2] Importing backup data...
"C:\xampp\mysql\bin\mysql.exe" -u root rcc_hiros < "%RESTORE_FILE%"

if %errorlevel% neq 0 (
    echo ERROR: Import failed. The backup file may be corrupted.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Restore completed successfully!
echo   Database: rcc_hiros
echo   Source:   %RESTORE_FILE%
echo.
echo   Run 'npx prisma generate' to refresh the Prisma client.
echo ============================================
echo.
pause
