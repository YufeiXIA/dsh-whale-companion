import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

// Local metadata only. Names, bundle IDs, window titles and AX objects never leave this process.
// No permission-request APIs are used: users grant access explicitly in System Settings.
func emit(_ value: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
          let line = String(data: data, encoding: .utf8) else { return }
    print(line)
    fflush(stdout)
}

func matches(_ value: String, _ pattern: String) -> Bool {
    value.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
}

func appKind(name: String, bundle: String) -> String {
    let names: [(String, String)] = [
        ("code", "^(Visual Studio Code( - Insiders)?|Code( - Insiders)?|Cursor|Xcode|IntelliJ IDEA.*|PyCharm.*|WebStorm.*)$"),
        ("documents", "^(Microsoft Word|Microsoft Excel|Microsoft PowerPoint|Word|Excel|PowerPoint|Pages|Numbers|Keynote|Preview|Adobe Acrobat.*|Obsidian|Typora)$"),
        ("browser", "^(Safari|Google Chrome( Canary)?|Chromium|Firefox|Brave Browser|Microsoft Edge|Vivaldi|Arc|Opera)$"),
        ("media", "^(VLC|IINA|mpv|QuickTime Player)$"),
        ("terminal", "^(Terminal|iTerm2?|Warp|Alacritty|kitty|Ghostty)$"),
        ("ai", "^(Claude|ChatGPT|Codex)$"),
        ("steam", "^Steam$"), ("discord", "^Discord$"),
        ("wechat", "^(WeChat|Weixin|微信)$"), ("qq", "^(QQ|QQNT)$"),
        ("music", "^(Music|Spotify|网易云音乐|NetEaseMusic|QQMusic|QQ音乐)$"),
        ("obs", "^(OBS|OBS Studio)$"), ("download", "^(Transmission|qBittorrent|迅雷|Thunder|Folx)$"),
        ("epic", "^Epic Games Launcher$"), ("sts2", "^(Slay the Spire 2|SlayTheSpire2|sts2)$"),
        ("sts", "^(Slay the Spire|SlayTheSpire)$"), ("stardew", "^(Stardew Valley|StardewValley)$")
    ]
    let bundles = ["com.apple.finder": "desktop", "com.apple.safari": "browser",
                   "com.microsoft.vscode": "code", "com.todesktop.230313mzl4w4u92": "code",
                   "com.apple.terminal": "terminal", "com.googlecode.iterm2": "terminal",
                   "com.valvesoftware.steam": "steam", "com.hnc.discord": "discord",
                   "com.tencent.xinwechat": "wechat", "com.tencent.qq": "qq",
                   "com.spotify.client": "music", "com.apple.music": "music"]
    if let kind = bundles[bundle.lowercased()] { return kind }
    return names.first(where: { matches(name, $0.1) })?.0 ?? "other"
}

func sensitiveWindow(name: String, bundle: String, title: String?) -> Bool {
    if matches(name + " " + bundle, "1password|keepass|bitwarden|dashlane|lastpass|enpass|roboform|nordpass|protonpass|authy|keychain|钥匙串") { return true }
    guard let title = title else { return true }
    return matches(title, "inprivate|incognito|private browsing|隐身|无痕|隐私窗口|password|密码|bank|银行|网银|支付宝|alipay|paypal|wallet|钱包")
}

func foregroundKind(_ kind: String) -> String {
    if kind == "music" { return "media" }
    let allowed: Set<String> = ["code", "documents", "browser", "media", "sts2", "sts", "stardew", "desktop"]
    return allowed.contains(kind) ? kind : "other"
}

func captureOverlay(name: String, bundle: String) -> Bool {
    matches(name + " " + bundle, "screenshot|screencaptureui")
}

func rectangle(_ rect: CGRect) -> [String: Double] {
    ["x": Double(rect.minX), "y": Double(rect.minY), "width": Double(rect.width), "height": Double(rect.height)]
}

// CGWindow bounds already use logical screen points, with the menu-bar display's top-left as origin.
// NSScreen frames instead use bottom-left coordinates; NSScreen.main may be a different active display.
func topLeftScreenRect(_ frame: CGRect, primaryTop: CGFloat) -> CGRect {
    CGRect(x: frame.minX, y: primaryTop - frame.maxY, width: frame.width, height: frame.height)
}

