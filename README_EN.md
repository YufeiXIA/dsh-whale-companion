# dsh-whale-companion

A chatty whale-maid desktop companion for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), and an experimental AI teammate for *Slay the Spire 2* co-op. The full documentation is in Chinese: [README.md](README.md).

> **Non-commercial fan work.** The character and animation assets may not be used commercially. Not affiliated with DeepSeek or Mega Crit.

## Origin

This project grew out of **[luweiyabo/dsh-whale-pet](https://github.com/luweiyabo/dsh-whale-pet)**, a whale pet that lives in the DSH web UI. Most of its animations come from **[PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)**. The character, "Da Fei Yu" (大肥鱼), is a community fan design: the original "Mingyue" is by bilibili [@上善无形](https://space.bilibili.com/4456176), and the maid version is by bilibili [@ZipZipPipe](https://space.bilibili.com/4168597). The character is licensed under CC BY-NC-SA 4.0.

## How it differs from the original

This is not a fork of the original code. It is a separate DSH plugin plus an Electron desktop window, and it uses the original plugin's 95 animations at runtime, so install both.

- She lives in a transparent, always-on-top desktop window instead of the web page.
- She has her own DSH session, persona and memory: you can chat, keep several conversations, and make her forget things.
- 69 new animations (game emotions, personality skits), for 164 in total.
- Desktop behaviours: feeding, head pats, fling with inertia, edge snapping and peeking, strolling along the taskbar, perching on windows (and falling off when they move), hiding while another app is fullscreen, focus and do-not-disturb timers, and water, stretch and late-night reminders.
- Optional ambient chat, which only sees the coarse app category. There is also an optional, consent-gated screen glance: frames stay in memory, and sensitive windows are always skipped.
- Experimental *Slay the Spire 2* teammate via a patched [STS2MCP](https://github.com/Gennadiyev/STS2MCP) and [LanSpire](https://github.com/Madlezz/LanSpire).
- Not included from the original: custom action uploads, the trigger rule editor, the balance bubble, an English UI, and npm install.

## Privacy

Everything runs on 127.0.0.1. Plugin routes require a per-start session cookie that only the desktop window can read, plus Host and Origin checks. Screen capture is off by default; see [SECURITY.md](SECURITY.md).

## Quick start

Windows 10/11, DeepSeek Harness Desktop (tested on 0.2.0-rc.2), PowerShell 7, and Electron 44.0.0 unpacked into `tools/electron44/`.

1. Copy `companion.config.example.json` to `companion.config.json` and fill in the paths.
2. Create the profile: run `pwsh tools/start-companion-profile.ps1` once and close it, then run `pwsh tools/prepare-companion-profile.ps1`.
3. Install the original plugin: `dsh plugin --profile companion-test add @luweiyabo/dsh-whale-pet`.
4. Start her: `pwsh tools/start-whale-companion.ps1 -DesktopOnly`.

Voice is not available out of the box; the author's TTS adapter is private.

## License

Mixed licensing:

- Original code: [MIT](LICENSE).
- Character art, including the derived portrait, expressions and icons: CC BY-NC-SA 4.0.
- Animations: open-source use only, no commercial use. Derivative works must link to <https://github.com/PC2005-cloud/dsh-pet>.
- Fonts: OFL 1.1.

See [THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md).
