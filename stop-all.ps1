# stop-all.ps1
# Detiene backend (3000) y frontend Vite (5173) del proyecto.

$ports = 3000, 5173

function Stop-ByPort {
    param([int]$Port)
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $conns) { Write-Host "[stop-all] Nada escuchando en puerto $Port"; return }
    foreach ($c in $conns) {
        $p = Get-CimInstance Win32_Process -Filter "ProcessId = $($c.OwningProcess)" -ErrorAction SilentlyContinue
        if ($p) {
            Write-Host "[stop-all] Cerrando PID $($p.ProcessId) ($($p.Name)) en puerto $Port"
            Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }
}

foreach ($p in $ports) { Stop-ByPort $p }
Write-Host "[stop-all] Listo."