func nearlyEqual(_ lhs: CGRect, _ rhs: CGRect, tolerance: CGFloat = 2) -> Bool {
    abs(lhs.minX - rhs.minX) <= tolerance && abs(lhs.minY - rhs.minY) <= tolerance &&
        abs(lhs.width - rhs.width) <= tolerance && abs(lhs.height - rhs.height) <= tolerance
}

struct WindowInfo {
    let id: CGWindowID
    let pid: pid_t
    let rect: CGRect
    let title: String?
    let layer: Int
    let onScreen: Bool
    let alpha: Double
}

func windows(onScreenOnly: Bool = true) -> [WindowInfo] {
    let options: CGWindowListOption = onScreenOnly ? [.optionOnScreenOnly, .excludeDesktopElements] : [.optionAll, .excludeDesktopElements]
    guard let list = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else { return [] }
    return list.compactMap { row in
        guard let id = row[kCGWindowNumber as String] as? NSNumber,
              let pid = row[kCGWindowOwnerPID as String] as? NSNumber,
              let bounds = row[kCGWindowBounds as String] as? [String: Any],
              let rect = CGRect(dictionaryRepresentation: bounds as CFDictionary) else { return nil }
        return WindowInfo(id: id.uint32Value, pid: pid.int32Value, rect: rect,
                          title: row[kCGWindowName as String] as? String,
                          layer: (row[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0,
                          onScreen: (row[kCGWindowIsOnscreen as String] as? NSNumber)?.boolValue ?? false,
                          alpha: (row[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 1)
    }
}

func eligible(_ window: WindowInfo, excluded: pid_t) -> Bool {
    guard window.pid != excluded, window.pid != getpid(), window.layer == 0, window.onScreen,
          window.alpha > 0, window.rect.width >= 100, window.rect.height >= 80,
          let app = NSRunningApplication(processIdentifier: window.pid), !app.isHidden, !app.isTerminated else { return false }
    return app.activationPolicy == .regular
}

func axAttribute(_ element: AXUIElement, _ attribute: String) -> CFTypeRef? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success ? value : nil
}

func axRect(_ element: AXUIElement) -> CGRect? {
    guard let position = axAttribute(element, kAXPositionAttribute), let size = axAttribute(element, kAXSizeAttribute),
          CFGetTypeID(position) == AXValueGetTypeID(), CFGetTypeID(size) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero, dimensions = CGSize.zero
    guard AXValueGetValue(unsafeBitCast(position, to: AXValue.self), .cgPoint, &point),
          AXValueGetValue(unsafeBitCast(size, to: AXValue.self), .cgSize, &dimensions) else { return nil }
    return CGRect(origin: point, size: dimensions)
}

func accessibilityWindow(_ window: WindowInfo) -> AXUIElement? {
    guard AXIsProcessTrusted() else { return nil }
    let app = AXUIElementCreateApplication(window.pid)
    guard let value = axAttribute(app, kAXWindowsAttribute), let elements = value as? [AXUIElement] else { return nil }
    let candidates = elements.filter { element in
        guard let rect = axRect(element), nearlyEqual(rect, window.rect) else { return false }
        guard let title = window.title else { return true }
        return (axAttribute(element, kAXTitleAttribute) as? String) == title
    }
    return candidates.count == 1 ? candidates[0] : nil
}

func hasSecureFocus(pid: pid_t) -> Bool {
    guard AXIsProcessTrusted(), let focused = axAttribute(AXUIElementCreateApplication(pid), kAXFocusedUIElementAttribute),
          CFGetTypeID(focused) == AXUIElementGetTypeID() else { return false }
    let element = unsafeBitCast(focused, to: AXUIElement.self)
    return (axAttribute(element, kAXSubroleAttribute) as? String) == kAXSecureTextFieldSubrole
}

func backgroundKinds(_ visible: [WindowInfo], excluded: pid_t, foreground: String) -> [String] {
    let tray: Set<String> = ["steam", "discord", "wechat", "qq", "music", "obs", "download"]
    let allowed = tray.union(["code", "documents", "browser", "media", "terminal", "ai", "epic", "sts2", "sts", "stardew"])
    let visiblePids = Set(visible.filter { $0.layer == 0 }.map { $0.pid })
    var result = Set<String>()
    for app in NSWorkspace.shared.runningApplications where app.processIdentifier != excluded && app.processIdentifier != getpid() {
        let kind = appKind(name: app.localizedName ?? "", bundle: app.bundleIdentifier ?? "")
        if allowed.contains(kind) && (tray.contains(kind) || visiblePids.contains(app.processIdentifier)) && kind != foreground {
            result.insert(kind)
        }
    }
    return result.sorted()
}

func sample(primary: Bool, excluded: pid_t) -> [String: Any] {
    guard let front = NSWorkspace.shared.frontmostApplication, !front.isTerminated,
          front.bundleIdentifier != "com.apple.loginwindow" else { return ["available": false] }
    let visible = windows()
    guard let primaryFrame = NSScreen.screens.first?.frame else { return ["available": false] }
    let primaryBounds = topLeftScreenRect(primaryFrame, primaryTop: primaryFrame.maxY)
    let ownFront = front.processIdentifier == excluded || front.processIdentifier == getpid()
    let candidate: WindowInfo?
    if primary {
        // Never jump behind a private foreground window to find an otherwise capturable app.
        guard CGPreflightScreenCaptureAccess() else { return ["available": false, "permissionRequired": "screen-recording"] }
        if captureOverlay(name: front.localizedName ?? "", bundle: front.bundleIdentifier ?? "") { return ["available": false] }
        candidate = visible.first { eligible($0, excluded: excluded) && $0.rect.intersects(primaryBounds) }
    } else {
        candidate = visible.first { $0.pid == front.processIdentifier && $0.layer == 0 && $0.alpha > 0 }
    }
    let targetApp = candidate.flatMap { NSRunningApplication(processIdentifier: $0.pid) } ?? front
    let name = targetApp.localizedName ?? "", bundle = targetApp.bundleIdentifier ?? ""
    var kind = foregroundKind(appKind(name: name, bundle: bundle))
    if !primary && ownFront { kind = "companion" }
    let title = candidate?.title
    var sensitive = sensitiveWindow(name: name, bundle: bundle, title: title)
    if primary {
        guard let selected = candidate else { return ["available": false] }
        // A screen crop also contains windows above the target. Check every intersecting overlay,
        // including small dialogs, rather than quietly sampling through a private front window.
        for window in visible {
            if window.id == selected.id { break }
            if window.pid == excluded || window.pid == getpid() || window.alpha <= 0 || !window.rect.intersects(selected.rect.intersection(primaryBounds)) { continue }
            guard let owner = NSRunningApplication(processIdentifier: window.pid) else { return ["available": false] }
            if captureOverlay(name: owner.localizedName ?? "", bundle: owner.bundleIdentifier ?? "") ||
                sensitiveWindow(name: owner.localizedName ?? "", bundle: owner.bundleIdentifier ?? "", title: window.title) {
                return ["available": false]
            }
        }
        sensitive = sensitive || hasSecureFocus(pid: selected.pid)
    }
    let idleSeconds = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: CGEventType(rawValue: UInt32.max)!)
    var result: [String: Any] = ["available": true, "app": kind, "idleMs": idleSeconds.isFinite ? max(0, idleSeconds * 1000) : 0,
                                "windowId": candidate.map { String($0.id) } ?? "0", "sensitive": sensitive,
                                "fullscreen": false, "captureOverlay": captureOverlay(name: name, bundle: bundle),
                                "coordinateSpace": "dip", "background": backgroundKinds(visible, excluded: excluded, foreground: kind)]
    if let selected = candidate, !ownFront || primary {
        result["rect"] = rectangle(selected.rect)
        let isFullscreen = NSScreen.screens.contains { screen in
            nearlyEqual(selected.rect, topLeftScreenRect(screen.frame, primaryTop: primaryFrame.maxY))
        }
        let axFullscreen = accessibilityWindow(selected).flatMap { axAttribute($0, "AXFullScreen") as? Bool } ?? false
        result["fullscreen"] = kind != "desktop" && (isFullscreen || axFullscreen)
    }
    if primary { result["screenBounds"] = rectangle(primaryBounds) }
    return result
}

enum TrackerCommand: Equatable {
    case select(Int)
    case track(CGWindowID, pid_t)
    case clear
}

func parseCommand(_ line: String) -> TrackerCommand? {
    let parts = line.split(whereSeparator: { $0.isWhitespace })
    if parts.count == 2, parts[0] == "select", let request = Int(parts[1]), request > 0 { return .select(request) }
    if parts.count == 3, parts[0] == "track", let window = UInt32(parts[1]), window > 0,
       let pid = Int32(parts[2]), pid > 0 { return .track(window, pid) }
    if parts.count == 1, parts[0] == "clear" { return .clear }
    return nil
}

struct Target {
    let window: CGWindowID
    let pid: pid_t
    let launchDate: Date?
    let axWindow: AXUIElement?
}

final class WindowTracker {
    let excluded: pid_t
    var lastExternal: Target?
    var selected: Target?
    var tracked: Target?
    var previous: String?

    init(excluded: pid_t) { self.excluded = excluded }

    func target(_ window: WindowInfo) -> Target {
        Target(window: window.id, pid: window.pid, launchDate: NSRunningApplication(processIdentifier: window.pid)?.launchDate,
               axWindow: accessibilityWindow(window))
    }

    func snapshot(_ target: Target) -> [String: Any] {
        var result: [String: Any] = ["windowId": String(target.window), "processId": target.pid, "coordinateSpace": "dip"]
        func status(_ value: String) -> [String: Any] { var copy = result; copy["status"] = value; return copy }
        guard target.pid != excluded, target.pid != getpid(), let app = NSRunningApplication(processIdentifier: target.pid),
              !app.isTerminated, let launched = target.launchDate, app.launchDate == launched else { return status("closed") }
        guard AXIsProcessTrusted() else { return status("permission-required") }
        if let element = target.axWindow {
            var role: CFTypeRef?
            if AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &role) == .invalidUIElement { return status("closed") }
            if (axAttribute(element, kAXMinimizedAttribute) as? Bool) == true { return status("minimized") }
        }
        guard let info = windows(onScreenOnly: false).first(where: { $0.id == target.window && $0.pid == target.pid }) else { return status("closed") }
        if app.isHidden || !info.onScreen { return status("hidden") }
        guard info.rect.width > 0, info.rect.height > 0 else { return status("unavailable") }
        result["status"] = "visible"
        result["rect"] = rectangle(info.rect)
        return result
    }

    func refreshFront() {
        guard AXIsProcessTrusted(), let front = NSWorkspace.shared.frontmostApplication,
              front.processIdentifier != excluded, front.processIdentifier != getpid(),
              let info = windows().first(where: { $0.pid == front.processIdentifier && eligible($0, excluded: excluded) }) else { return }
        if lastExternal?.window != info.id || lastExternal?.pid != info.pid || lastExternal?.launchDate != front.launchDate {
            lastExternal = target(info)
        }
    }

    func handle(_ line: String) {
        guard let command = parseCommand(line) else { return }
        switch command {
        case .select(let request):
            refreshFront()
            var result: [String: Any] = ["kind": "selected", "requestId": request, "status": "unavailable"]
            if !AXIsProcessTrusted() { result["status"] = "permission-required" }
            else if let candidate = lastExternal, snapshot(candidate)["status"] as? String == "visible" {
                selected = candidate
                result.merge(snapshot(candidate)) { _, new in new }
            }
            emit(result)
        case .track(let window, let pid):
            if let candidate = selected, candidate.window == window && candidate.pid == pid { tracked = candidate }
            else if let info = windows().first(where: { $0.id == window && $0.pid == pid && eligible($0, excluded: excluded) }) { tracked = target(info) }
            else { tracked = Target(window: window, pid: pid, launchDate: nil, axWindow: nil) }
            previous = nil
            tick()
        case .clear:
            tracked = nil
            selected = nil
            previous = nil
        }
    }

    func tick() {
        refreshFront()
        guard let target = tracked else { return }
        var result = snapshot(target)
        result["kind"] = "window"
        guard let data = try? JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), let key = String(data: data, encoding: .utf8) else { return }
        if key != previous { emit(result); previous = key }
    }
}

