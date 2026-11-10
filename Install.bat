@echo off
title ArsenicV3-Dsc Installer
cd /d "%~dp0"

python -c "print(1)" >nul 2>nul
if not errorlevel 1 goto HAVE_PY

echo [i] Python not found - installing automatically...

where winget >nul 2>nul
if not errorlevel 1 goto WINGET

echo [i] Downloading Python 3.13 from python.org...
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { Invoke-WebRequest 'https://www.python.org/ftp/python/3.13.1/python-3.13.1-amd64.exe' -OutFile \"$env:TEMP\pysetup.exe\" } catch { exit 1 }"
if errorlevel 1 (
  echo [!] Download failed. Install Python manually: https://www.python.org/downloads/
  pause
  exit /b 1
)
echo [i] Installing Python (per-user, no admin needed)...
"%TEMP%\pysetup.exe" /quiet InstallAllUsers=0 PrependPath=1 Include_test=0
set PYRC=%errorlevel%
del "%TEMP%\pysetup.exe" >nul 2>nul
if "%PYRC%"=="0" goto FIND_PY
if "%PYRC%"=="3010" goto FIND_PY
echo [!] Python setup failed. Install manually: https://www.python.org/downloads/
pause
exit /b 1

:WINGET
echo [i] Installing Python via winget...
winget install -e --id Python.Python.3.13 --silent --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
  echo [!] winget install failed. Install manually: https://www.python.org/downloads/
  pause
  exit /b 1
)

:FIND_PY
set "PYEXE=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
if exist "%PYEXE%" goto RUN_PY
for /f "delims=" %%d in ('dir /b /ad "%LOCALAPPDATA%\Programs\Python\Python3*" 2^>nul') do set "PYEXE=%LOCALAPPDATA%\Programs\Python\%%d\python.exe"
if exist "%PYEXE%" goto RUN_PY
where python >nul 2>nul
if not errorlevel 1 goto HAVE_PY
echo [!] Python installed but not detected. Close this window and run Install.bat again.
pause
exit /b 1

:RUN_PY
"%PYEXE%" arsenic.py install
echo.
pause
exit /b 0

:HAVE_PY
python arsenic.py install
echo.
pause
exit /b 0
