@echo off
title MusicX Partable
color 0B
echo.
echo  ============================
echo    MusicX - Music Service
echo  ============================
echo.

for /f "tokens=2 delims=:, " %%a in ('findstr /C:"port" "%~dp0config.json"') do set PORT=%%a
set PORT=%PORT:"=%
if "%PORT%"=="" set PORT=3000

echo  Starting server...
echo  Open browser: http://localhost:%PORT%
echo.

if not exist "%USERPROFILE%\Desktop\MusicX.lnk" (
    powershell -NoProfile -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut('%USERPROFILE%\Desktop\MusicX.lnk'); $s.TargetPath='%~dp0start.bat'; $s.WorkingDirectory='%~dp0'; $s.Description='MusicX Music Service'; $s.Save()"
)

"%~dp0node.exe" "%~dp0server.js"
pause