struct Options {
    let mode: String
    let primary: Bool
    let excluded: pid_t
}

func parseOptions(_ args: [String]) -> Options? {
    guard let mode = args.first, ["activity", "sample", "tracker", "--self-test"].contains(mode) else { return nil }
    var primary = false, excluded: pid_t = 0, index = 1
    while index < args.count {
        if args[index] == "--primary", mode == "sample" || mode == "activity" { primary = true; index += 1 }
        else if args[index] == "--exclude-process", index + 1 < args.count, let pid = Int32(args[index + 1]), pid >= 0 {
            excluded = pid; index += 2
        } else { return nil }
    }
    if mode == "--self-test" && args.count != 1 { return nil }
    return Options(mode: mode, primary: primary, excluded: excluded)
}

func selfTest() {
    // Deterministic checks: no screens, AX calls, TCC requests, or screenshot APIs.
    precondition(appKind(name: "Visual Studio Code", bundle: "") == "code")
    precondition(appKind(name: "Safari", bundle: "com.apple.Safari") == "browser")
    precondition(appKind(name: "unknown private app", bundle: "") == "other")
    precondition(appKind(name: "Slay the Spire 2", bundle: "") == "sts2")
    precondition(foregroundKind("terminal") == "other" && foregroundKind("music") == "media")
    precondition(captureOverlay(name: "Screenshot", bundle: "com.apple.screencaptureui"))
    precondition(sensitiveWindow(name: "1Password", bundle: "", title: "Vault"))
    precondition(sensitiveWindow(name: "Safari", bundle: "", title: "Private Browsing"))
    precondition(sensitiveWindow(name: "Chrome", bundle: "", title: "银行"))
    precondition(sensitiveWindow(name: "Code", bundle: "", title: nil))
    precondition(!sensitiveWindow(name: "Code", bundle: "", title: "README.md"))
    precondition(topLeftScreenRect(CGRect(x: 0, y: 0, width: 1440, height: 900), primaryTop: 900) == CGRect(x: 0, y: 0, width: 1440, height: 900))
    precondition(topLeftScreenRect(CGRect(x: -1280, y: 900, width: 1280, height: 800), primaryTop: 900) == CGRect(x: -1280, y: -800, width: 1280, height: 800))
    precondition(nearlyEqual(CGRect(x: 50, y: 100, width: 900, height: 600), CGRect(x: 51, y: 99, width: 900, height: 600)))
    precondition(parseCommand("select 17") == .select(17))
    precondition(parseCommand("track 12 123") == .track(12, 123))
    precondition(parseCommand("clear") == .clear)
    precondition(parseCommand("track -1 3") == nil && parseCommand("select 0") == nil && parseCommand("clear extra") == nil)
    precondition(parseOptions(["sample", "--primary", "--exclude-process", "42"])?.excluded == 42)
    precondition(parseOptions(["tracker", "--primary"]) == nil && parseOptions(["sample", "--exclude-process", "no"]) == nil)
    emit(["ok": true, "checks": 20, "coordinateSpace": "dip"])
}

