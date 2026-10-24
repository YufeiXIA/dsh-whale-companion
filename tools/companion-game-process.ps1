param([ValidateSet('Status','StopWhale')][string]$Action='Status', [switch]$OnlyIfHumanAbsent)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$humanPath=Join-Path $root 'app\companion-test\human\SlayTheSpire2.exe'
$whalePath=Join-Path $root 'app\companion-test\whale\SlayTheSpire2.exe'
function Get-OwnedGames {
    $games=@(Get-CimInstance Win32_Process -Filter "Name='SlayTheSpire2.exe'")
    [pscustomobject]@{
        human=@($games | Where-Object {$_.ExecutablePath -eq $humanPath} | Select-Object -ExpandProperty ProcessId)
        whale=@($games | Where-Object {$_.ExecutablePath -eq $whalePath} | Select-Object -ExpandProperty ProcessId)
    }
}
$owned=Get-OwnedGames
$stopped=@()
if ($Action -eq 'StopWhale' -and (-not $OnlyIfHumanAbsent -or $owned.human.Count -eq 0)) {
    foreach ($gameId in $owned.whale) {
        $game=Get-Process -Id $gameId -ErrorAction SilentlyContinue
        # Recheck the live process identity immediately before using its handle.
        if (-not $game -or $game.Path -ne $whalePath) { continue }
        $graceful=$game.CloseMainWindow()
        if (-not $graceful -or -not $game.WaitForExit(3000)) {
            if (-not $game.HasExited) { $game.Kill() }
        }
        if (-not $game.WaitForExit(5000)) { throw 'Whale game did not exit' }
        $stopped+=$gameId
        $game.Dispose()
    }
    $owned=Get-OwnedGames
}
[pscustomobject]@{humanRunning=$owned.human.Count -gt 0;whaleRunning=$owned.whale.Count -gt 0;humanPids=$owned.human;whalePids=$owned.whale;stoppedPids=$stopped} | ConvertTo-Json -Compress
