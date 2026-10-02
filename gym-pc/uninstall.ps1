$ErrorActionPreference = 'SilentlyContinue'
$here = $PSScriptRoot
$root = Split-Path $here -Parent

Get-Process -Name 'TekkzyFit' -ErrorAction SilentlyContinue | Stop-Process -Force
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | ForEach-Object {
  if ($_.CommandLine -match 'server\\index\.ts|tsx.*server|server\.cjs') {
    Stop-Process -Id $_.ProcessId -Force
  }
}
$localInstall = Join-Path $env:LOCALAPPDATA 'TekkzyFit'
if (Test-Path $localInstall) { Remove-Item $localInstall -Recurse -Force }

foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Startup'))) {
  Remove-Item (Join-Path $folder 'Tekkzy Fit.lnk') -Force
  Remove-Item (Join-Path $folder 'Tekkzy Fit Gym PC.lnk') -Force
}

Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'TekkzyFit' -Force
Remove-Item -Path 'HKCU:\Software\Classes\tekkzyfit' -Recurse -Force
Unregister-ScheduledTask -TaskName 'Tekkzy Fit Gym PC' -Confirm:$false

$api = 'https://3yn75zpn5m.execute-api.us-east-1.amazonaws.com/prod/devices/live/forget-laptop'
$key = 'tekkzy-fit-dev-9f3c2a71'
$envFile = Join-Path $root '.env.production'
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^VITE_API_URL=(.+)$') { $api = ($Matches[1].Trim() + '/devices/live/forget-laptop') }
    if ($line -match '^VITE_GYM_API_KEY=(.+)$') { $key = $Matches[1].Trim() }
  }
}
try {
  Invoke-RestMethod -Method POST -Uri $api -Headers @{
    'X-Gym-Key'      = $key
    'X-Institution'  = 'Fitnessworld001'
    'Content-Type'   = 'application/json'
  } -Body '{}' | Out-Null
} catch {
}

Write-Host 'Tekkzy Fit helper removed from this computer.'
