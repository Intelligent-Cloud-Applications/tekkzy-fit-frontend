$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$root = Split-Path $here -Parent
$cache = Join-Path $here '.cache'
$payload = Join-Path $here 'payload'
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$outExe = Join-Path $root 'public\downloads\TekkzyFit.exe'

New-Item -ItemType Directory -Force -Path $cache, $payload, (Join-Path $payload 'runtime'), (Split-Path $outExe) | Out-Null

Write-Host 'Bundling gym connection service...'
Push-Location $root
npx --yes esbuild server/index.ts --bundle --platform=node --format=cjs --outfile=gym-pc/payload/server.cjs --legal-comments=none
if ($LASTEXITCODE -ne 0) { throw 'esbuild failed' }
Pop-Location

$envText = @"
PORT=8787
DATABASE_PROVIDER=local-json
CLOUD_API_URL=https://3yn75zpn5m.execute-api.us-east-1.amazonaws.com/prod
GYM_API_KEY=tekkzy-fit-dev-9f3c2a71
JWT_SECRET=tekkzy-fit-gym-pc-1.1
"@
Set-Content -Path (Join-Path $payload '.env') -Value $envText -Encoding ASCII

Write-Host 'Downloading portable Node.js...'
$nodeZip = Join-Path $cache 'node-win-x64.zip'
if (-not (Test-Path $nodeZip) -or (Get-Item $nodeZip).Length -lt 10000000) {
  $index = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
  $release = $index | Where-Object { $_.version -match '^v22\.' -and $_.files -contains 'win-x64-zip' } | Select-Object -First 1
  if (-not $release) {
    $release = $index | Where-Object { $_.files -contains 'win-x64-zip' } | Select-Object -First 1
  }
  $url = "https://nodejs.org/dist/$($release.version)/node-$($release.version)-win-x64.zip"
  Write-Host "  $url"
  Invoke-WebRequest -Uri $url -OutFile $nodeZip
}

$nodeExtract = Join-Path $cache 'node-extract'
if (Test-Path $nodeExtract) { Remove-Item $nodeExtract -Recurse -Force }
Expand-Archive -Path $nodeZip -DestinationPath $nodeExtract -Force
$nodeExe = Get-ChildItem $nodeExtract -Recurse -Filter 'node.exe' | Select-Object -First 1
if (-not $nodeExe) { throw 'node.exe missing from Node download' }
Copy-Item $nodeExe.FullName (Join-Path $payload 'runtime\node.exe') -Force

Write-Host 'Compiling tray app...'
$appExe = Join-Path $payload 'TekkzyFit.exe'
& $csc /nologo /target:winexe /optimize+ /out:$appExe /r:System.Windows.Forms.dll /r:System.Drawing.dll (Join-Path $here 'TekkzyFit.cs')
if ($LASTEXITCODE -ne 0) { throw 'Could not compile TekkzyFit.exe' }

$zip = Join-Path $cache 'payload.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $payload '*') -DestinationPath $zip -Force
$zipSize = (Get-Item $zip).Length
if ($zipSize -lt 10000000) { throw "payload.zip is too small ($zipSize bytes)" }
Write-Host ("Payload zip: {0:N1} MB" -f ($zipSize / 1MB))

Write-Host 'Compiling installer...'
$setupSrc = Join-Path $here 'Setup.cs'
& $csc /nologo /target:winexe /optimize+ /out:$outExe /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll /r:Microsoft.CSharp.dll /resource:"$zip,TekkzyFitPayload" $setupSrc
if ($LASTEXITCODE -ne 0) { throw 'Could not compile installer' }

Copy-Item $outExe (Join-Path $here 'TekkzyFit-Setup.exe') -Force
$final = Get-Item $outExe
Write-Host ("Installer: {0} ({1:N1} MB)" -f $final.FullName, ($final.Length / 1MB))
