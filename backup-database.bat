@echo off
title RCC-HIROS Database Backup
echo ============================================
echo   RCC-HIROS - Database Backup
echo ============================================
echo.

:: Create backups directory if it doesn't exist
if not exist "backups" mkdir backups

:: Generate timestamp
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set TIMESTAMP=%datetime:~0,4%-%datetime:~4,2%-%datetime:~6,2%_%datetime:~8,2%%datetime:~10,2%%datetime:~12,2%
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
