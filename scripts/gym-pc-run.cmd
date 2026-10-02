@echo off
setlocal
set ROOT=%~dp0..
cd /d "%ROOT%"
if not exist "%ROOT%\data" mkdir "%ROOT%\data"
set LOG=%ROOT%\data\gym-pc.log

powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8787/api/health -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch { exit 1 }"
if %ERRORLEVEL%==0 (
  echo [%date% %time%] already running>> "%LOG%"
  exit /b 0
)

echo [%date% %time%] waiting for Wi-Fi>> "%LOG%"
timeout /t 12 /nobreak >nul

set NODE=
for /f "delims=" %%I in ('where node 2^>nul') do (
  if not defined NODE set NODE=%%I
)
if not defined NODE (
  echo [%date% %time%] Node.js is not installed>> "%LOG%"
  exit /b 1
)

echo [%date% %time%] starting gym PC with "%NODE%">> "%LOG%"
"%NODE%" "%ROOT%\node_modules\tsx\dist\cli.mjs" --tsconfig "%ROOT%\tsconfig.server.json" "%ROOT%\server\index.ts" >> "%LOG%" 2>&1
