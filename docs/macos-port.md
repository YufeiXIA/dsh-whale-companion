# macOS 版本可行性与下一阶段范围

可以继续做 macOS 版。聊天、记忆、图片输入、网页界面和动画主要由 Node.js、浏览器 API 与 Electron 组成，可以复用大部分现有逻辑。当前 0.2.0 下载和构建脚本仍是 Windows 版本，尚未生成或验证 macOS 应用。

建议先移植**独立轻便版**：桌宠显示、聊天、记忆、图片输入、语音、睡眠和设置形成一个可运行的 Mac 版本，再补窗口跟随等系统能力。完整版还依赖 DSH 的安装与启动流程，需要另外验证。

## 需要替换或验证的部分

| 当前实现 | macOS 工作 |
|---|---|
| Electron 透明浮窗、动画、托盘、快捷键 | 复用界面与资源，实测置顶、焦点、点透、菜单栏图标、Spaces、全屏应用和多屏坐标 |
| PowerShell / C# 的 Win32 活动采样与窗口句柄追踪 | 提供 macOS 原生适配层；分别处理前台程序类别、窗口位置、移动/缩放/最小化/关闭事件，保留最小数据采集范围 |
| 主屏可见区域截图与敏感窗口过滤 | 适配 macOS 窗口元数据和坐标；接入屏幕录制授权，验证拒绝、撤销、暂停和目标变化时不会继续发送图像 |
| Windows 账户加密的 API Key 与 AppData 路径 | 使用 Electron 的系统凭据能力和 Mac 用户数据目录；实测重启、升级与签名变化后的访问行为 |
| `.ps1` 启动入口、`electron.exe` 检测、NSIS / Windows ZIP | 新增 `.app` 构建与 DMG / ZIP 发布流程，选择并验证 Apple Silicon 与 Intel 支持范围 |
| Windows 本地语音/外部适配器路径 | 本地音频资源可复用；云端语音需检查网络、解码及播放中断；外部适配器单独确认兼容性 |

窗口追踪应按实际所需能力申请辅助功能权限；首次聊天无需为了尚未启用的窗口功能预先取得该权限。Electron 提供 [辅助功能信任状态查询](https://www.electronjs.org/docs/latest/api/system-preferences#systempreferencesistrustedaccessibilityclientprompt-macos)，原生窗口实现与权限范围仍需在 Mac 上设计和验证。

自动看屏在 Mac 上还受系统的屏幕录制权限控制。Electron 的 [desktopCapturer 文档](https://www.electronjs.org/docs/latest/api/desktop-capturer)说明截图需要用户同意，权限状态可由 [systemPreferences](https://www.electronjs.org/docs/latest/api/system-preferences#systempreferencesgetmediaaccessstatusmediatype-windows-macos) 查询；Apple 的 [ScreenCaptureKit 示例](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos?language=objc)也演示了首次授权。默认关闭、主屏范围、可见内容裁剪、敏感内容拦截和内存处理等现有约束应一并保留。

## 发布与验收

正式分发应准备稳定的应用标识、Apple Developer 签名身份、签名与公证流程。Electron 的 [macOS 签名说明](https://www.electronjs.org/docs/latest/tutorial/code-signing#signing--notarizing-macos-builds)列出了开发者账号、macOS 上的 Xcode 和证书准备；Apple 说明了[分发签名](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac/)和[公证](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)。签名也影响 Keychain 访问和登录项等系统功能，不能只验证一次解压启动。

下一阶段完成标准：在真实 Mac 上完成首次配置、聊天和历史保留、图片输入、语音开始/结束/打断、睡眠与唤醒、拖动/点透/托盘、重启与退出；开启系统能力后再验证屏幕权限拒绝与撤销、窗口跟随、全屏与多屏。需要对承诺支持的芯片架构分别验证，并从下载产物检查签名、公证和首次启动。

目前这是可实施的移植路线，尚不构成 macOS 已兼容的声明，也没有确定发布日期。官方资料核对日期：2026-10-28。
