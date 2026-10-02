@echo off
title Tekkzy Fit gym PC
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-gym-pc.ps1"
if errorlevel 1 (
  echo.
  echo Setup did not finish. Install Node.js LTS from https://nodejs.org and try again.
)
echo.
pause
