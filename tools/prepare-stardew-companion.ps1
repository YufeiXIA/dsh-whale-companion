param(
    [Parameter(Mandatory=$true)][string]$GamePath,
    [string]$CompanionDataDir
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'companion-config.ps1')
if (-not $CompanionDataDir) { $CompanionDataDir = $Config.DataDir }
$game = (Resolve-Path -LiteralPath $GamePath).Path
if (-not (Test-Path -LiteralPath (Join-Path $game 'StardewModdingAPI.dll'))) {
    throw '请先按 https://smapi.io 的官方说明安装 SMAPI，再运行本脚本。'
}
if (Get-Process StardewModdingAPI -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq (Join-Path $game 'StardewModdingAPI.exe') }) {
    throw '请先退出这个目录里的星露谷，避免覆盖正在使用的模组。'
}
$project = Join-Path $root 'app\stardew-mod\SeiCompanion\SeiCompanion.csproj'
& dotnet build $project -c Release "-p:GamePath=$game" --nologo
if ($LASTEXITCODE -ne 0) { throw '模组编译失败；游戏文件尚未修改。' }
$compiled = Join-Path (Split-Path $project -Parent) 'bin\Release\net6.0'
$mod = Join-Path $game 'Mods\SeiCompanion'
New-Item -ItemType Directory -Force -Path $mod | Out-Null
foreach ($file in @('SeiCompanion.dll','manifest.json')) {
    Copy-Item -LiteralPath (Join-Path $compiled $file) -Destination (Join-Path $mod $file) -Force
}
Copy-Item -LiteralPath (Join-Path $compiled 'Assets') -Destination $mod -Recurse -Force
foreach ($file in @('LICENSE','THIRD_PARTY_NOTICES.md','UPSTREAM.md')) {
    Copy-Item -LiteralPath (Join-Path $root "app\stardew-mod\$file") -Destination $mod -Force
}
$modConfig = Join-Path $mod 'config.json'
if (Test-Path -LiteralPath $modConfig) {
    $settings = Get-Content -LiteralPath $modConfig -Raw | ConvertFrom-Json -AsHashtable
} else {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $settings = @{ Port=27431; Token=([BitConverter]::ToString($bytes).Replace('-','')); ObserveHz=2; AnnounceInChat=$true; StartingGold=500; DisconnectGraceSeconds=10 }
}
# Developer farm creation/time changes are never enabled in the normal install.
$settings.DevCommands = $false
$utf8 = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText($modConfig, ($settings | ConvertTo-Json -Depth 6), $utf8)
New-Item -ItemType Directory -Force -Path $CompanionDataDir | Out-Null
[IO.File]::WriteAllText((Join-Path $CompanionDataDir 'stardew.json'),
    (@{gamePath=$game; modConfig=$modConfig} | ConvertTo-Json), $utf8)
Write-Output '已安装伙伴模组并登记连接。启动 SMAPI 进入农场后，在大肥鱼面板的「连接」里选择「星露谷物语」。'
