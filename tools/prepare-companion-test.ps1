$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'companion-config.ps1')
$game = $Config.Sts2Game
if (-not $game) { throw 'companion.config.json 里需要填 sts2Game（杀戮尖塔 2 的安装目录）。' }
$testRoot = Join-Path $root 'app\companion-test'
New-Item -ItemType Directory -Force $testRoot | Out-Null
foreach ($slot in @('human', 'whale')) {
    $instance = Join-Path $testRoot $slot
    New-Item -ItemType Directory -Force $instance | Out-Null
    foreach ($asset in Get-ChildItem -LiteralPath $game -File) {
        $target = Join-Path $instance $asset.Name
        if (Test-Path -LiteralPath $target) { continue }
        Copy-Item -LiteralPath $asset.FullName -Destination $target
    }
    $data = Join-Path $instance 'data_sts2_windows_x86_64'
    if (-not (Test-Path -LiteralPath $data)) {
        Copy-Item -LiteralPath (Join-Path $game 'data_sts2_windows_x86_64') -Destination $data -Recurse
    }
    foreach ($dir in @('mods\STS2_MCP', 'mods\LanSpire', 'roaming', 'local', 'temp', 'logs')) {
        New-Item -ItemType Directory -Force (Join-Path $instance $dir) | Out-Null
    }
    Copy-Item (Join-Path $root 'upstream\STS2MCP\bin\Release\net9.0\STS2_MCP.dll') (Join-Path $instance 'mods\STS2_MCP')
    Copy-Item (Join-Path $root 'upstream\STS2MCP\mod_manifest.json') (Join-Path $instance 'mods\STS2_MCP\STS2_MCP.json')
    Copy-Item (Join-Path $root 'upstream\LanSpire\LanSpire\bin\Debug\net9.0\LanSpire.dll') (Join-Path $instance 'mods\LanSpire')
    Copy-Item (Join-Path $root 'upstream\LanSpire\LanSpire\LanSpire.json') (Join-Path $instance 'mods\LanSpire')
    $port = if ($slot -eq 'human') { 15526 } else { 15527 }
    @{ port = $port } | ConvertTo-Json | Set-Content (Join-Path $instance 'mods\STS2_MCP\STS2_MCP.conf') -Encoding utf8NoBOM
    Write-Output "Prepared $slot at $instance (bridge $port); original game files unchanged."
}
