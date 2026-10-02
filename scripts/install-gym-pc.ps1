$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host 'Install Node.js LTS from https://nodejs.org then run this again.'
  exit 1
}
if (-not (Test-Path (Join-Path $root 'node_modules\tsx\dist\cli.mjs'))) {
  Write-Host 'Installing gym PC files...'
  npm install --omit=dev
}

$vbs = Join-Path $root 'scripts\gym-pc-hidden.vbs'
$taskName = 'Tekkzy Fit Gym PC'
try {
  $action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "//B `"$vbs`"" -WorkingDirectory $root
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
} catch {
  # Logon task needs admin. The Startup shortcut is enough for a normal laptop open.
}

$startup = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startup 'Tekkzy Fit Gym PC.lnk'
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = 'wscript.exe'
$shortcut.Arguments = "//B `"$vbs`""
$shortcut.WorkingDirectory = $root
$shortcut.WindowStyle = 7
$shortcut.Description = 'Connects the face terminal when this PC starts'
$shortcut.Save()

$reg = 'HKCU:\Software\Classes\tekkzyfit'
New-Item -Path $reg -Force | Out-Null
Set-ItemProperty -Path $reg -Name '(default)' -Value 'URL:Tekkzy Fit Protocol'
New-ItemProperty -Path $reg -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
New-Item -Path "$reg\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$reg\shell\open\command" -Name '(default)' -Value "wscript.exe //B `"$vbs`""

try {
  $health = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8787/api/health' -TimeoutSec 2
  if ($health.StatusCode -eq 200) {
    Write-Host 'Tekkzy Fit gym PC is already connected.'
    Write-Host 'Next time this laptop opens, it will connect by itself.'
    exit 0
  }
} catch {
}

Start-Process -FilePath 'wscript.exe' -ArgumentList "//B `"$vbs`"" -WorkingDirectory $root | Out-Null
Start-Sleep -Seconds 2
Write-Host 'Installed. This laptop will connect to the face terminal when it opens.'
Write-Host 'Open https://fitnessworld2.0.tekkzy.com on any phone or computer.'
