$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'companion-config.ps1')
$logDir = Join-Path $root 'outputs\companion-runtime'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
# Let PowerShell redirect the host output; it can contain a private access URL.
$env:ELECTRON_RUN_AS_NODE = '1'
$env:DSH_HOME = $Config.DshHome
if ($Config.VoiceAdapterRoot) { $env:WHALE_VOICE_ADAPTER_ROOT = $Config.VoiceAdapterRoot }
$key = [Environment]::GetEnvironmentVariable('DEEPSEEK_API_KEY', 'User')
if ($key) { $env:DEEPSEEK_API_KEY = $key }
$env:TEMP = Join-Path $root 'downloads\companion'; $env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
# DeepSeek Harness Desktop ships its host CLI inside the app bundle.
$entry = '"' + (Join-Path $PSScriptRoot 'run-dsh-host.mjs') + '"'
$process = Start-Process -FilePath $Config.DshExe -ArgumentList @('--expose-internals', $entry, '--profile', $Config.Profile, '--no-open', '--port', [string]$Config.Port) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'host.stdout.log') -RedirectStandardError (Join-Path $logDir 'host.stderr.log') -PassThru
$process.Id | Set-Content -LiteralPath (Join-Path $logDir 'host.pid')
Write-Output "Companion host PID=$($process.Id) port=$($Config.Port)"
