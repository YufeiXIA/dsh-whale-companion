# 0.3.0-macos.1 · Apple Silicon Mac 轻便版预发布

[预发布页](https://github.com/YufeiXIA/dsh-whale-companion/releases/tag/v0.3.0-macos.1) · [Mac 安装与权限](macos-port.md) · [Windows 稳定版 0.2.0](https://github.com/YufeiXIA/dsh-whale-companion/releases/tag/v0.2.0)

这是独立轻便版的 Mac 预发布，面向 **macOS 13+、Apple Silicon（M 系列）**。无需 DSH，使用用户自己的模型、识图和语音服务。没有 Intel 构建；完整版 DSH 启动、《杀戮尖塔 2》《星露谷物语》及其他游戏控制没有移植。Windows 0.2.0 继续保持最新稳定版。

## 下载文件

| 文件 | 用途 |
|---|---|
| `WhaleCompanion-Lite-0.3.0-macos.1-macOS-arm64.dmg` | Mac 应用安装镜像 |
| `WhaleCompanion-Lite-0.3.0-macos.1-macOS-arm64.zip` | 同一应用的 ZIP，解压后移动到「应用程序」 |
| `SHA256SUMS-macOS-arm64.txt` | Mac 发布产物校验值 |
| `Mac-build-validation.json` | 对应构建及自动化检查的结果和边界 |

先把「大肥鱼.app」放到 `/Applications` 再打开。此预发布仅有 ad-hoc 签名，没有 Apple Developer ID 签名，也没有 Apple 公证。Gatekeeper 首次拦截时，按 [Apple 官方的单应用「仍要打开」步骤](https://support.apple.com/102445)操作。完整安装步骤、数据路径和更新方式见 [Mac 说明](macos-port.md)。

## 本次移植范围

- 保留轻便版的聊天、独立偏好、多会话、历史关键词摘录、手动发图、Qwen 在线语音、本地互动、动作选择、持续睡眠与手动唤醒。
- 共用桌宠界面和移动逻辑，提供拖动、甩动、贴边、自由走动、底部散步、喂饭、摸头、专注与提醒。
- 增加 Swift 原生活动采样与窗口跟随适配，窗口停靠通过 Accessibility 读取位置与状态；主屏截图独立检查屏幕录制权限。
- 增加菜单栏及权限入口，适配 Mac 浮窗、Spaces、逻辑坐标和登录项。屏幕权限不足或截图目标不确定时跳过观察。

基础聊天不需要屏幕录制或辅助功能权限。自动看屏默认关闭，需应用内开启并授予屏幕录制；窗口停靠另需辅助功能。自动截图仍限定在主屏最上层窗口的可见区域，原图只在内存中处理。功能对照见 [Mac 功能表](macos-port.md#与-windows-轻便版对照)，数据流见 [SECURITY.md](../SECURITY.md)。

## 验证状态

当前文档阶段：**GitHub macOS arm64 CI 构建和运行检查待完成，尚无成功产物验收记录**。发布前需按实际执行结果更新本段，并附上 `Mac-build-validation.json`；未执行项不得写成通过。

验证边界：自动化单元检查、Swift 编译、签名检查、包结构检查或隔离启动，仅能支持各自检查到的行为。即使这些项目通过，也不能宣称已完成真实用户 Mac 的全功能验收。尚需真实 Mac 检查模型与在线语音服务、权限首次拒绝及撤销、窗口移动与最小化、Retina 多屏、Spaces/全屏切换、登录项和跨版本升级。仓库现有演示 GIF 仍是 Windows 录制，不是这次 Mac 的实机证明。

API Key 经 Electron `safeStorage` 与 Mac Keychain 保护，聊天和设置留在 `~/Library/Application Support/大肥鱼/`。ad-hoc 构建间可能再次请求钥匙串访问；基础 CI 不证明更新后凭据可读性或登录项一直有效。相关平台限制见 [Electron 签名文档](https://www.electronjs.org/docs/latest/tutorial/code-signing)。

代码为 MIT；角色、动画与音频遵循各自条款，见 [THIRD_PARTY_ASSETS.md](../THIRD_PARTY_ASSETS.md)。角色和动画不能商用。
