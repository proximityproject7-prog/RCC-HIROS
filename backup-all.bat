@echo off
setlocal enabledelayedexpansion
title RCC-HIROS Full Backup
echo ============================================
echo   RCC-HIROS - Full Backup (DB + Uploads)
echo ============================================
echo.

:: Create backups directory
if not exist "backups" mkdir backups

:: Generate timestamp
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set TIMESTAMP=%datetime:~0,4%-%datetime:~4,2%-%datetime:~6,2%_%datetime:~8,2%%datetime:~10,2%%datetime:~12,2%
set BACKUP_DIR=backups\backup_%TIMESTAMP%

mkdir "%BACKUP_DIR%"

:: Step 1: Database backup
echo [1/3] Backing up MySQL database...
"C:\xampp\mysql\bin\mysqldump.exe" -u root --single-transaction --routines --triggers rcc_hiros > "%BACKUP_DIR%\rcc_hiros.sql"

if %errorlevel% neq 0 (
    echo ERROR: Database backup failed.
    rmdir /s /q "%BACKUP_DIR%" 2>nul
    pause
    exit /b 1
)

:: Step 2: Uploads backup
echo [2/3] Backing up uploaded files...
if exist "uploads" (
    xcopy /s /e /q /i "uploads" "%BACKUP_DIR%\uploads\" >nul
    echo       Uploads copied.
) else (
    echo       No uploads folder found — skipping.
)

:: Step 3: Prisma schema snapshot
echo [3/3] Copying Prisma schema...
if exist "prisma\schema.prisma" copy "prisma\schema.prisma" "%BACKUP_DIR%\schema.prisma" >nul

:: Summary
echo.
echo ============================================
echo   Full backup completed!
echo   Location: %BACKUP_DIR%
echo.
echo   Contents:
dir /b "%BACKUP_DIR%"
echo.
echo   To restore: run restore-database.bat with the .sql file
echo ============================================
echo.
pause
