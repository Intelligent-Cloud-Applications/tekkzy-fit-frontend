$ErrorActionPreference = 'Stop'
$app = Split-Path $PSScriptRoot -Parent
$site = Split-Path $app -Parent
$out = Join-Path $site 'public\downloads\TekkzyFit-App.exe'

Push-Location $app
npx expo export --platform web --output-dir desktop/web
if ($LASTEXITCODE -ne 0) { throw 'Expo web export failed' }
Pop-Location

Push-Location $PSScriptRoot
if (-not (Test-Path 'node_modules\electron-builder')) { npm install }
npx electron-builder --win nsis
if ($LASTEXITCODE -ne 0) { throw 'electron-builder failed' }
Pop-Location

New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'dist\TekkzyFit-App-Setup.exe') $out -Force
Write-Host ("Installer: {0} ({1:N1} MB)" -f $out, ((Get-Item $out).Length / 1MB))
