# 大肥鱼 · 轻便版

不用装 DSH，没有游戏功能。装好、填个模型 Key 就能聊。和完整版的区别见[两个版本](../README.md#两个版本)。

## 下载

在 [Releases](https://github.com/YufeiXIA/dsh-whale-companion/releases) 里挑一个：

- `WhaleCompanion-Lite-<版本>-Setup.exe`：安装版，会建桌面快捷方式。
- `WhaleCompanion-Lite-<版本>-Portable.zip`：免安装，解压后双击 `WhaleCompanion.exe`。

没有代码签名，Windows 可能提示「未知发布者」，点「更多信息 → 仍要运行」。

装好后一打开就退出：多半是装到了权限特殊的文件夹，卸载后用默认安装位置重装。

## 第一次打开

设置页会自己弹出来：

1. 选服务商：DeepSeek、通义千问、Kimi、智谱、OpenAI，或者「其他」（任何兼容 OpenAI 接口的服务）。
2. 粘贴 API Key，点「测试一下」。
3. 提示模型不对，就点「获取模型列表」挑一个。

以后想改，点聊天面板上的「设置」，或者右键托盘图标选「模型与语音设置」。

- **语音**（可选）：填阿里百炼的 API Key 她就能出声，再点面板上的喇叭打开。她会按聊的内容换语气。默认模型和音色是作者自己在用的；测试提示模型或音色不对，就换成你在百炼控制台开通的。
- **看图**（可选）：默认用聊天模型。聊天模型看不了图，就单独填一个能看图的。看屏幕这个功能本身默认关着，要在「陪伴」里打开。

## 有什么

和完整版一样：聊天、记住你的偏好、多段对话、主动搭话、留意后台程序、看屏幕、喂饭摸头、贴边偷看、爬窗口、专注和免打扰、喝水久坐提醒。

没有：《杀戮尖塔 2》和其他游戏相关的功能。

## 数据存在哪

都在 `%APPDATA%\大肥鱼\`：

- `secrets.json`：API Key，用你的 Windows 账户加密，面板里只显示末 4 位。
- `state.json`：设置、聊天记录、她记住的事。

卸载后想清干净，删掉这个文件夹。聊天、语音、看图只发给你填的那几个服务。

## 自己打包

需要 Node 22+ 和 Electron 44 的 Windows x64 解压目录。

```bash
cd lite && npm install && npm test && npm run build
```

- `ELECTRON_DIST`：Electron 44 解压目录，默认 `tools/electron44`。
- `WHALE_PET_SOURCE`：解压好的原版插件目录；不填就用 `npm pack` 下载 `@luweiyabo/dsh-whale-pet@0.1.3`。

安装包和压缩包在 `outputs/lite-dist/`。

## 素材

95 个原版动画来自 [luweiyabo/dsh-whale-pet](https://github.com/luweiyabo/dsh-whale-pet)，大多出自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)；另外 69 个是新做的。角色按 CC BY-NC-SA 4.0 授权。这些都不能商用。安装包里的 `lite/pet/` 附了原版插件的许可和素材说明，其余见 [THIRD_PARTY_ASSETS.md](../THIRD_PARTY_ASSETS.md)。
