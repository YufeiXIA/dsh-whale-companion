# dsh-whale-companion

A whale-maid who lives on your desktop, chats with you, remembers what you tell her, and can join you in *Slay the Spire 2* co-op. She runs on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). Full docs are in Chinese: [README.md](README.md).

<table>
<tr>
<td align="center"><img src="docs/media/chat.gif" width="260" alt="She greets you, then gets caught snacking"><br>Greeting, caught snacking</td>
<td align="center"><img src="docs/media/edge-peek.gif" width="260" alt="Docked on the right edge, peeking in"><br>Peeking from the screen edge</td>
<td align="center"><img src="docs/media/sts2-companion.gif" width="260" alt="Planning a card, raising a shield, a smug win"><br><i>Slay the Spire 2</i> teammate</td>
</tr>
<tr>
<td align="center"><img src="docs/media/panel-chat.png" width="240" alt="Chat panel"><br>Chat panel</td>
<td align="center"><img src="docs/media/panel-settings.png" width="240" alt="Companion settings"><br>Check-in rhythm and screen toggle</td>
<td align="center"><img src="docs/media/sts2-chat.png" width="240" alt="Chatting during a fight"><br>Talking through a fight</td>
</tr>
</table>

The UI is in Chinese. These were recorded with sample chats, not real history or a real match.

> Non-commercial fan work. The character and animations can't be used commercially. Not affiliated with DeepSeek or Mega Crit.

## Credits

Based on [luweiyabo/dsh-whale-pet](https://github.com/luweiyabo/dsh-whale-pet), whose animations mostly come from [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet). The character 大肥鱼 is a fan design: the original "Mingyue" is by bilibili [@上善无形](https://space.bilibili.com/4456176), and the maid version is by bilibili [@ZipZipPipe](https://space.bilibili.com/4168597), under CC BY-NC-SA 4.0.

## What's different

The code is new, not a fork. It still uses the original plugin's 95 animations, so you need that plugin too. On top of that:

- She lives in her own transparent desktop window, not the DSH web page.
- She has a persona and memory, and you can keep several chats.
- 69 new animations.
- Desktop tricks: feeding, head pats, flinging, edge snapping and peeking in from the screen edge, walking along the taskbar, sitting on top of windows, hiding when another app goes fullscreen, focus timers, and stretch, water and bedtime reminders.
- Optional: she can check in using your app category, recent conversation and an opt-in glimpse of the visible top window on the primary monitor. A secondary-monitor focus never changes the screenshot target. Proactive messages can use a short paragraph, up to 240 characters.
- Reading or watching videos without keyboard or mouse activity does not mute proactive company. Each unanswered greeting adds five minutes to the selected interval; replying clears the extra delay. She can revisit the same app with a new topic.
- Experimental *Slay the Spire 2* teammate.

When docked, she stays half-hidden during greetings, replies, clicks and typing. Speech bubbles open diagonally toward the inside of the screen, with the input bar beside the edge. Drag her out to undock. This update also keeps the previous animation visible until its replacement starts, cancels pending screen glances when paused, and refines the title font and header position. See [release notes (Chinese)](docs/fixed-half-dock.md).

## Setup

You need Windows 10/11, DSH Desktop (tested on 0.2.0-rc.2), PowerShell 7, and Electron 44.0.0 unpacked into `tools/electron44/`.

1. Copy `companion.config.example.json` to `companion.config.json` and fill in your paths.
2. Run `pwsh tools/start-companion-profile.ps1` once, close it, then run `pwsh tools/prepare-companion-profile.ps1`.
3. Install the original plugin: `dsh plugin --profile companion-test add @luweiyabo/dsh-whale-pet`.
4. Start her: `pwsh tools/start-whale-companion.ps1 -DesktopOnly`.

There's no voice in the public build.

## License

Code is [MIT](LICENSE). The character art is CC BY-NC-SA 4.0. The animations are fine for open-source use but not for commercial use, and derivatives must link <https://github.com/PC2005-cloud/dsh-pet>. Fonts are OFL 1.1. Details: [THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md).
