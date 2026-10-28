# 大肥鱼 · 轻便版

不用装 DSH，没有游戏功能。装好、填个模型 Key 就能聊。和完整版的区别见[两个版本](../README.md#两个版本)。

## 下载

Windows 稳定版在 [0.2.0 发布页](https://github.com/YufeiXIA/dsh-whale-companion/releases/tag/v0.2.0)里挑一个（[最新稳定版](https://github.com/YufeiXIA/dsh-whale-companion/releases/latest)）：

- `WhaleCompanion-Lite-0.2.0-Setup.exe`：Windows x64 安装版，会建桌面快捷方式。
- `WhaleCompanion-Lite-0.2.0-Portable.zip`：Windows x64 免安装版，解压后双击 `WhaleCompanion.exe`。
- `SHA256SUMS.txt`：发布文件的 SHA-256 校验值。

没有代码签名，Windows 可能提示「未知发布者」，点「更多信息 → 仍要运行」。

更新前退出旧版本，保留原数据目录；免安装版解压到新文件夹再启动。启动异常时可先检查是否完整解压、安装目录是否可读，并在 issue 中提供脱敏后的报错。不要上传 Key、`secrets.json` 或私人聊天记录。

Windows 完整更新见 [0.2.0 说明](../docs/release-0.2.0.md)。

### Apple Silicon Mac 预发布

[Mac 0.3.0-macos.1 发布页](https://github.com/YufeiXIA/dsh-whale-companion/releases/tag/v0.3.0-macos.1)，适用 **macOS 13+、Apple Silicon（M 系列）**；没有 Intel 构建。Mac 预发布与 Windows 稳定版分别发布。

| 文件 | 用途 |
|---|---|
| `WhaleCompanion-Lite-0.3.0-macos.1-macOS-arm64.dmg` | 打开后把「大肥鱼.app」拖进「应用程序」 |
| `WhaleCompanion-Lite-0.3.0-macos.1-macOS-arm64.zip` | 解压后把同一个应用移到「应用程序」 |
| `SHA256SUMS-macOS-arm64.txt` | Mac 发布文件的 SHA-256 校验值 |
| `Mac-build-validation.json` | 构建与自动化检查结果；不代表真实用户完整验收 |

先退出旧版，再将应用放到 `/Applications` 后打开，不要长期从 DMG 里运行。此预发布使用 ad-hoc 签名，没有 Apple Developer ID 签名和公证。若首次打开被拦截，先尝试打开一次，再到「系统设置 → 隐私与安全性 → 仍要打开」对这个应用确认，步骤见 [Apple 官方说明](https://support.apple.com/102445)。

启动后在菜单栏鲸鱼图标里打开聊天、设置或退出。基础聊天不需要屏幕录制或辅助功能权限；想启用自动看屏，再授予屏幕录制；想让她爬窗口，再授予辅助功能。应用内的权限入口可以打开对应系统设置；授权后按系统提示退出并重开。详细步骤、功能对照和验收范围见 [Mac 安装与权限](../docs/macos-port.md)及 [Mac 更新说明](../docs/release-0.3.0-macos.1.md)。

## 第一次打开

设置页会自己弹出来：

1. 选服务商：DeepSeek、通义千问、Kimi、智谱、OpenAI，或者「其他」（任何兼容 OpenAI 接口的服务）。
2. 粘贴 API Key，点「测试一下」。
3. 提示模型不对，就点「获取模型列表」挑一个。

以后想改，点聊天面板上的「设置」，或者在托盘（Mac 为菜单栏）图标里选「模型与语音设置」。

- **语音**（可选）：填阿里百炼的 API Key 她就能出声，再点面板上的喇叭打开。她会按聊的内容换语气。默认模型和音色是作者自己在用的；测试提示模型或音色不对，就换成你在百炼控制台开通的。
- 轻便版在线语音使用设置页中的阿里百炼 Qwen 模型与音色，不提供完整版的 Fish PCM 流式聊天或 Momo 声线选择。本地互动短语音不需要在线语音 Key。
- **看图**（可选）：默认用聊天模型。聊天模型看不了图，就单独填一个能看图的。看屏幕这个功能本身默认关着，要在「陪伴」里打开。

## 有什么

和完整版一样：聊天、记住你的偏好、多段对话、主动搭话、留意后台程序、看屏幕、喂饭摸头、贴边偷看、爬窗口、专注和免打扰、喝水久坐提醒。

- 靠近她会出现快捷聊天；点鲸鱼按钮或托盘「打开聊天」进入面板。左键点身体触发部位互动，并可播放本地短语音。
- 聊天原文在本机保留，每轮按关键词提供当前及其他未删除对话中的相关摘录。轻便版没有完整版的历史分页读取工具，也没有内置联网搜索工具；关键词匹配仍可能漏掉含蓄指代。
- 主动陪伴按固定周期检查，默认 5 分钟，可设 1～60 分钟或关闭；不因未回复而逐次延长。输入、忙碌、免打扰、锁屏和睡眠期间会暂缓。
- 选择或粘贴图片后可预览发送；自动看屏需另行开启，只取主屏最上层窗口的可见区域。
- 动作会结合聊天含义选择；实际输入优先处理手动聊天，停止主动语音。发送、关闭语音或切换对话可停止播放。
- 窗口停靠会跟随目标移动和缩放；目标关闭、最小化、隐藏或完全移出屏幕后才会下落。
- 面板「小动作」或托盘可开启睡眠；睡眠跨重启保留，暂停自动移动、主动搭话、看屏和普通聊天语音。点击或打字不会自动叫醒，手动选择「叫醒小鲸」恢复原设置。

没有：《杀戮尖塔 2》《星露谷物语》和其他游戏控制功能，也不调用 DSH 的工具。

## 数据存在哪

Windows 在 `%APPDATA%\大肥鱼\`，Mac 在 `~/Library/Application Support/大肥鱼/`：

- `secrets.json`：API Key，通过 Electron `safeStorage` 加密；Windows 使用账户凭据，Mac 使用系统 Keychain，面板里只显示末 4 位。
- `state.json`：设置、聊天记录、她记住的事。

Mac 可能弹出钥匙串访问提示。此预发布只有 ad-hoc 签名，更新后可能再次请求钥匙串权限；当前检查不保证不同构建间凭据始终可读。先保留数据目录；不要把 Windows 的加密 `secrets.json` 当作可直接搬到 Mac 的 Key 备份，应在新系统重新输入自己的 Key。说明见 [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)。

原始图片只在内存里处理，文字观察摘要可随聊天保存。删除对话与删除独立偏好是两件事；「忘记」用于排除模型回忆，不等于擦除磁盘原文。详细数据流与拦截边界见 [SECURITY.md](../SECURITY.md)。

卸载后想清干净，删掉这个文件夹。聊天、语音、看图只发给你填的那几个服务。

## 自己打包

Windows 构建需要 Node 22+ 和 Electron 44 的 Windows x64 解压目录。

```bash
cd lite && npm install && npm test && npm run build
```

- `ELECTRON_DIST`：Electron 44 解压目录，默认 `tools/electron44`。
- `WHALE_PET_SOURCE`：解压好的原版插件目录；不填就用 `npm pack` 下载 `@luweiyabo/dsh-whale-pet@0.1.3`。

安装包和压缩包在 `outputs/lite-dist/`。

Mac 构建在 macOS 上执行，使用对应的 Electron arm64 和 Swift/Xcode 工具链；GitHub Actions 目标为 `macos-15` arm64。具体命令和输出以 [Mac 构建说明](../docs/macos-port.md#从源码构建)为准，Windows 构建命令不能直接生成 Mac 原生辅助程序。

## 素材

95 个原版动画来自 [luweiyabo/dsh-whale-pet](https://github.com/luweiyabo/dsh-whale-pet)，大多出自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)；另外 69 个是新做的，睡眠专用循环由既有动作裁剪而来。角色按 CC BY-NC-SA 4.0 授权，角色和动画不能商用。本地互动与试听语音为模型合成音频，需分别遵循服务和音色条款。安装包里的 `lite/pet/` 附了原版插件的许可和素材说明，其余见 [THIRD_PARTY_ASSETS.md](../THIRD_PARTY_ASSETS.md)。
