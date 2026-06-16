
$ErrorActionPreference = 'Stop'

$serviceName = 'PlasyectBigzapSync'
$serviceDir  = Split-Path -Parent $PSScriptRoot
$nodeExe     = (Get-Command node).Source
$entry       = Join-Path $serviceDir 'dist\index.js'
$logDir      = Join-Path $serviceDir 'logs'

if (-not (Test-Path $entry)) {
  throw "No existe $entry. Corre primero: npm ci ; npm run build"
}
if (-not (Test-Path (Join-Path $serviceDir '.env'))) {
  throw "Falta el archivo .env en $serviceDir (copia .env.example y configuralo)."
}

$nssm = Get-Command nssm -ErrorAction SilentlyContinue
if ($nssm) { $nssmExe = $nssm.Source }
elseif (Test-Path 'C:\nssm\nssm.exe') { $nssmExe = 'C:\nssm\nssm.exe' }
else { throw 'NSSM no encontrado. Descargalo de https://nssm.cc/download y ponlo en el PATH o en C:\nssm' }

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

& $nssmExe install $serviceName $nodeExe $entry
& $nssmExe set $serviceName AppDirectory $serviceDir
& $nssmExe set $serviceName DisplayName 'Plasyect BigZap Sync (tarjetas viajeras)'
& $nssmExe set $serviceName Description 'Publica las tarjetas viajeras de BixApp (BIGZAP.FDB) hacia PostgreSQL/Supabase. Solo lectura sobre Firebird.'
& $nssmExe set $serviceName Start SERVICE_AUTO_START
& $nssmExe set $serviceName AppStdout (Join-Path $logDir 'sync.out.log')
& $nssmExe set $serviceName AppStderr (Join-Path $logDir 'sync.err.log')
& $nssmExe set $serviceName AppRotateFiles 1
& $nssmExe set $serviceName AppRotateBytes 10485760
& $nssmExe set $serviceName AppExit Default Restart
& $nssmExe set $serviceName AppRestartDelay 5000

& $nssmExe start $serviceName
Write-Host "Servicio $serviceName instalado e iniciado. Logs en $logDir"
