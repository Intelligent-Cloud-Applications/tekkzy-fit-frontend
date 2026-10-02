$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$outDir = Split-Path $root -Parent
$stage = Join-Path $env:TEMP 'TekkzyFit-GymPC'
$zip = Join-Path $outDir 'TekkzyFit-GymPC.zip'

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

$copy = @(
  'START HERE.cmd',
  'END HERE.cmd',
  'package.json',
  'package-lock.json',
  'tsconfig.server.json',
  'tsconfig.app.json',
  '.env',
  'server',
  'shared',
  'src',
  'gym-pc',
  'scripts',
  'data',
  'public'
)
foreach ($item in $copy) {
  $from = Join-Path $root $item
  if (Test-Path $from) {
    Copy-Item $from -Destination (Join-Path $stage $item) -Recurse -Force
  }
}

Copy-Item (Join-Path $PSScriptRoot 'logo.png') -Destination (Join-Path $stage 'Tekkzy Fit.png') -Force
Copy-Item (Join-Path $PSScriptRoot 'logo.ico') -Destination (Join-Path $stage 'logo.ico') -Force -ErrorAction SilentlyContinue
@"
[.ShellClassInfo]
IconResource=logo.ico,0
InfoTip=Tekkzy Fit gym computer
"@ | Set-Content -Path (Join-Path $stage 'desktop.ini') -Encoding ASCII

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
Remove-Item $stage -Recurse -Force
Write-Host "Created $zip"
Write-Host 'On the other Windows laptop: unzip, then double-click START HERE.cmd'
Write-Host 'To remove this laptop as the gym machine: double-click END HERE.cmd'
