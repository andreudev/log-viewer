# start-all.ps1
# Levanta el backend (node server.js) y el frontend Vite en segundo plano,
# ambos desde la carpeta del proyecto. Cierra limpio al pulsar Ctrl+C.

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

# Asegurar que node/npm esten en el PATH.
# Sin esto, PowerShell desde VS Code o sesiones SSH heredan un PATH
# incompleto y Start-Process falla con "%1 no es una aplicacion Win32 valida"
# al intentar ejecutar 'node' o 'npm.cmd' como archivos sin extension .exe.
$nodeBin = Join-Path $env:ProgramFiles 'nodejs'
if (Test-Path $nodeBin) {
    $env:Path = "$nodeBin;$env:Path"
}

$logDir = Join-Path $projectRoot '.runtime-logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

$backendOut = Join-Path $logDir 'server.out.log'
$backendErr = Join-Path $logDir 'server.err.log'
$frontendOut = Join-Path $logDir 'vite.out.log'
$frontendErr = Join-Path $logDir 'vite.err.log'

function Test-Port {
    param([int]$Port)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(500, $false)
        if ($ok -and $client.Connected) { $client.EndConnect($iar); return $true }
        return $false
    } catch { return $false } finally { $client.Close() }
}

function Stop-ByPort {
    param([int]$Port)
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        $p = Get-CimInstance Win32_Process -Filter "ProcessId = $($c.OwningProcess)" -ErrorAction SilentlyContinue
        if ($p) {
            Write-Host "[start-all] Cerrando PID $($p.ProcessId) ($($p.Name)) en puerto $Port"
            Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }
}

# Limpieza preventiva de puertos
foreach ($p in 3000, 5173) {
    if (Test-Port $p) {
        Write-Host "[start-all] Puerto $p ocupado, liberando..."
        Stop-ByPort $p
        Start-Sleep -Milliseconds 800
    }
}

Write-Host "[start-all] Iniciando backend (node server.js) en puerto 3000..."
$backend = Start-Process -FilePath 'node' `
    -ArgumentList 'server.js' `
    -WorkingDirectory $projectRoot `
    -RedirectStandardOutput $backendOut `
    -RedirectStandardError $backendErr `
    -PassThru -WindowStyle Hidden

Write-Host "[start-all] Iniciando Vite (npm run dev) en puerto 5173..."
$frontend = Start-Process -FilePath 'npm' `
    -ArgumentList 'run','dev' `
    -WorkingDirectory $projectRoot `
    -RedirectStandardOutput $frontendOut `
    -RedirectStandardError $frontendErr `
    -PassThru -WindowStyle Hidden

# Espera activa a que ambos respondan
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if ((Test-Port 3000) -and (Test-Port 5173)) { $ready = $true; break }
}

if ($ready) {
    Write-Host ""
    Write-Host "[start-all] OK - Servicios arriba:" -ForegroundColor Green
    Write-Host "   Backend  -> http://localhost:3000  (PID $($backend.Id))"
    Write-Host "   Frontend -> http://localhost:5173  (PID $($frontend.Id))"
    Write-Host "   Logs en  -> $logDir"
    Write-Host ""
    Write-Host "[start-all] Abre http://localhost:5173 en tu navegador."
    Write-Host "[start-all] Para detener todo, ejecuta: .\stop-all.ps1"
} else {
    Write-Host "[start-all] Algo no arranco. Revisa los logs:" -ForegroundColor Red
    Write-Host "   $backendErr"
    Write-Host "   $frontendErr"
}

# Mantiene vivos los procesos hijos hasta Ctrl+C
try {
    while (-not $backend.HasExited -and -not $frontend.HasExited) {
        Start-Sleep -Seconds 2
    }
} finally {
    Write-Host "[start-all] Cerrando procesos..."
    foreach ($p in @($backend, $frontend)) {
        if ($p -and -not $p.HasExited) {
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        }
    }
}