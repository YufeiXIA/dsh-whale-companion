<div align="center">

<img src="app/dsh-game-companion/public/art/portrait.png" width="200" alt="大肥鱼">

# 大肥鱼 · 桌面陪伴与游戏搭子

**dsh-whale-companion**：一条会聊天、记得你、偶尔陪你打《杀戮尖塔 2》的鲸鱼娘。<br>基于 [luweiyabo/dsh-whale-pet](https://github.com/luweiyabo/dsh-whale-pet) 的二次创作，面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。

[English](README_EN.md) · [与原版的区别](#与原版的区别) · [功能](#功能一览) · [安装](#安装桌面陪伴) · [隐私](#隐私与安全) · [许可](#许可与署名)

</div>

> [!IMPORTANT]
> 本项目是**非商业**的社区二创。角色形象与动画素材**禁止商用**，详见[许可与署名](#许可与署名)。项目与 DeepSeek 官方、Mega Crit（《杀戮尖塔》开发商）均无隶属关系。

## 来源

本项目起源于 **[luweiyabo/dsh-whale-pet](https://github.com/luweiyabo/dsh-whale-pet)**：一个住在 DeepSeek Harness 网页里的鲸鱼娘桌宠插件，带有 95 个透明动画、Agent 状态感知、点击拖拽和屏幕漫游。原版的动画素材大多来自 **[PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)**。

角色「大肥鱼」是社区二创的 DeepSeek 鲸鱼娘，不是 DeepSeek 官方形象。原型「溟月」出自 B 站 [@上善无形](https://space.bilibili.com/4456176)，女仆鲸鱼娘版设计出自 B 站 [@ZipZipPipe](https://space.bilibili.com/4168597)，以 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans) 授权。

谢谢以上每一位作者。没有他们，就没有这条鱼。

## 与原版的区别

本项目**不是原版代码的 fork**。它是另写的一个 DSH 插件，加上一个 Electron 桌面窗口。运行时会复用原版插件提供的 95 个动画，所以需要同时安装原版插件。

| | 原版 dsh-whale-pet | 本项目 |
|---|---|---|
| 住在哪里 | DSH 网页界面里的浮动宠物 | 独立的透明桌面窗口，置顶、可点透，不用开浏览器 |
| 她是什么 | 根据 Agent 的工作状态切换动作的桌宠 | 有自己 DSH 会话、人设和记忆的聊天伙伴 |
| 动画 | 95 个 | 原版 95 个 + 新增 69 个（游戏情绪、傲娇和慢半拍等性格小剧场） |
| 互动 | 点击、拖拽、漫游、自定义动作和触发规则 | 聊天、喂饭、摸头、拖拽甩飞、贴边、爬窗口、任务栏散步等（见下） |
| 桌面感知 | 只看 DSH 会话活动 | 可选的低频陪伴：只看「在用哪类程序」，以及征得同意后的偶尔瞄一眼屏幕 |
| 游戏 | 无 | 实验性：作为 AI 队友加入《杀戮尖塔 2》本地合作局 |
| 原版有、本项目没有 | — | 自定义动作上传、触发规则编辑器、余额气泡、英文界面、npm 一键安装 |

## 功能一览

### 聊天伙伴

- **有性格的大肥鱼**：慢半拍、天然呆、有点嘴硬，说话像朋友随口一句，不像客服。人设见 `app/dsh-game-companion/persona/companion.md`。
- **会记事**：跨对话记住你明确说过的偏好；面板里能逐条「忘掉」。
- **多段对话**：新建、切换、重命名、删除、导出为 Markdown。
- **头像会换表情**：吃饭、思考、犯困、鼓嘴四种。
- **偶尔找你聊聊**（可关）：按你选的节奏（2～60 分钟）在合适的时候搭一句话。她只知道你在用哪一类程序（写代码、浏览器、文档、游戏……），不读窗口标题和内容。两次没回应就安静陪着。

### 桌面上的小动作

- 164 个动作可搜索、收藏、悬停预览；自由跑动时会四处走、偶尔追鼠标。
- **喂一口🍚**：说好只吃一口，第三口开始就「被抓到偷吃」了。
- **摸头**：鼠标在她头上来回蹭几下，会害羞或偷偷开心。
- **拖拽甩飞**：带惯性和回弹。拖到屏幕边会扒住边缘，可选藏起一半，鼠标靠近再探出来。
- **沿着任务栏散步**：开启后只在屏幕底边溜达。
- **爬到窗口上**：坐到你刚用过的窗口顶上；那个窗口被挪动或最小化，她会掉下来，弹一下落在任务栏上。
- **别的程序全屏时自己躲起来**：看视频、打游戏时不挡画面，退出全屏再回来。
- **专注 25 分钟 / 免打扰 1 小时**：期间不主动说话，专注结束会给你加油。
- **小提醒**（可分别关闭）：坐够 50 分钟提醒起来动动、大约每小时提醒喝水、凌晨 1 点后催睡一次。离开电脑超过 5 分钟就重新计时，全屏时不打扰。
- 系统托盘菜单：打开聊天、藏起来、专注、免打扰、一小时内别看屏幕、开机自启等。

### 《杀戮尖塔 2》AI 队友（实验性）

通过修改过的 [STS2MCP](https://github.com/Gennadiyev/STS2MCP) 桥接模组，配合 [LanSpire](https://github.com/Madlezz/LanSpire) 本地联机，让大肥鱼控制合作局里的一个席位。她能读局面、做回合计划、给出只读的出牌参考、记录对局复盘。打牌时可以边聊边打，随时暂停。

这一部分**仍在验证中**：自动脚本能走通若干房间，但没有证明能提高胜率，也还没做完整的真人合作验收。配置较复杂，见 [`sts2-bridge/README.md`](sts2-bridge/README.md)。

## 隐私与安全

- **全部在本机**：服务只监听 `127.0.0.1`。聊天和识图会发给你在 DSH 里配置的模型服务（默认 DeepSeek 官方 API），此外不连接任何本项目的服务器。
- **本机接口有门禁**：插件每次启动生成随机会话令牌，只有桌面窗口能读到。所有 `/game-companion/*` 请求都要带这个 HttpOnly cookie，并检查 Host 和 Origin。浏览器里的其他网页拿不到你的聊天，也控制不了她。
- **看屏幕默认关闭**：打开时会先弹窗说明，征得同意才开启。每次截图前后都会核对窗口没有变化；截图只在内存里，看完就丢，不写硬盘。截图时她头边会亮起「👀 瞄了一眼屏幕」。
- **敏感窗口不看**：密码管理器（1Password、KeePass、Bitwarden 等），以及标题含隐身、无痕、密码、银行、支付宝、PayPal、钱包等字样的窗口，一律不截图。窗口标题只在本机用来做这个判断，不会上传或保存。
- **一小时内别看**：面板和托盘菜单都能一键暂停看屏幕。
- 窗口位置、全屏状态只在本机用于贴边、爬窗口和自动躲起来，不发给模型。

细节与漏洞报告方式见 [SECURITY.md](SECURITY.md)。

## 安装（桌面陪伴）

### 你需要

- Windows 10 / 11
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Desktop：作者在 0.2.0-rc.2 上测试；需要在 DSH 里配好一个模型服务，例如 DeepSeek 官方 API
- 原版插件 [@luweiyabo/dsh-whale-pet](https://github.com/luweiyabo/dsh-whale-pet)，用于提供动画
- [PowerShell 7](https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows)
- [Electron 44.0.0](https://github.com/electron/electron/releases/tag/v44.0.0) Windows x64 便携包（`electron-v44.0.0-win32-x64.zip`），解压到 `tools/electron44/`

### 步骤

1. **配置路径**：把 `companion.config.example.json` 复制为 `companion.config.json`，填好下面几项：

   | 字段 | 说明 |
   |---|---|
   | `dshExe` | `DeepSeek Harness.exe` 的完整路径 |
   | `dshHome` | DSH 数据目录 |
   | `port` | 搭子宿主端口，默认 `19388` |
   | `whalePetPlugin` | 若已在别的 profile 装过原版插件，填它的目录即可复用；留空则按第 3 步安装 |
   | `llmProviderProfile` / `llmProviderId` | 可选：从已有 profile 复制一个模型服务配置 |
   | `electronExe` | 默认 `tools/electron44/electron.exe` |
   | `pwshExe` | PowerShell 7 路径，「开机时叫醒她」会用到 |
   | `voiceAdapterRoot` | 语音适配器，见下方「语音」；不用就留空 |
   | `sts2Game` | 只有玩《杀戮尖塔 2》时需要 |

   路径可以写 `%USERPROFILE%` 这类环境变量；相对路径按项目根目录算。

2. **建一个独立的 DSH profile**：搭子用独立的 `companion-test` profile，不碰你平时用的 profile。

   ```powershell
   pwsh .\tools\start-companion-profile.ps1   # 第一次运行，让 DSH 建好 profile，然后关掉这个宿主进程
   pwsh .\tools\prepare-companion-profile.ps1 # 挂上本插件，生成本机桥接令牌
   ```

   > 第 2 步的「先启动一次再关掉」是作者环境里的做法，在全新机器上还没完整走过。遇到问题欢迎开 issue。

3. **安装原版插件**（`whalePetPlugin` 留空时）：

   ```powershell
   dsh plugin --profile companion-test add @luweiyabo/dsh-whale-pet
   ```

4. **叫醒她**：

   ```powershell
   pwsh .\tools\start-whale-companion.ps1 -DesktopOnly
   ```

   脚本会按需启动宿主，再打开桌面窗口。可以给这条命令建个桌面快捷方式。不带 `-DesktopOnly` 会同时启动两个游戏席位，只在配好《杀戮尖塔 2》后使用。

### 常用操作

| 操作 | 效果 |
|---|---|
| 左键点她 | 打开聊天 |
| 拖动 / 甩出去 | 挪窝 / 惯性滑行 |
| 右键点她 | 选一个桌面位置让她跑过去 |
| `Ctrl+Alt+Space` | 切换鼠标点透 |
| `Ctrl+Alt+Enter` | 聚焦聊天输入框 |
| `Esc` | 释放键鼠 |
| 托盘图标 | 打开聊天、藏起来、专注、免打扰、爬窗口、散步、开机自启、退出 |

### 语音

作者本机的语音接的是另一个私人桌宠项目里的通义千问 TTS 适配器。公开版**默认没有语音**，只显示文字，不影响其他功能。想接自己的 TTS，可以改 `app/dsh-game-companion/src/voice.js` 里的 `loadCompanionVoice`，或者把 `voiceAdapterRoot` 指向结构相同的适配器。

## 开发与测试

```powershell
cd app\dsh-game-companion; node --test   # 插件：路由门禁、记忆、调度、面板等
cd app\companion-overlay; node --test    # 桌面窗口：贴边、散步、爬窗口、提醒、截图等
```

如果在 `companion.config.json` 里填了 `whalePetPlugin`，动画测试还会核对原版插件的 95 个动画文件都在。

目录结构：

```text
app/dsh-game-companion/   DSH 插件：会话、人设、记忆、游戏工具、面板（public/index.html）
app/companion-overlay/    Electron 桌面窗口：置顶、拖拽、托盘、桌面小动作
tools/                    启动与配置脚本（PowerShell 7），活动采样脚本（Windows PowerShell 5.1）
sts2-bridge/              STS2MCP 的搭子补丁与说明（实验性）
```

## 许可与署名

这是**混合授权**的项目：

- **原创代码**：[MIT](LICENSE)。
- **角色形象「大肥鱼」**，包括本项目里的头像、表情差分和图标：[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans)，即署名、非商业、相同方式共享。
- **动画**：原版插件的 95 个动画来自 PC2005-cloud/dsh-pet 与 luweiyabo/dsh-whale-pet，本项目新增的 69 个以原版角色为参考生成。它们都**允许开源使用，禁止商用**。
- **字体**：站酷庆科黄油体、霞鹜文楷的子集，SIL Open Font License 1.1。

逐项来源见 [THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md)。按 PC2005-cloud/dsh-pet 的二创约定，在此注明原作者地址：<https://github.com/PC2005-cloud/dsh-pet>。

MIT 授权**只覆盖代码**。素材不能随代码一起拿去商用；如需商用，请先联系对应权利人取得授权。
