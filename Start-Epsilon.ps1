param(
    [switch]$NoFrontend,
    [switch]$NoOllama,
    [switch]$NoAiBackend,
    [switch]$NoTalkingHead
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$runtimeDir = Join-Path $root '.epsilon-runtime'
$logDir = Join-Path $runtimeDir 'logs'
$pidFile = Join-Path $runtimeDir 'pids.json'
$ffmpegDir = Join-Path $runtimeDir 'ffmpeg'

$cfg = [ordered]@{
    frontendDir = Join-Path $root 'r3f-interviewer'
    frontendPort = 5173
    aiBackendDir = Join-Path $root 'metahuman-server\backend'
    aiBackendPort = 8000
    talkingHeadDir = Join-Path $root 'talkinghead-server'
    talkingHeadPort = 8100
    sadTalkerDir = Join-Path $root 'SadTalker'
    portraitPath = Join-Path $root 'talkinghead-server\portrait.jpg'
    ollamaUrl = 'http://127.0.0.1:11434/api/tags'
    ollamaModel = 'llama3.1'
    talkingHeadEngine = 'sadtalker'
}

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-Step($message) {
    Write-Host "`n==> $message" -ForegroundColor Cyan
}

function Write-WarnLine($message) {
    Write-Host "WARN: $message" -ForegroundColor Yellow
}

function Write-Ok($message) {
    Write-Host "OK: $message" -ForegroundColor Green
}

function Test-Http($url) {
    try {
        Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3 | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Quote-PowerShell($value) {
    return "'" + ($value -replace "'", "''") + "'"
}

function Get-Python310 {
    $launcher = Get-Command py -ErrorAction SilentlyContinue
    if ($launcher) {
        return @($launcher.Source, '-3.10')
    }

    $candidate = 'C:\Users\TUF\AppData\Local\Programs\Python\Python310\python.exe'
    if (Test-Path $candidate) {
        return @($candidate)
    }

    throw 'Python 3.10 was not found. Install Python 3.10 before running this launcher.'
}

function Ensure-Venv($venvDir, $requirementsFile, [string[]]$extraPackages) {
    $pythonExe = Join-Path $venvDir 'Scripts\python.exe'
    if (-not (Test-Path $pythonExe)) {
        Write-Step "Creating venv at $venvDir"
        $py310 = Get-Python310
        if ($py310.Count -eq 2) {
            & $py310[0] $py310[1] -m venv $venvDir
        } else {
            & $py310[0] -m venv $venvDir
        }
    }

    Write-Step "Installing Python packages in $venvDir"
    & $pythonExe -m pip install --upgrade pip | Out-Host
    & $pythonExe -m pip install -r $requirementsFile | Out-Host
    if ($extraPackages.Count -gt 0) {
        & $pythonExe -m pip install @extraPackages | Out-Host
    }

    return $pythonExe
}

function Ensure-LocalFfmpeg {
    if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
        return $null
    }

    $sadTalkerPython = Join-Path $cfg.sadTalkerDir '.venv310\Scripts\python.exe'
    if (Test-Path $sadTalkerPython) {
        try {
            $imageioPath = (& $sadTalkerPython -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())" 2>$null | Select-Object -Last 1).Trim()
            if ($imageioPath -and (Test-Path $imageioPath)) {
                $binDir = Split-Path -Parent $imageioPath
                $ffmpegAlias = Join-Path $binDir 'ffmpeg.exe'
                if (-not (Test-Path $ffmpegAlias)) {
                    Copy-Item -Path $imageioPath -Destination $ffmpegAlias -Force
                }
                Write-Ok "Using SadTalker ffmpeg at $binDir"
                return $binDir
            }
        } catch {
            Write-WarnLine 'imageio-ffmpeg is not available in the SadTalker venv yet.'
        }
    }

    $zipPath = Join-Path $cfg.sadTalkerDir 'tools\ffmpeg-release-essentials.zip'
    if (-not (Test-Path $zipPath)) {
        Write-WarnLine 'ffmpeg is not on PATH and no bundled ffmpeg zip was found.'
        return $null
    }

    if (-not (Test-Path $ffmpegDir)) {
        try {
            Write-Step 'Extracting bundled ffmpeg'
            Expand-Archive -Path $zipPath -DestinationPath $ffmpegDir -Force
        } catch {
            Write-WarnLine "Could not extract bundled ffmpeg: $($_.Exception.Message)"
            return $null
        }
    }

    $ffmpegExe = Get-ChildItem -Path $ffmpegDir -Recurse -Filter ffmpeg.exe -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($ffmpegExe) {
        Write-Ok "Using local ffmpeg at $($ffmpegExe.DirectoryName)"
        return $ffmpegExe.DirectoryName
    }

    Write-WarnLine 'Bundled ffmpeg zip was extracted, but ffmpeg.exe was not found inside it.'
    return $null
}

function Test-SadTalkerReady {
    $pythonExe = Join-Path $cfg.sadTalkerDir '.venv310\Scripts\python.exe'
    if (-not (Test-Path $pythonExe)) {
        return @{ Ready = $false; Reason = 'SadTalker .venv310 is missing.' }
    }

    $rootLiteral = $cfg.sadTalkerDir.Replace('\', '\\')
    $script = "from pathlib import Path; import importlib.util, sys; root=Path(r'$rootLiteral'); issues=[str(p) for p in [root/'inference.py', root/'checkpoints'/'mapping_00109-model.pth.tar', root/'checkpoints'/'mapping_00229-model.pth.tar'] if not p.exists()]; issues += [name for name in ['torch','numpy','imageio_ffmpeg'] if importlib.util.find_spec(name) is None]; print('ready' if not issues else 'missing:' + ' | '.join(issues)); sys.exit(0 if not issues else 2)"

    try {
        $output = & $pythonExe -c $script 2>&1
        if ($LASTEXITCODE -eq 0) {
            return @{ Ready = $true; Reason = 'SadTalker runtime looks complete.' }
        }
        return @{ Ready = $false; Reason = ($output | Out-String).Trim() }
    } catch {
        return @{ Ready = $false; Reason = $_.Exception.Message }
    }
}

function Start-ManagedProcess($name, $filePath, [string[]]$arguments, $workingDir, $outLog, $errLog, $envVars) {
    $segments = @(
        '$ErrorActionPreference = ''Stop'''
        "Set-Location -LiteralPath $(Quote-PowerShell $workingDir)"
    )

    if ($envVars) {
        foreach ($key in $envVars.Keys) {
            $segments += "`$env:$key = $(Quote-PowerShell ([string]$envVars[$key]))"
        }
    }

    $invokeParts = @("& $(Quote-PowerShell $filePath)")
    foreach ($arg in $arguments) {
        $invokeParts += Quote-PowerShell $arg
    }
    $segments += ($invokeParts -join ' ')

    $commandText = $segments -join '; '
    $process = Start-Process `
        -FilePath 'powershell.exe' `
        -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $commandText) `
        -WorkingDirectory $workingDir `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog `
        -WindowStyle Hidden `
        -PassThru

    return [pscustomobject]@{
        Name = $name
        Process = $process
    }
}

function Wait-ForUrl($url, $seconds) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $seconds) {
        if (Test-Http $url) {
            return $true
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
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

$running = @()
$pidRecords = @()
$existingPidRecords = @()
if (Test-Path $pidFile) {
    try {
        $existingPidRecords = @(Get-Content $pidFile -Raw | ConvertFrom-Json)
    } catch {
        $existingPidRecords = @()
    }
}

try {
    if (-not $NoOllama) {
        Write-Step 'Checking Ollama'
        if (Test-Http $cfg.ollamaUrl) {
            Write-Ok "Ollama is already responding at $($cfg.ollamaUrl)"
            $pidRecords += [pscustomobject]@{ name = 'ollama'; pid = (Get-ListeningPid 11434) }
        } else {
            $ollama = Get-Command ollama.exe -ErrorAction SilentlyContinue
            if (-not $ollama) {
                Write-WarnLine 'Ollama is not installed, so AI question generation will not work until it is installed.'
            } else {
                $ollamaProc = Start-ManagedProcess `
                    -name 'ollama' `
                    -filePath $ollama.Source `
                    -arguments @('serve') `
                    -workingDir $root `
                    -outLog (Join-Path $logDir 'ollama.out.log') `
                    -errLog (Join-Path $logDir 'ollama.err.log') `
                    -envVars @{}
                $running += $ollamaProc
                if (Wait-ForUrl $cfg.ollamaUrl 12) {
                    Write-Ok 'Started Ollama.'
                    $pidRecords += [pscustomobject]@{ name = 'ollama'; pid = (Get-ListeningPid 11434) }
                } else {
                    Write-WarnLine 'Started Ollama process, but it did not become healthy within 12 seconds.'
                }
            }
        }
    }

    if (-not $NoAiBackend) {
        $aiUrl = "http://127.0.0.1:$($cfg.aiBackendPort)/health"
        if (Test-Http $aiUrl) {
            Write-Ok "AI backend is already responding on http://127.0.0.1:$($cfg.aiBackendPort)"
            $pidRecords += [pscustomobject]@{ name = 'ai-backend'; pid = (Get-ListeningPid $cfg.aiBackendPort) }
        } else {
            $aiPython = Ensure-Venv `
                -venvDir (Join-Path $cfg.aiBackendDir '.venv') `
                -requirementsFile (Join-Path $cfg.aiBackendDir 'requirements.txt') `
                -extraPackages @('pyttsx3')

            Write-Step 'Starting AI backend'
            $aiProc = Start-ManagedProcess `
                -name 'ai-backend' `
                -filePath $aiPython `
                -arguments @('-m', 'uvicorn', 'app:app', '--host', '0.0.0.0', '--port', [string]$cfg.aiBackendPort) `
                -workingDir $cfg.aiBackendDir `
                -outLog (Join-Path $logDir 'ai-backend.out.log') `
                -errLog (Join-Path $logDir 'ai-backend.err.log') `
                -envVars @{}
            $running += $aiProc
            if (Wait-ForUrl $aiUrl 20) {
                Write-Ok "AI backend is up on http://127.0.0.1:$($cfg.aiBackendPort)"
                $pidRecords += [pscustomobject]@{ name = 'ai-backend'; pid = (Get-ListeningPid $cfg.aiBackendPort) }
            } else {
                Write-WarnLine 'AI backend process was started, but /health did not respond in time.'
            }
        }
    }

    if (-not $NoTalkingHead) {
        Write-Step 'Checking talking-head prerequisites'
        $ffmpegBin = Ensure-LocalFfmpeg
        $sadTalkerStatus = Test-SadTalkerReady
        if (-not $sadTalkerStatus.Ready) {
            Write-WarnLine "Skipping talking-head startup: $($sadTalkerStatus.Reason)"
        } else {
            $talkUrl = "http://127.0.0.1:$($cfg.talkingHeadPort)/health"
            if (Test-Http $talkUrl) {
                Write-Ok "Talking-head backend is already responding on http://127.0.0.1:$($cfg.talkingHeadPort)"
                $pidRecords += [pscustomobject]@{ name = 'talking-head'; pid = (Get-ListeningPid $cfg.talkingHeadPort) }
            } else {
                $talkPython = Join-Path $cfg.talkingHeadDir '.venv310\Scripts\python.exe'
                if (-not (Test-Path $talkPython)) {
                    throw "Talking-head venv is missing at $talkPython"
                }

                $pathValue = $env:PATH
                if ($ffmpegBin) {
                    $pathValue = "$ffmpegBin;$pathValue"
                }

                $talkEnv = @{
                    ENGINE = $cfg.talkingHeadEngine
                    PORTRAIT = $cfg.portraitPath
                    SADTALKER_DIR = $cfg.sadTalkerDir
                    PYTHON_BIN = (Join-Path $cfg.sadTalkerDir '.venv310\Scripts\python.exe')
                    SADTALKER_PREPROCESS = 'crop'
                    SADTALKER_ENHANCER = ''
                    SADTALKER_STILL = '1'
                    TTS_RATE = '190'
                    PATH = $pathValue
                }

                Write-Step 'Starting talking-head backend'
                $talkProc = Start-ManagedProcess `
                    -name 'talking-head' `
                    -filePath $talkPython `
                    -arguments @('-m', 'uvicorn', 'app:app', '--host', '0.0.0.0', '--port', [string]$cfg.talkingHeadPort) `
                    -workingDir $cfg.talkingHeadDir `
                    -outLog (Join-Path $logDir 'talking-head.out.log') `
                    -errLog (Join-Path $logDir 'talking-head.err.log') `
                    -envVars $talkEnv
                $running += $talkProc
                if (Wait-ForUrl $talkUrl 20) {
                    Write-Ok "Talking-head backend is up on http://127.0.0.1:$($cfg.talkingHeadPort)"
                    $pidRecords += [pscustomobject]@{ name = 'talking-head'; pid = (Get-ListeningPid $cfg.talkingHeadPort) }
                } else {
                    Write-WarnLine 'Talking-head process was started, but /health did not respond in time.'
                }
            }
        }
    }

    if (-not $NoFrontend) {
        $frontendUrl = "http://127.0.0.1:$($cfg.frontendPort)"
        if (Test-Http $frontendUrl) {
            Write-Ok "Frontend is already responding on $frontendUrl"
            $pidRecords += [pscustomobject]@{ name = 'frontend'; pid = (Get-ListeningPid $cfg.frontendPort) }
        } else {
            Write-Step 'Starting frontend'
            $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
            if (-not $npmCmd) {
                throw 'npm.cmd was not found. Install Node.js before starting the frontend.'
            }
            $frontendProc = Start-ManagedProcess `
                -name 'frontend' `
                -filePath $npmCmd.Source `
                -arguments @('run', 'dev', '--', '--host', '0.0.0.0', '--port', [string]$cfg.frontendPort) `
                -workingDir $cfg.frontendDir `
                -outLog (Join-Path $logDir 'frontend.out.log') `
                -errLog (Join-Path $logDir 'frontend.err.log') `
                -envVars @{}
            $running += $frontendProc
            if (Wait-ForUrl $frontendUrl 20) {
                Write-Ok "Frontend is up on $frontendUrl"
                $pidRecords += [pscustomobject]@{ name = 'frontend'; pid = (Get-ListeningPid $cfg.frontendPort) }
            } else {
                Write-WarnLine 'Frontend process was started, but the dev server did not respond in time.'
            }
        }
    }

    $merged = @($existingPidRecords + $pidRecords | Group-Object name | ForEach-Object { $_.Group[-1] })
    @($merged) | ConvertTo-Json | Set-Content -Path $pidFile

    Write-Step 'Summary'
    Write-Host "Frontend:      http://127.0.0.1:$($cfg.frontendPort)"
    Write-Host "AI backend:    http://127.0.0.1:$($cfg.aiBackendPort)"
    Write-Host "Talking-head:  http://127.0.0.1:$($cfg.talkingHeadPort)"
    Write-Host "PID file:      $pidFile"
    Write-Host "Logs:          $logDir"
    Write-Host ''
    Write-Host 'Use .\Stop-Epsilon.ps1 to stop the processes started by this launcher.'
} catch {
    Write-Error $_
    throw
}
