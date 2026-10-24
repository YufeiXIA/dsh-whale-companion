# Shared settings for the launcher scripts, read from companion.config.json in the project root.
# Paths may use %VARIABLE% references; relative paths are resolved from the project root.
$root = Split-Path $PSScriptRoot -Parent
$configFile = Join-Path $root 'companion.config.json'
if (-not (Test-Path -LiteralPath $configFile)) {
    throw '没找到 companion.config.json：先把 companion.config.example.json 复制一份并填好自己的路径。'
}
$raw = Get-Content -LiteralPath $configFile -Raw -Encoding utf8 | ConvertFrom-Json
function Resolve-ConfigPath([string]$Value) {
    if (-not $Value) { return $null }
    $Value = [Environment]::ExpandEnvironmentVariables($Value)
    if (-not [IO.Path]::IsPathRooted($Value)) { $Value = Join-Path $root $Value }
    [IO.Path]::GetFullPath($Value)
}
$dshHome = Resolve-ConfigPath $raw.dshHome
if (-not $dshHome) { throw 'companion.config.json 里需要填 dshHome（DSH 的数据目录）。' }
$Config = [pscustomobject]@{
    DshExe             = Resolve-ConfigPath $raw.dshExe
    DshHome            = $dshHome
    Port               = if ($raw.port) { [int]$raw.port } else { 19388 }
    Profile            = 'companion-test'
    DataDir            = if ($raw.dataDir) { Resolve-ConfigPath $raw.dataDir } else { Join-Path $dshHome 'game-companion' }
    WhalePetPlugin     = Resolve-ConfigPath $raw.whalePetPlugin
    LlmProviderProfile = $raw.llmProviderProfile
    LlmProviderId      = $raw.llmProviderId
    ElectronExe        = Resolve-ConfigPath ($raw.electronExe ?? 'tools/electron44/electron.exe')
    VoiceAdapterRoot   = Resolve-ConfigPath $raw.voiceAdapterRoot
    Sts2Game           = Resolve-ConfigPath $raw.sts2Game
}
