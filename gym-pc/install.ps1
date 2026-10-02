$ErrorActionPreference = 'Stop'
$Site = 'https://fitnessworld2.0.tekkzy.com'
$here = $PSScriptRoot
$root = Split-Path $here -Parent
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$exe = Join-Path $here 'TekkzyFit.exe'
$src = Join-Path $here 'TekkzyFit.cs'

$ico = Join-Path $here 'logo.ico'
$iconArg = if (Test-Path $ico) { "/win32icon:$ico" } else { '' }
& $csc /nologo /target:winexe /optimize+ /out:$exe /r:System.Windows.Forms.dll /r:System.Drawing.dll $iconArg $src
if ($LASTEXITCODE -ne 0) { throw 'Could not build Tekkzy Fit' }

$desktop = [Environment]::GetFolderPath('Desktop')
$startup = [Environment]::GetFolderPath('Startup')
$wsh = New-Object -ComObject WScript.Shell
foreach ($folder in @($desktop, $startup)) {
  $lnk = Join-Path $folder 'Tekkzy Fit.lnk'
  $s = $wsh.CreateShortcut($lnk)
  $s.TargetPath = $exe
  $s.WorkingDirectory = $root
  $s.WindowStyle = 7
  $s.Description = 'Tekkzy Fit gym connection'
  if (Test-Path $ico) { $s.IconLocation = "$ico,0" }
  $s.Save()
}

$run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
if (-not (Test-Path $run)) { New-Item -Path $run -Force | Out-Null }
Set-ItemProperty -Path $run -Name 'TekkzyFit' -Value "`"$exe`" --silent"

Start-Process -FilePath $exe -WorkingDirectory $root
Write-Host 'Tekkzy Fit is installed. The app window is opening now.'
Write-Host 'Look for the red Tekkzy Fit icon on the desktop and in the tray (bottom-right).'
