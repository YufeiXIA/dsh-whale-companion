param([switch]$DesktopOnly)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$logDir = Join-Path $root 'outputs\companion-runtime'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$lock = [Threading.Mutex]::new($false, 'Local\WhaleGameCompanionLauncher')
if (-not $lock.WaitOne(0)) { $lock.Dispose(); exit }
try {
    # Inside try, so a missing or broken config reaches the message box below.
    . (Join-Path $PSScriptRoot 'companion-config.ps1')
    Set-Location -LiteralPath $root
    function Find-OwnedProcess([string]$Exe, [string]$Marker = '') {
        Get-CimInstance Win32_Process | Where-Object {
            $_.ExecutablePath -eq $Exe -and (!$Marker -or $_.CommandLine.Contains($Marker))
        } | Select-Object -First 1
    }
    function Wait-Port([int]$Port) {
        for ($attempt = 0; $attempt -lt 80; $attempt++) {
            $client = [Net.Sockets.TcpClient]::new()
            try { $client.Connect('127.0.0.1', $Port); return }
            catch { Start-Sleep -Milliseconds 250 }
            finally { $client.Dispose() }
        }
        throw "本机服务 $Port 未能启动，请查看 outputs\companion-runtime 的日志。"
    }
    $hostExe = $Config.DshExe
    $overlayExe = $Config.ElectronExe
    $newHost = -not (Find-OwnedProcess $hostExe "--profile $($Config.Profile)")
    if ($newHost) { & (Join-Path $PSScriptRoot 'start-companion-profile.ps1') }
    Wait-Port $Config.Port
    # Reuse running isolated game seats. Cold start loads the existing save;
    # lobby confirmation and enabling the AI remain visible user actions.
    if (-not $DesktopOnly) {
        $humanExe = Join-Path $root 'app\companion-test\human\SlayTheSpire2.exe'
        $whaleExe = Join-Path $root 'app\companion-test\whale\SlayTheSpire2.exe'
        if (-not (Find-OwnedProcess $humanExe)) {
            $save = Join-Path $root 'app\companion-test\human\roaming\SlayTheSpire2\default\1\modded\profile1\saves\current_run_mp.save'
            $mode = if (Test-Path -LiteralPath $save) { 'load' } else { 'none' }
            & (Join-Path $PSScriptRoot 'start-companion-test.ps1') -Slot human -FastMp $mode
        }
        Wait-Port 15526
        if (-not (Find-OwnedProcess $whaleExe)) {
            & (Join-Path $PSScriptRoot 'start-companion-test.ps1') -Slot whale -Headless -FastMp join
        }
        Wait-Port 15527
    }
    $overlay = Find-OwnedProcess $overlayExe 'app\companion-overlay'
    if ($newHost -and $overlay) {
        Stop-Process -Id $overlay.ProcessId
        Wait-Process -Id $overlay.ProcessId -ErrorAction SilentlyContinue
        $overlay = $null
    }
    if ($overlay) {
        $env:ELECTRON_RUN_AS_NODE = $null
        $arguments = '"' + (Join-Path $root 'app\companion-overlay') + '"'
        if ($DesktopOnly) { $arguments += ' --desktop-companion' }
        Start-Process -FilePath $overlayExe -ArgumentList $arguments -WindowStyle Hidden | Out-Null
    } else { & (Join-Path $PSScriptRoot 'start-companion-overlay.ps1') -DesktopMode:$DesktopOnly }
} catch {
    $_.Exception.Message | Set-Content -LiteralPath (Join-Path $logDir 'launcher-error.txt') -Encoding utf8
    Add-Type -AssemblyName System.Windows.Forms
    $choice = [Windows.Forms.MessageBox]::Show($_.Exception.Message + "`n`n点「重试」再叫她一次。", '大肥鱼没能启动', 'RetryCancel', 'Warning')
    $retry = $choice -eq 'Retry'
    $failed = $true
} finally {
    $lock.ReleaseMutex(); $lock.Dispose()
}
# Retry only after the mutex is released, so the next attempt is not refused as a duplicate.
if ($retry) { & $PSCommandPath -DesktopOnly:$DesktopOnly; exit $LASTEXITCODE }
if ($failed) { exit 1 }
