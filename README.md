<div align="center">

<img src="app/dsh-game-companion/public/art/portrait.png" width="200" alt="大肥鱼">

# 大肥鱼 · 桌面陪伴与游戏搭子

住在桌面上的鲸鱼娘，能聊天、记得你说过的话，还能陪你打《杀戮尖塔 2》。<br>改编自 [luweiyabo/dsh-whale-pet](https://github.com/luweiyabo/dsh-whale-pet)，跑在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）上。

[English](README_EN.md)

[下载 Windows 0.2.0](https://github.com/YufeiXIA/dsh-whale-companion/releases/tag/v0.2.0) · [最新版本](https://github.com/YufeiXIA/dsh-whale-companion/releases/latest) · [更新说明](docs/release-0.2.0.md) · [macOS 移植计划](docs/macos-port.md)

<table>
<tr>
<td align="center"><img src="docs/media/chat.gif" width="260" alt="她冒出来打招呼，又被抓到偷吃"><br>打招呼、偷吃被抓</td>
<td align="center"><img src="docs/media/edge-peek.gif" width="260" alt="贴在屏幕右边，露半个身子往里看"><br>贴在屏幕边偷看</td>
<td align="center"><img src="docs/media/sts2-companion.gif" width="260" alt="打牌时出主意、举盾、赢了得意"><br>陪你打《杀戮尖塔 2》</td>
</tr>
</table>

</div>

> [!IMPORTANT]
> 这是非商业的同人作品，角色和动画不能商用。和 DeepSeek 官方、Mega Crit（《杀戮尖塔》开发商）都没有关系。

## 两个版本

| | 完整版（本页） | [轻便版](lite/README.md) |
|---|---|---|
| 要装 DSH 吗 | 要，模型和 Key 在 DSH 里配 | 不用，在她的设置页里填 Key |
| 怎么装 | 按下面的「安装」配路径、建 profile | 下载安装包或免安装压缩包，双击就行 |
| 聊天、记忆、多段对话、主动搭话、看屏幕 | 有 | 有 |
| 历史找回 | 相关摘录注入，并可用工具搜索／分页读取 | 相关关键词摘录注入，没有分页读取工具 |
| 联网查资料 | 通过 DSH 的搜索和网页工具 | 无内置联网检索工具 |
| 喂饭摸头、贴边、爬窗口、专注提醒 | 有 | 有 |
| 语音 | Fish Audio 流式聊天语音；其他声线需外部适配器 | 阿里百炼；具体设置见轻便版说明 |
| 《杀戮尖塔 2》队友 | 有（实验性） | 没有 |
| 《星露谷物语》适配 | 实验性接口与模组源码，实际农场行为未验收 | 没有 |
| 发布形式 | 源码包，需自行准备 DSH、Electron 与原版动画插件 | Windows x64 安装包与免安装包 |

只想要桌宠和聊天，选轻便版；想让她陪你打游戏，用完整版。

0.2.0 下载文件：轻便版选 `WhaleCompanion-Lite-0.2.0-Setup.exe` 或 `WhaleCompanion-Lite-0.2.0-Portable.zip`；完整版选 `WhaleCompanion-Full-0.2.0-Source.zip`，按下方步骤配置。发布页提供 `SHA256SUMS.txt`。当前发布仅支持 Windows；macOS 尚未提供安装包。

## 来源

- 起点是 [luweiyabo/dsh-whale-pet](https://github.com/luweiyabo/dsh-whale-pet)：住在 DSH 网页里的鲸鱼娘桌宠，动画大多来自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)。
- 角色「大肥鱼」是同人形象，不是官方的。原型「溟月」出自 B 站 [@上善无形](https://space.bilibili.com/4456176)，女仆版出自 B 站 [@ZipZipPipe](https://space.bilibili.com/4168597)，按 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans) 授权。

谢谢这几位作者。

## 和原版有什么不同

代码是重新写的，不是 fork。动画还是用原版插件里的那 95 个，所以原版插件也要装上。

| | 原版 | 这个项目 |
|---|---|---|
| 在哪儿 | DSH 网页里 | 单独的透明桌面窗口，不用开浏览器 |
| 是什么 | 跟着 Agent 状态换动作的桌宠 | 有自己人设和记忆、能聊天的伙伴 |
| 动画 | 95 个 | 95 个 + 新做的 69 个 |
| 游戏 | 无 | 实验性：《杀戮尖塔 2》合作局的 AI 队友 |

原版的自定义动作上传、触发规则编辑器、余额气泡、英文界面和 npm 一键安装，这里没有。

## 能做什么

聊天：

- 性格慢半拍、有点嘴硬，人设在 `app/dsh-game-companion/persona/companion.md`。
- 明确偏好独立保存；聊天原文在本机归档，并能按关键词从当前及其他未删除对话找回相关片段。找回内容附会话、消息与时间来源；关键词检索仍可能漏掉含蓄指代。
- 可以开多个对话、改标题、导出当前面板里的记录为 Markdown。可以删除对话或管理偏好；聊天中要求「忘记」会排除旧内容的模型回忆，不等同于擦除磁盘原文。
- 主动陪伴默认每 5 分钟检查一次，可设为 1～60 分钟或关闭；不因你没回复而逐次延长。忙碌、输入、免打扰、锁屏或睡眠期间会暂缓，恢复后不连发补齐。
- 她只知道当前程序类别和允许列表中的后台程序类别，如 Steam、聊天或音乐软件；不会把窗口标题当聊天上下文。后台类别有独立开关。看屏幕另需主动开启，只取主屏最上层窗口的可见区域。
- 聊天框的「＋」可以选择图片，也能粘贴截图，预览后发送；手动发图与自动看屏开关分开。更清晰的自动截图和较详细的观察摘要优先关注正文、报错、图表或游戏局面，仍可能识别错误。
- 动作会结合这轮对话的意思选择；语气与动作各自处理，没有合适动作时可不选。开始实际输入会让主动搭话和正在播放的主动语音让路；只聚焦输入框不会一直锁住倾听动作。

靠近她会出现快捷聊天；点鲸鱼按钮或在托盘里选「打开聊天」进入面板。直接点身体是部位互动：

<table>
<tr>
<td align="center"><img src="docs/media/panel-chat.png" width="240" alt="聊天面板"><br>聊天</td>
<td align="center"><img src="docs/media/panel-settings.png" width="240" alt="陪伴设置"><br>陪伴节奏、看屏幕开关</td>
<td align="center"><img src="docs/media/profile-card.png" width="240" alt="人物小卡"><br>点头像翻开小档案</td>
</tr>
</table>

桌面上：

- 喂饭：说好只吃一口，第三口就被抓到偷吃。
- 摸头：鼠标在她头上来回蹭几下。
- 拖着甩出去会滑一段；拖到屏幕左右边会藏起半个身子，托盘里也能一键停靠。主动搭话、点击和打字都保持半身，气泡朝屏内斜上方展开；拖回屏幕才会离开边缘。
- 可以只沿着任务栏走。
- 能爬到当前窗口上，跟随窗口移动和缩放；空间不足时改在窗口可见区域内或附近停留。目标关闭、最小化、隐藏或完全离开屏幕后才会落下。
- 别的程序全屏时自己躲开。
- 专注 25 分钟、免打扰 1 小时，这期间她不说话。
- 阅读或看视频时，即使没有键鼠输入，也能按所选固定周期陪伴。自由跑动、自主乱跑、任务栏散步各有开关；聊天、输入和手动动作可以打断自动移动。
- 睡眠模式持续播放抱尾巴的闭眼睡姿和 Zzz，重启后保留。睡眠暂停自动走动、主动搭话、看屏和普通聊天语音；拖动、点击或打字不会自动叫醒，在面板或托盘里选择「叫醒小鲸」恢复原设置。
- 身体互动使用随包附带的本地短语音，播放时不请求语音服务；聊天合成语音需要配置相应服务。
- 久坐、喝水、凌晨还没睡时提醒你，每种都能单独关。

实机桌面演示：

<table>
<tr>
<td align="center"><img src="docs/media/desktop-perch-real.gif" width="360" alt="爬上演示窗口并停在顶部"><br>爬上窗口</td>
<td align="center"><img src="docs/media/desktop-stroll-real.gif" width="360" alt="沿屏幕底部移动"><br>屏幕底部散步 </td>
</tr>
<tr>
<td align="center"><img src="docs/media/desktop-edge-real.gif" width="360" alt="停靠真实屏幕右边，半身说话"><br>贴边后保持半身说话</td>
<td align="center"><img src="docs/media/desktop-fling-real.gif" width="360" alt="甩出后的滑行与翻滚"><br>滑行、翻滚</td>
</tr>
<tr>
<td align="center"><img src="docs/media/desktop-feed-real.gif" width="360" alt="连续喂饭，第三口被抓到"><br>第三口被抓到</td>
<td align="center"><img src="docs/media/desktop-pat-real.gif" width="360" alt="摸头后的反应"><br>摸摸头</td>
</tr>
</table>


这些是 Windows 原生浮窗的屏幕录制，动作由录制脚本触发，背景使用中性演示窗口。右键指点移动这次未录到完整过程，没有收录。录制说明见 [素材说明](docs/media/README.md)。

游戏：在《杀戮尖塔 2》本地合作局里操控一个角色，当你的队友，边打边聊。还在试验阶段：自动打牌能过几个房间，还没和真人完整打过一局。配置见 [`sts2-bridge/README.md`](sts2-bridge/README.md)。

完整版还附[《星露谷物语》的实验性适配与模组源码](app/dsh-game-companion/STARDEW.md)；接口存在不代表实际农场操作、游戏内气泡或语音已完成实机验收，需另行配置和验证。轻便版不包含游戏控制。

下面是复制版游戏和独立测试存档中的实战：AI 队友打出「上勾拳」，敌人受到伤害并被施加虚弱，桌宠同时说出这一轮的打算。

<img src="docs/media/sts2-battle-real.gif" width="720" alt="测试合作局中，AI 队友实际出牌，桌宠显示对应战术气泡">

<table>
<tr>
<td align="center"><img src="docs/media/sts2-battle-real.png" width="360" alt="测试合作局第二回合的战斗画面"><br>战斗中</td>
<td align="center"><img src="docs/media/sts2-event-real.png" width="360" alt="古代事件结束后的游戏画面与桌宠气泡"><br>古代事件结束后</td>
</tr>
</table>

页首动画和聊天面板使用示范对话；新增实机素材来自隔离测试会话，游戏气泡来自当时的模型回复。没有使用私人聊天记录，录制时主动看屏幕功能保持关闭。

## 隐私

- 程序与聊天存档在本机运行。完整版聊天发给 DSH 配置的模型服务；当前识图实现单独调用官方 DeepSeek API，需要宿主环境中的 `DEEPSEEK_API_KEY`。语音发给你启用的语音服务，联网工具会访问搜索服务与公开网页。
- 只有桌面窗口能调用她的接口，浏览器里的其他网页读不到聊天，也控制不了她。
- 看屏幕默认关，打开前会问你。开启后只看主屏幕最上层可见页面，不跟随副屏焦点。原始图片只在内存中处理，不进入聊天存档。密码管理器及标题中的银行、隐身等敏感标记会触发拦截；这类规则不能保证识别所有敏感画面。截图时她头边会亮「👀」，也能暂停一小时。
- 点击暂停看图会取消仍在处理的看图任务；正在采集的截图也会重新检查开关状态。

细节见 [SECURITY.md](SECURITY.md)。

最近的停靠、输入与动画稳定性修复，以及界面调整，见 [本版说明](docs/fixed-half-dock.md)。
多屏坐标、贴边朝向、长主动搭话与主屏截图范围，见 [多屏与陪伴更新](docs/multi-monitor-context-update.md)。
这些是早期更新记录，当前行为以 [0.2.0 更新说明](docs/release-0.2.0.md) 为准。

## 安装

需要：

- Windows 10/11
- DSH Desktop 0.2.0-rc.2（当前验证目标），先在里面配好一个模型服务。安装中须包含 `@deepseek-ai/dsh-web`、`@deepseek-ai/dsh-web-search-deepseek`、`@deepseek-ai/dsh-web-fetch-http` 和 `@deepseek-ai/dsh-tool-web`；其他 DSH 版本尚未验证
- [PowerShell 7](https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows)
- [Electron 44.0.0](https://github.com/electron/electron/releases/tag/v44.0.0) 的 Windows x64 压缩包，解压到 `tools/electron44/`

步骤：

1. 把 `companion.config.example.json` 复制成 `companion.config.json`，改成你电脑上的路径：

   | 字段 | 填什么 |
   |---|---|
   | `dshExe` | `DeepSeek Harness.exe` 的路径 |
   | `dshHome` | DSH 数据目录 |
   | `whalePetPlugin` | 已经装过的原版插件目录；没有就留空 |
   | `llmProviderProfile`、`llmProviderId` | 想沿用哪个 profile 里的模型服务；不填就自己去 DSH 里配 |
   | `pwshExe` | PowerShell 7 的路径 |
   | `sts2Game` | 《杀戮尖塔 2》目录，不玩就不用管 |

   其余字段保持默认就行。路径里可以用 `%USERPROFILE%` 这类变量。

2. 先运行准备脚本，创建或准备独立的 DSH profile（默认叫 `companion-test`）：

   ```powershell
   pwsh .\tools\prepare-companion-profile.ps1
   ```

   新 profile 的基础与网页配置、桌宠插件链接由脚本准备；若沿用已有 profile 的模型服务，需在第 1 步填写对应字段。未复制模型配置时，仍需为这个 profile 配置服务及凭据。

3. 装原版插件（第 1 步填了 `whalePetPlugin` 就跳过）：

   ```powershell
   dsh plugin --profile companion-test add @luweiyabo/dsh-whale-pet
   ```

4. 启动：

   ```powershell
   pwsh .\tools\start-whale-companion.ps1 -DesktopOnly
   ```

   不加 `-DesktopOnly` 会连游戏一起启动，要先把游戏部分配好。

### 怎么用

| 操作 | 效果 |
|---|---|
| 左键点身体 | 按部位互动，播放本地回应 |
| 靠近后点鲸鱼按钮／托盘「打开聊天」 | 打开面板；贴边时聚焦快捷聊天 |
| 拖动 | 换位置，甩出去会滑 |
| 右键点她 | 指个地方让她跑过去 |
| `Ctrl+Alt+Space` | 开关鼠标点透 |
| `Esc` | 松开键鼠 |
| 托盘图标 | 专注、免打扰、爬窗口、散步、开机自启、退出等 |

### 语音

想让她出声，可以用 Fish Audio 上的公开音色「蓝色大肥鱼」（Fish Audio 用户「大大大肥鱼」做的）：

1. 在 Fish Audio 网站建一个 API Key，账户需有该模型可用额度。
2. 把 Key 存成数据目录里的 `fish-audio-key.txt`，文件里只放 Key 一行。数据目录默认是 `~/.dsh/game-companion/`。
3. 重启 DSH，在面板「声音」里选「蓝色大肥鱼 · Fish Audio」，再点喇叭打开。

她会按聊的内容自动换语气，比如开心、傲娇、委屈、犯困，一共 25 种。

Fish 聊天语音采用 PCM 流式播放，不必等整段生成结束；网络或服务排队仍会影响等待时间。发送消息、关闭语音或切换对话可停止播放；实际输入会先打断主动搭话语音。本地身体互动与预置试听音频无需再次合成。

龙华和 Momo 的聊天合成依赖另行安装的外部 TTS 适配器，源码包不包含适配器或凭据；菜单出现声线名称不表示新机器已具备合成能力。接入点见 `app/dsh-game-companion/src/voice.js`。附带的本地互动短语音与这些外部聊天接口分开。

## 测试

```powershell
cd app\dsh-game-companion; node --test
cd app\companion-overlay; node --test
```

## 许可

- 代码：[MIT](LICENSE)，只管代码。
- 角色形象（头像、表情、图标）：[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans)，要署名、不能商用、改了也要用同样的协议。
- 动画：原版的 95 个和新做的 69 个都可以开源使用，不能商用。按 PC2005-cloud/dsh-pet 的要求附上原作者地址：<https://github.com/PC2005-cloud/dsh-pet>。
- 字体：站酷快乐体、霞鹜文楷，SIL OFL 1.1。

每个文件的来源见 [THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md)。想商用素材，请先找对应作者。
