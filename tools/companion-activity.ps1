param([switch]$Once, [switch]$Diagnostic, [switch]$PrimaryWindow, [int]$ExcludeProcessId = 0)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WhaleActivity {
    [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public uint cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out int value, int size);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd, System.Text.StringBuilder name, int length);
    public delegate bool EnumWindowProc(IntPtr hwnd, IntPtr param);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowProc callback, IntPtr param);
    public static IntPtr[] WindowsInOrder() {
        var windows = new System.Collections.Generic.List<IntPtr>();
        EnumWindows((hwnd, param) => { windows.Add(hwnd); return true; }, IntPtr.Zero);
        return windows.ToArray();
    }
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint flags);
    [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO input);
    [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
    [DllImport("user32.dll")] public static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, System.Text.StringBuilder text, int length);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool GetUserObjectInformation(IntPtr obj, int index, System.Text.StringBuilder name, uint length, out uint needed);
}
'@
# Physical pixels, so the overlay can convert window rectangles on mixed-DPI setups.
[void][WhaleActivity]::SetProcessDpiAwarenessContext([IntPtr]-4)
# Background apps: only these allow-listed kinds leave the script, never process names or titles.
# Tray apps count while running; the rest only with an open window, so helper processes do not.
$trayKinds = [ordered]@{
    steam = '^steam$'; discord = '^Discord$'; wechat = '^(WeChat|Weixin)$'; qq = '^(QQ|QQNT)$'
    music = '^(Spotify|cloudmusic|QQMusic|KuGou|kwmusic)$'; obs = '^obs64$'; download = '^(Thunder|qbittorrent|BitComet|IDMan)$'
}
$windowKinds = [ordered]@{
    code = '^(Code|Code - Insiders|devenv|idea64|pycharm64|notepad\+\+|Cursor)$'; documents = '^(WINWORD|EXCEL|POWERPNT|Acrobat|AcroRd32|Obsidian|Typora)$'
    browser = '^(msedge|chrome|firefox|brave|vivaldi)$'; media = '^(vlc|mpv|PotPlayerMini64|wmplayer)$'; terminal = '^WindowsTerminal$'
    ai = '^(Claude|ChatGPT|Codex)$'; epic = '^EpicGamesLauncher$'; sts2 = '^(SlayTheSpire2|Slay the Spire 2|sts2)$'; sts = '^SlayTheSpire$'; stardew = '^Stardew Valley$'
}
function Get-BackgroundKinds {
    $kinds = [System.Collections.Generic.SortedSet[string]]::new()
    foreach ($process in Get-Process) {
        $name = $process.ProcessName
        foreach ($kind in $trayKinds.Keys) { if ($name -match $trayKinds[$kind]) { [void]$kinds.Add($kind) } }
        if ($process.MainWindowHandle -ne [IntPtr]::Zero) {
            foreach ($kind in $windowKinds.Keys) { if ($name -match $windowKinds[$kind]) { [void]$kinds.Add($kind) } }
        }
    }
    return $kinds
}
$background = @(); $backgroundTick = 0
do {
    $sample = @{ available = $false }
    $desktopHandle = [WhaleActivity]::OpenInputDesktop(0, $false, 1)
    try {
        $windowHandle = [WhaleActivity]::GetForegroundWindow()
        $primaryInfo = [WhaleActivity+MONITORINFO]::new()
        $primaryInfo.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($primaryInfo)
        if ($PrimaryWindow) {
            $windowHandle = [IntPtr]::Zero
            if ([WhaleActivity]::GetMonitorInfo([WhaleActivity]::MonitorFromWindow([IntPtr]::Zero, 1), [ref]$primaryInfo)) {
                foreach ($candidate in [WhaleActivity]::WindowsInOrder()) {
                    if (-not [WhaleActivity]::IsWindowVisible($candidate) -or [WhaleActivity]::IsIconic($candidate)) { continue }
                    [int]$cloaked = 0
                    if ([WhaleActivity]::DwmGetWindowAttribute($candidate, 14, [ref]$cloaked, 4) -eq 0 -and $cloaked -ne 0) { continue }
                    [uint32]$candidateProcessId = 0
                    [void][WhaleActivity]::GetWindowThreadProcessId($candidate, [ref]$candidateProcessId)
                    if ($candidateProcessId -eq $ExcludeProcessId) { continue }
                    $className = [System.Text.StringBuilder]::new(128)
                    [void][WhaleActivity]::GetClassName($candidate, $className, 128)
                    if ($className.ToString() -in @('Shell_TrayWnd','Shell_SecondaryTrayWnd','Progman','WorkerW','tooltips_class32')) { continue }
                    $candidateRect = [WhaleActivity+RECT]::new()
                    if (-not [WhaleActivity]::GetWindowRect($candidate, [ref]$candidateRect)) { continue }
                    $primaryRect = $primaryInfo.rcMonitor
                    if ($candidateRect.Right -le $primaryRect.Left -or $candidateRect.Left -ge $primaryRect.Right -or
                        $candidateRect.Bottom -le $primaryRect.Top -or $candidateRect.Top -ge $primaryRect.Bottom) { continue }
                    if ($candidateRect.Right - $candidateRect.Left -lt 100 -or $candidateRect.Bottom - $candidateRect.Top -lt 80) { continue }
                    $windowHandle = $candidate
                    break
                }
            }
        }
        $inputInfo = [WhaleActivity+LASTINPUTINFO]::new()
        $inputInfo.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($inputInfo)
        $desktopName = [System.Text.StringBuilder]::new(128)
        [uint32]$neededBytes = 0
        $normalDesktop = $desktopHandle -ne [IntPtr]::Zero -and [WhaleActivity]::GetUserObjectInformation($desktopHandle, 2, $desktopName, 256, [ref]$neededBytes) -and $desktopName.ToString() -eq 'Default'
        if ($normalDesktop -and $windowHandle -ne [IntPtr]::Zero -and [WhaleActivity]::GetLastInputInfo([ref]$inputInfo)) {
            [uint32]$foregroundProcessId = 0
            [void][WhaleActivity]::GetWindowThreadProcessId($windowHandle, [ref]$foregroundProcessId)
            $processName = (Get-Process -Id $foregroundProcessId -ErrorAction Stop).ProcessName
            $appKind = switch -Regex ($processName) {
                '^(Code|Code - Insiders|devenv|idea64|pycharm64|notepad\+\+|Cursor)$' { 'code'; break }
                '^(WINWORD|EXCEL|POWERPNT|Acrobat|AcroRd32|Obsidian|Typora)$' { 'documents'; break }
                '^(msedge|chrome|firefox|brave|vivaldi)$' { 'browser'; break }
                '^(vlc|mpv|PotPlayerMini64|wmplayer|Spotify|cloudmusic)$' { 'media'; break }
                '^(SlayTheSpire2|Slay the Spire 2|sts2)$' { 'sts2'; break }
                '^SlayTheSpire$' { 'sts'; break }
                '^Stardew Valley$' { 'stardew'; break }
                '^(explorer|ShellExperienceHost|StartMenuExperienceHost)$' { 'desktop'; break }
                '^(electron|DeepSeek Harness)$' { 'companion'; break }
                default { 'other' }
            }
            $tickNow = [long][Environment]::TickCount -band 0xffffffffL
            $idleMs = ($tickNow - [long]$inputInfo.dwTime + 4294967296L) % 4294967296L
            # The title is read only to keep screenshots away from private windows; it is never output.
            $title = [System.Text.StringBuilder]::new(512)
            [void][WhaleActivity]::GetWindowText($windowHandle, $title, 512)
            $sensitive = $processName -match '^(1Password|KeePass|KeePassXC|Bitwarden|Dashlane|LastPass|Enpass|RoboForm|NordPass|ProtonPass|Authy)$' -or
                $title.ToString() -match '(?i)InPrivate|Incognito|Private Browsing|\u9690\u8eab|\u65e0\u75d5|\u9690\u79c1\u7a97\u53e3|password|\u5bc6\u7801|bank|\u94f6\u884c|\u7f51\u94f6|\u652f\u4ed8\u5b9d|alipay|paypal|wallet|\u94b1\u5305'
            # Geometry stays on this machine: the overlay uses it to perch on windows and to hide during fullscreen.
            $rect = [WhaleActivity+RECT]::new(); $monitor = [WhaleActivity+MONITORINFO]::new()
            $monitor.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($monitor)
            $hasRect = -not [WhaleActivity]::IsIconic($windowHandle) -and [WhaleActivity]::GetWindowRect($windowHandle, [ref]$rect)
            $fullscreen = $hasRect -and $appKind -ne 'desktop' -and [WhaleActivity]::GetMonitorInfo([WhaleActivity]::MonitorFromWindow($windowHandle, 2), [ref]$monitor) -and
                -not [WhaleActivity]::IsZoomed($windowHandle) -and
                $rect.Left -eq $monitor.rcMonitor.Left -and $rect.Top -eq $monitor.rcMonitor.Top -and
                $rect.Right -eq $monitor.rcMonitor.Right -and $rect.Bottom -eq $monitor.rcMonitor.Bottom
            $sample = @{ available = $true; app = $appKind; idleMs = $idleMs; windowId = $windowHandle.ToInt64().ToString(); sensitive = [bool]$sensitive; fullscreen = [bool]$fullscreen }
            $sample.captureOverlay = $processName -match '^(SnippingTool|ScreenClippingHost|ScreenSketch|SnipAndSketch)$'
            if ($hasRect) { $sample.rect = @{ x = $rect.Left; y = $rect.Top; width = $rect.Right - $rect.Left; height = $rect.Bottom - $rect.Top } }
            if ($PrimaryWindow) {
                $primaryRect = $primaryInfo.rcMonitor
                $sample.screenBounds = @{ x = $primaryRect.Left; y = $primaryRect.Top; width = $primaryRect.Right - $primaryRect.Left; height = $primaryRect.Bottom - $primaryRect.Top }
            }
        }
    } catch {
        $sample = @{ available = $false }
        if ($Diagnostic) { [Console]::Error.WriteLine($_.Exception.GetType().Name + ': ' + $_.Exception.Message) }
    }
    finally { if ($desktopHandle -ne [IntPtr]::Zero) { [void][WhaleActivity]::CloseDesktop($desktopHandle) } }
    if ($sample.available) {
        # Refreshed every 30 s; the foreground app is already reported on its own.
        if ($Once -or $backgroundTick % 15 -eq 0) { try { $background = @(Get-BackgroundKinds) } catch { $background = @() } }
        $backgroundTick++
        $sample.background = @($background | Where-Object { $_ -ne $sample.app })
    }
    if ($Diagnostic) { [Console]::Error.WriteLine('Desktop=' + $desktopName + '; foregroundAvailable=' + ($windowHandle -ne [IntPtr]::Zero)) }
    $sample | ConvertTo-Json -Compress
    if (-not $Once) { Start-Sleep -Seconds 2 }
} while (-not $Once)
