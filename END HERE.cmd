@echo off
title Tekkzy Fit — remove gym laptop
cd /d "%~dp0"

echo This removes Tekkzy Fit as the gym machine from THIS computer.
echo The website will also forget this laptop if it can reach the internet.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0gym-pc\uninstall.ps1"
echo.
echo Done. This PC is no longer the gym laptop.
echo You can delete this folder if you do not need it anymore.
echo.
pause
