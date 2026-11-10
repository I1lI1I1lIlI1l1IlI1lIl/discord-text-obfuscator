@echo off
title ArsenicV3-Dsc Installer
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo [!] Python not found. Install from https://www.python.org/downloads/
  pause
  exit /b 1
)
python arsenic.py install
echo.
pause
