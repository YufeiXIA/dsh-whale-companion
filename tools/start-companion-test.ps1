param([ValidateSet('human','whale')][string]$Slot = 'whale', [switch]$Headless, [int]$QuitAfter = 0, [ValidateSet('host_standard','load','join','none')][string]$FastMp = 'none', [switch]$Wait)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'companion-config.ps1')
$instance = Join-Path $root "app\companion-test\$Slot"
$info = [System.Diagnostics.ProcessStartInfo]::new()
$info.FileName = Join-Path $instance 'SlayTheSpire2.exe'
$info.WorkingDirectory = $instance
$info.UseShellExecute = $false
$info.WindowStyle = if ($Headless) { [System.Diagnostics.ProcessWindowStyle]::Hidden } else { [System.Diagnostics.ProcessWindowStyle]::Normal }
# Godot Windows reads these process-local variables for user:// and caches.
# --force-steam off is the game's own developer option and avoids cloud saves.
$info.Environment['APPDATA'] = Join-Path $instance 'roaming'
$info.Environment['LOCALAPPDATA'] = Join-Path $instance 'local'
$info.Environment['TEMP'] = Join-Path $instance 'temp'
$info.Environment['TMP'] = Join-Path $instance 'temp'
$tokenFile = Join-Path $Config.DataDir 'bridge-token.txt'
if (-not (Test-Path -LiteralPath $tokenFile)) { throw 'Prepare the companion profile and bridge token first' }
$info.Environment['STS2_COMPANION_TOKEN'] = (Get-Content -LiteralPath $tokenFile -Raw).Trim()
foreach ($arg in @('--force-steam','off','--max-fps','30','--audio-driver','Dummy','--log-file',(Join-Path $instance 'logs\game.log'))) { $info.ArgumentList.Add($arg) }
if ($FastMp -ne 'none') { $info.ArgumentList.Add('--fastmp'); $info.ArgumentList.Add($FastMp) }
if ($Headless) { $info.ArgumentList.Add('--headless') }
else { foreach ($arg in @('--windowed','--resolution','960x540')) { $info.ArgumentList.Add($arg) } }
if ($QuitAfter -gt 0) { $info.ArgumentList.Add('--quit-after'); $info.ArgumentList.Add([string]$QuitAfter) }
$process = [System.Diagnostics.Process]::Start($info)
$process.Id | Set-Content (Join-Path $instance 'process-id.txt')
Write-Output "$Slot PID=$($process.Id) isolated data=$($info.Environment['APPDATA'])"
if ($Wait) { $process.WaitForExit(); Write-Output "Exit=$($process.ExitCode)" }
