@echo off
title Tekkzy Fit
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo This laptop needs Node.js once.
  echo Install the LTS version from https://nodejs.org
  echo Then run this file again.
  echo.
  start https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules\tsx\dist\cli.mjs" (
  echo Preparing files. This can take a few minutes...
  call npm install
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0gym-pc\install.ps1"
echo.
echo Opening Tekkzy Fit...
start "" "%~dp0gym-pc\TekkzyFit.exe"
echo.
echo Tekkzy Fit should be open as its own window now.
echo Desktop icon: Tekkzy Fit
echo Tray icon: bottom-right, near the clock.
echo.
pause