guard let options = parseOptions(Array(CommandLine.arguments.dropFirst())) else {
    emit(["available": false, "error": "invalid-arguments"])
    exit(64)
}
if options.mode == "--self-test" { selfTest(); exit(0) }

// AppKit/AX access stays on the main run loop. The stdin thread only transfers strings.
_ = NSApplication.shared
NSApplication.shared.setActivationPolicy(.prohibited)
AXUIElementSetMessagingTimeout(AXUIElementCreateSystemWide(), 0.2)
switch options.mode {
case "sample":
    emit(sample(primary: options.primary, excluded: options.excluded))
case "activity":
    emit(sample(primary: options.primary, excluded: options.excluded))
    let timer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { _ in emit(sample(primary: options.primary, excluded: options.excluded)) }
    RunLoop.main.add(timer, forMode: .common)
    RunLoop.main.run()
case "tracker":
    let tracker = WindowTracker(excluded: options.excluded)
    tracker.refreshFront()
    emit(["kind": "ready"])
    let timer = Timer.scheduledTimer(withTimeInterval: 0.15, repeats: true) { _ in tracker.tick() }
    RunLoop.main.add(timer, forMode: .common)
    Thread.detachNewThread {
        while let line = readLine() { DispatchQueue.main.async { tracker.handle(line) } }
        DispatchQueue.main.async { exit(0) }
    }
    RunLoop.main.run()
default: break
}
