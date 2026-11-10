@echo off
title ArsenicV3-Dsc Uninstaller
cd /d "%~dp0"

python -c "print(1)" >nul 2>nul
if errorlevel 1 (
  echo [!] Python not found. Run Install.bat first - it will install Python automatically.
  pause
  exit /b 1
)
python arsenic.py uninstall
echo.
pause
