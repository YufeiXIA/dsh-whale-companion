$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'companion-config.ps1')
$profileDir = Join-Path $Config.DshHome "profiles\$($Config.Profile)"
$pluginDir = Join-Path $root 'app\dsh-game-companion'
$manifestFile = Join-Path $profileDir 'package.json'
if (-not (Test-Path -LiteralPath $manifestFile)) {
  throw "没找到 $manifestFile。先运行一次 tools\start-companion-profile.ps1 让 DSH 建好 $($Config.Profile) profile，关掉宿主后再运行本脚本。"
}
$manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json -AsHashtable
$links = @(@{Name='dsh-game-companion'; Target=$pluginDir})
# The original whale pet serves the /whale-pet/*.webm clips; link an existing install if there is one.
if ($Config.WhalePetPlugin) { $links += @{Name='@luweiyabo/dsh-whale-pet'; Target=$Config.WhalePetPlugin} }
foreach ($item in $links) {
  $manifest.dependencies[$item.Name] = 'link:' + $item.Target.Replace('\','/')
  if ($manifest.dsh.profile.bundles -notcontains $item.Name) { $manifest.dsh.profile.bundles += $item.Name }
  $link = Join-Path (Join-Path $profileDir 'node_modules') $item.Name
  New-Item -ItemType Directory -Force -Path (Split-Path $link -Parent) | Out-Null
  if (-not (Test-Path -LiteralPath $link)) { New-Item -ItemType Junction -Path $link -Target $item.Target | Out-Null }
}
$manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifestFile -Encoding utf8
# Optionally copy one model provider definition from an existing profile into the companion profile.
if ($Config.LlmProviderProfile -and $Config.LlmProviderId) {
  $lines = Get-Content -LiteralPath (Join-Path $Config.DshHome "profiles\$($Config.LlmProviderProfile)\cordis.patch.yml")
  $start = [Array]::IndexOf($lines, "- id: $($Config.LlmProviderId)")
  if ($start -lt 0) { throw "在 $($Config.LlmProviderProfile) profile 里没找到模型服务 $($Config.LlmProviderId)" }
  $provider = [System.Collections.Generic.List[string]]::new()
  for ($index = $start; $index -lt $lines.Length; $index++) {
    if ($index -gt $start -and $lines[$index].StartsWith('- ')) { break }
    $provider.Add($lines[$index])
  }
  $provider | Set-Content -LiteralPath (Join-Path $profileDir 'cordis.patch.yml') -Encoding utf8
}
New-Item -ItemType Directory -Force -Path $Config.DataDir | Out-Null
$tokenFile = Join-Path $Config.DataDir 'bridge-token.txt'
if (-not (Test-Path -LiteralPath $tokenFile)) {
  [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)) | Set-Content -LiteralPath $tokenFile -Encoding ascii
}
Write-Output "Prepared $($Config.Profile) profile; other DSH profiles unchanged."
if (-not $Config.WhalePetPlugin) {
  Write-Output "还需要原版鲸鱼桌宠提供动画：dsh plugin --profile $($Config.Profile) add @luweiyabo/dsh-whale-pet"
}
