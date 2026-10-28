using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

// Local window geometry only. No titles, process names, screenshots or model calls.
public static class WhaleWindowTracker {
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
    delegate bool EnumWindowProc(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowProc callback, IntPtr parameter);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out RECT rectangle);
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr window, StringBuilder name, int length);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out int value, int size);
    [DllImport("dwmapi.dll", EntryPoint="DwmGetWindowAttribute")] static extern int GetFrame(IntPtr window, int attribute, out RECT value, int size);
    static int excludedProcess;

    static bool Eligible(IntPtr window) {
        if (window == IntPtr.Zero || !IsWindowVisible(window) || IsIconic(window)) return false;
        uint process; GetWindowThreadProcessId(window, out process);
        if (process == excludedProcess) return false;
        int cloaked;
        if (DwmGetWindowAttribute(window, 14, out cloaked, 4) == 0 && cloaked != 0) return false;
        var name = new StringBuilder(128); GetClassName(window, name, 128);
        switch (name.ToString()) {
            case "Shell_TrayWnd": case "Shell_SecondaryTrayWnd": case "NotifyIconOverflowWindow":
            case "TopLevelWindowForOverflowXamlIsland": case "XamlExplorerHostIslandWindow":
            case "Progman": case "WorkerW": case "tooltips_class32": case "#32768": return false;
        }
        RECT rect;
        return GetWindowRect(window, out rect) && rect.Right - rect.Left >= 100 && rect.Bottom - rect.Top >= 80;
    }

    static IntPtr Select(IntPtr lastExternal) {
        var foreground = GetForegroundWindow();
        if (Eligible(foreground)) return foreground;
        // Opening the pet menu temporarily foregrounds our overlay or the tray.
        // Retain the last actual foreground window, then validate it again now.
        if (Eligible(lastExternal)) return lastExternal;
        IntPtr selected = IntPtr.Zero;
        EnumWindows((window, unused) => { if (!Eligible(window)) return true; selected = window; return false; }, IntPtr.Zero);
        return selected;
    }

    static string Snapshot(IntPtr window, uint expectedProcess) {
        uint process; GetWindowThreadProcessId(window, out process);
        string identity = "\"windowId\":\"" + window.ToInt64() + "\",\"processId\":" + process;
        if (window == IntPtr.Zero || !IsWindow(window) || (expectedProcess != 0 && expectedProcess != process)) return identity + ",\"status\":\"closed\"";
        if (IsIconic(window)) return identity + ",\"status\":\"minimized\"";
        if (!IsWindowVisible(window)) return identity + ",\"status\":\"hidden\"";
        int cloaked;
        if (DwmGetWindowAttribute(window, 14, out cloaked, 4) == 0 && cloaked != 0) return identity + ",\"status\":\"hidden\"";
        RECT rect;
        if (GetFrame(window, 9, out rect, Marshal.SizeOf(typeof(RECT))) != 0 && !GetWindowRect(window, out rect))
            return identity + ",\"status\":\"unavailable\"";
        return identity + ",\"status\":\"visible\",\"rect\":{\"x\":" + rect.Left + ",\"y\":" + rect.Top +
            ",\"width\":" + (rect.Right - rect.Left) + ",\"height\":" + (rect.Bottom - rect.Top) + "}";
    }

    public static void Run(int excludeProcessId) {
        excludedProcess = excludeProcessId;
        SetProcessDpiAwarenessContext(new IntPtr(-4));
        IntPtr lastExternal = IntPtr.Zero, tracked = IntPtr.Zero;
        uint trackedProcess = 0;
        string previous = null;
        // Console.In.ReadLineAsync can block synchronously on .NET Framework.
        var input = new ConcurrentQueue<string>();
        var reader = new Thread(() => { while (true) { var line = Console.ReadLine(); input.Enqueue(line); if (line == null) return; } });
        reader.IsBackground = true; reader.Start();
        Console.WriteLine("{\"kind\":\"ready\"}");
        while (true) {
            var foreground = GetForegroundWindow();
            if (Eligible(foreground)) lastExternal = foreground;
            string command;
            while (input.TryDequeue(out command)) {
                if (command == null) return;
                var parts = command.Split(' ');
                long requestId, handle; uint process;
                if (parts.Length == 2 && parts[0] == "select" && long.TryParse(parts[1], out requestId)) {
                    var selected = Select(lastExternal);
                    Console.WriteLine("{\"kind\":\"selected\",\"requestId\":" + requestId + "," + Snapshot(selected, 0) + "}");
                } else if (parts.Length == 3 && parts[0] == "track" && long.TryParse(parts[1], out handle) && uint.TryParse(parts[2], out process)) {
                    tracked = new IntPtr(handle); trackedProcess = process; previous = null;
                } else if (command == "clear") { tracked = IntPtr.Zero; previous = null; }
            }
            if (tracked != IntPtr.Zero) {
                var snapshot = Snapshot(tracked, trackedProcess);
                if (snapshot != previous) {
                    Console.WriteLine("{\"kind\":\"window\"," + snapshot + "}"); previous = snapshot;
                }
            }
            Thread.Sleep(32);
        }
    }
}
