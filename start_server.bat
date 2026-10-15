@echo off
title MusicX
color 0B

echo.
echo  ========================================
echo           MusicX - Music service
echo  ========================================
echo.
echo  Welcome! The server is starting...
echo.

for /f "tokens=2 delims=:, " %%a in ('findstr /C:"port" config.json') do set PORT=%%a
set PORT=%PORT:"=%
if "%PORT%"=="" set PORT=3000

echo      http://localhost:%PORT%
echo.
echo  To stop the server press
echo  Ctrl+C in this window.
echo.
echo  ========================================
echo.

taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

if not exist node_modules (
    echo  [*] Installing components, please wait...
    echo.
    npm install
    echo.
)

if not exist "%USERPROFILE%\Desktop\MusicX.lnk" (
    powershell -NoProfile -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut('%USERPROFILE%\Desktop\MusicX.lnk'); $s.TargetPath='%~dp0start_server.bat'; $s.WorkingDirectory='%~dp0'; $s.Description='MusicX Music Service'; $s.Save()"
)

echo  [OK] Server started!
echo  Open in browser: http://localhost:%PORT%
echo  [~] You can close this window.
echo.
echo ***************************
node server.js

echo.
pause
