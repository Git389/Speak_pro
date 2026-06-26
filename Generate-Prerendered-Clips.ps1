param(
    [string]$TalkUrl = 'http://127.0.0.1:8100/talk',
    [ValidateSet('job', 'ielts', 'all')]
    [string]$Kind = 'job'
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$previewDir = Join-Path $root '.epsilon-runtime\prerendered-clips'
New-Item -ItemType Directory -Force -Path $previewDir | Out-Null

$jobTurns = @(
    'Hi, thanks for joining today. Please introduce yourself briefly.',
    'What interested you in this role?',
    'Tell me about a difficult situation at work and how you handled it.',
    'How do you help an upset customer?',
    'What would your colleagues say are your biggest strengths?',
    'Why are you a good fit for this position?'
)

$ieltsTurns = @(
    "Hello, and welcome. Let's begin. Where do you live?",
    'What do you usually do in your free time?',
    'Describe a skill you would like to learn. What is it, why do you want it, and how would you learn it?',
    'How important is it for people to keep learning new things?',
    'Do you think people''s daily routines will change much in the future?',
    'Do you prefer spending time indoors or outdoors? Why?'
)

$sharedLines = @(
    'Could you tell me a little more about that?',
    "Let's stay with the question and try that again.",
    'Thank you. The interview is complete. I am preparing your results.'
)

$clips = @()
if ($Kind -in @('job', 'all')) {
    for ($i = 0; $i -lt $jobTurns.Count; $i++) {
        $clips += [pscustomobject]@{ Name = ('job-{0:d2}' -f ($i + 1)); Text = $jobTurns[$i] }
    }
}
if ($Kind -in @('ielts', 'all')) {
    for ($i = 0; $i -lt $ieltsTurns.Count; $i++) {
        $clips += [pscustomobject]@{ Name = ('ielts-{0:d2}' -f ($i + 1)); Text = $ieltsTurns[$i] }
    }
}
for ($i = 0; $i -lt $sharedLines.Count; $i++) {
    $clips += [pscustomobject]@{ Name = ('shared-{0:d2}' -f ($i + 1)); Text = $sharedLines[$i] }
}

Write-Host "Generating $($clips.Count) talking-head clips through $TalkUrl" -ForegroundColor Cyan

foreach ($clip in $clips) {
    $outFile = Join-Path $previewDir ($clip.Name + '.mp4')
    Write-Host " -> $($clip.Name)" -ForegroundColor Yellow
    Invoke-WebRequest `
        -Uri $TalkUrl `
        -Method Post `
        -ContentType 'application/json' `
        -Body (@{ text = $clip.Text } | ConvertTo-Json -Compress) `
        -TimeoutSec 900 `
        -OutFile $outFile | Out-Null
}

Write-Host "Saved preview copies to $previewDir" -ForegroundColor Green
Write-Host 'The backend cache is now primed, so the interviewer should play instantly for these lines.' -ForegroundColor Green
