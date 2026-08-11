# launch.ps1 - Arranca backend + Vite y se devuelve sin bloquear la terminal.
# Pensado para invocarse desde un terminal sincronico sin mantener la sesion viva.

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

# Asegurar que node/npm esten en el PATH.
# Sin esto, PowerShell desde VS Code o sesiones SSH heredan un PATH
# incompleto y Start-Process falla con "%1 no es una aplicacion Win32 valida"
# al intentar ejecutar 'node' o 'npm.cmd' como archivos sin extension .exe.
#
# Buscamos node en multiples ubicaciones (ver comentario en start-all.ps1):
# Program Files, nvm4w, nvm user install, manual installs, etc.
$existingNode = Get-Command node -ErrorAction SilentlyContinue
if (-not $existingNode) {
    $candidatePaths = @(
        (Join-Path $env:ProgramFiles 'nodejs'),
        'C:\nvm4w\nodejs',
        'C:\nodejs',
        (Join-Path $env:LOCALAPPDATA 'nvm\current'),
        (Join-Path $env:APPDATA 'nvm\current'),
        'C:\Program Files (x86)\nodejs'
    )
    foreach ($p in $candidatePaths) {
        if ($p -and (Test-Path $p)) {
            Write-Host "[launch] node encontrado en: $p"
            $env:Path = "$p;$env:Path"
            break
        }
    }
}

$logDir = Join-Path $projectRoot '.runtime-logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

# Libera puertos por si quedaron colgados
foreach ($p in 3000, 5173) {
    $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($c.OwningProcess)" -ErrorAction SilentlyContinue
        if ($proc) { Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue }
    }
}

Write-Host "[launch] Iniciando backend..."
$backend = Start-Process -FilePath 'node' `
    -ArgumentList 'server.js' `
    -WorkingDirectory $projectRoot `
    -RedirectStandardOutput (Join-Path $logDir 'server.out.log') `
    -RedirectStandardError (Join-Path $logDir 'server.err.log') `
    -PassThru -WindowStyle Hidden

Write-Host "[launch] Iniciando Vite..."
$frontend = Start-Process -FilePath 'npm.cmd' `
    -ArgumentList 'run','dev' `
    -WorkingDirectory $projectRoot `
    -RedirectStandardOutput (Join-Path $logDir 'vite.out.log') `
    -RedirectStandardError (Join-Path $logDir 'vite.err.log') `
    -PassThru -WindowStyle Hidden

# Espera corta a que ambos listen
$readyBackend = $false
$readyFrontend = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (-not $readyBackend) {
        $readyBackend = (Test-NetConnection -ComputerName localhost -Port 3000 -InformationLevel Quiet -WarningAction SilentlyContinue)
    }
    if (-not $readyFrontend) {
        $readyFrontend = (Test-NetConnection -ComputerName localhost -Port 5173 -InformationLevel Quiet -WarningAction SilentlyContinue)
    }
    if ($readyBackend -and $readyFrontend) { break }
}

Write-Host ""
if ($readyBackend) {
    Write-Host "[launch] Backend  OK  http://localhost:3000  (PID $($backend.Id))" -ForegroundColor Green
} else {
    Write-Host "[launch] Backend  FAIL  revisa .runtime-logs\server.err.log" -ForegroundColor Red
}
if ($readyFrontend) {
    Write-Host "[launch] Frontend OK  http://localhost:5173  (PID $($frontend.Id))" -ForegroundColor Green
} else {
    Write-Host "[launch] Frontend FAIL  revisa .runtime-logs\vite.err.log" -ForegroundColor Red
}

# Espera hasta 8s mas por si Vite termina de compilar
if (-not $readyFrontend) {
    for ($i = 0; $i -lt 8; $i++) {
        Start-Sleep -Seconds 1
        if (Test-NetConnection -ComputerName localhost -Port 5173 -InformationLevel Quiet -WarningAction SilentlyContinue) {
            Write-Host "[launch] Frontend OK  http://localhost:5173" -ForegroundColor Green
            break
        }
    }
}

Write-Host ""
Write-Host "[launch] Para detener todo: powershell -File stop-all.ps1"