param([switch]$SmokeTest, [switch]$AppearanceTest, [switch]$VoiceCheck, [switch]$ReplyCheck, [switch]$DesktopMode)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'companion-config.ps1')
$env:ELECTRON_RUN_AS_NODE = $null
$env:TEMP = Join-Path $root 'downloads\companion'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
$appPath = Join-Path $root 'app\companion-overlay'
$logDir = Join-Path $root 'outputs\companion-runtime'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$arguments = @('"' + $appPath + '"')
if ($SmokeTest) { $arguments += '--smoke-test' }
if ($AppearanceTest) { $arguments += '--appearance-test' }
if ($VoiceCheck) { $arguments += '--voice-check' }
if ($ReplyCheck) { $arguments += '--reply-check' }
if ($DesktopMode) { $arguments += '--desktop-companion' }
$testRun = $SmokeTest -or $AppearanceTest
if ($testRun) {
    $report = Join-Path $logDir 'overlay-smoke.json'
    if (Test-Path -LiteralPath $report) { Remove-Item -LiteralPath $report }
}
$process = Start-Process -FilePath $Config.ElectronExe -ArgumentList $arguments -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'overlay.stdout.log') -RedirectStandardError (Join-Path $logDir 'overlay.stderr.log') -PassThru -Wait:$testRun
$process.Id | Set-Content -LiteralPath (Join-Path $logDir 'overlay.pid')
if ($testRun) {
    if ($process.ExitCode -ne 0) { throw "Native overlay smoke failed: exit $($process.ExitCode)" }
    if (-not (Test-Path -LiteralPath $report)) { throw 'Native overlay smoke did not produce a report' }
    if (-not (Get-Content -LiteralPath $report -Raw | ConvertFrom-Json).completed) { throw 'Native overlay smoke incomplete' }
    Write-Output 'Native overlay smoke passed and process exited normally.'
}
Write-Output "Companion overlay PID=$($process.Id)"
