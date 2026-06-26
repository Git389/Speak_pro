$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$pidFile = Join-Path $root '.epsilon-runtime\pids.json'
$portByName = @{
    'frontend' = 5173
    'ai-backend' = 8000
    'talking-head' = 8100
    'ollama' = 11434
}

function Get-ListeningPid($port) {
    $lines = netstat -ano | Select-String -Pattern (":$port\s")
    foreach ($line in $lines) {
        $parts = ($line.ToString() -split '\s+') | Where-Object { $_ }
        if ($parts.Count -ge 5 -and $parts[3] -eq 'LISTENING') {
            return [int]$parts[4]
        }
    }
    return $null
}

$records = @()
if (Test-Path $pidFile) {
    $records = @(Get-Content $pidFile -Raw | ConvertFrom-Json)
} else {
    Write-Host 'No launcher PID file was found. Falling back to known service ports.' -ForegroundColor Yellow
}

$recordByName = @{}
foreach ($record in $records) {
    $recordByName[$record.name] = $record
}

$namesToCheck = @($recordByName.Keys + @('frontend', 'ai-backend', 'talking-head') | Select-Object -Unique)
foreach ($name in $namesToCheck) {
    $record = $recordByName[$name]
    try {
        if ($record -and $record.pid) {
            $proc = Get-Process -Id $record.pid -ErrorAction Stop
            Stop-Process -Id $record.pid -Force
            Write-Host "Stopped $($record.name) (PID $($record.pid))" -ForegroundColor Green
            continue
        }
        throw 'pid lookup unavailable'
    } catch {
        $fallbackPid = $null
        if ($portByName.ContainsKey($name)) {
            $fallbackPid = Get-ListeningPid $portByName[$name]
        }

        if ($fallbackPid) {
            Stop-Process -Id $fallbackPid -Force
            Write-Host "Stopped $name via port lookup (PID $fallbackPid)" -ForegroundColor Green
        } elseif ($record) {
            Write-Host "Process $($record.name) (PID $($record.pid)) was already stopped." -ForegroundColor Yellow
        }
    }
}

if (Test-Path $pidFile) {
    Remove-Item $pidFile -Force
    Write-Host 'Launcher PID file removed.' -ForegroundColor Green
}
