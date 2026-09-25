@echo off
title RCC-HIROS Database Backup
echo ============================================
echo   RCC-HIROS - Database Backup
echo ============================================
echo.

:: Create backups directory if it doesn't exist
if not exist "backups" mkdir backups

:: Generate timestamp
:: NOTE: wmic is no longer present on recent Windows builds, so use PowerShell.
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmmss"') do set "TIMESTAMP=%%I"
if not defined TIMESTAMP (
    echo ERROR: Could not determine the current date/time.
    pause
    exit /b 1
)
set BACKUP_FILE=backups\rcc_hiros_%TIMESTAMP%.sql

echo [1/2] Backing up MySQL database 'rcc_hiros'...
"C:\xampp\mysql\bin\mysqldump.exe" -u root --single-transaction --routines --triggers rcc_hiros > "%BACKUP_FILE%"

if %errorlevel% neq 0 (
    echo ERROR: Backup failed. Make sure MySQL is running (start XAMPP MySQL).
    if exist "%BACKUP_FILE%" del "%BACKUP_FILE%"
    pause
    exit /b 1
)

echo [2/2] Verifying backup file...
for %%A in ("%BACKUP_FILE%") do set FILESIZE=%%~zA
if %FILESIZE% lss 100 (
    echo ERROR: Backup file is too small (%FILESIZE% bytes). The database may be empty or the backup failed.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Backup completed successfully!
echo   File: %BACKUP_FILE%
echo   Size: %FILESIZE% bytes
echo ============================================
echo.
pause
