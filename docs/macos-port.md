# Mac 轻便版：安装、权限与功能范围

0.3.0-macos.1 是独立轻便版的 Apple Silicon 预发布，目标为 **macOS 13+、M 系列 Mac**。界面主要为中文，不需要 DSH；Intel Mac、完整版 DSH 启动和游戏控制不在这次发布范围内。Windows 最新稳定版仍为 0.2.0。

本页描述本次移植的使用方式与功能范围。GitHub 的 macOS 15 arm64 构建机已完成编译、打包、签名验证和隔离启动检查；这不等于用户真实 Mac 上的完整验收，证据和未验证项见 [Mac 发布说明](release-0.3.0-macos.1.md)。本仓库现有实机 GIF 都来自 Windows。

## 下载安装

1. 打开 [v0.3.0-macos.1 预发布页](https://github.com/YufeiXIA/dsh-whale-companion/releases/tag/v0.3.0-macos.1)，下载 `WhaleCompanion-Lite-0.3.0-macos.1-macOS-arm64.dmg`。不便使用 DMG 时可选同名 `.zip`。
2. 打开 DMG，把「大肥鱼.app」拖到「应用程序」；ZIP 则解压后移到 `/Applications`。退出 DMG，再从「应用程序」打开。更新前先退出旧版，保留数据目录。
3. 此包使用 ad-hoc 签名，没有 Apple Developer ID 签名，也没有 Apple 公证。若系统拦截，先尝试打开一次，再在「系统设置 → 隐私与安全性」里对这个应用选择「仍要打开」，按提示确认。使用前确认来源为本项目发布页；步骤依据 [Apple 官方说明](https://support.apple.com/102445)。无需关闭整个系统的 Gatekeeper。
4. 首次设置里选择模型服务商，输入自己的 API Key，点击「测试一下」。语音、识图服务分别按 [轻便版设置](../lite/README.md#第一次打开)配置。
5. 菜单栏鲸鱼图标提供打开聊天、设置、睡眠/唤醒与退出入口。关闭聊天面板后，桌宠仍可继续运行；完全退出请使用菜单栏中的退出命令。

发布页另附 `SHA256SUMS-macOS-arm64.txt` 和 `Mac-build-validation.json`。校验值用于检查下载内容一致性，不代表应用已通过 Apple 公证或完整功能验收。

## 可选系统权限

基础聊天、记忆、手动选择图片、动画及本地互动无需以下两个权限。请按实际使用的功能授权；系统权限与应用内的自动看屏开关相互独立。

| 想用什么 | 需要什么 | 去哪里设置 |
|---|---|---|
| 自动看主屏当前窗口 | 屏幕录制；应用内也需开启自动看屏 | 系统设置 → 隐私与安全性 → 屏幕录制，部分系统名为「屏幕与系统音频录制」 |
| 爬窗口并跟随位置、缩放及隐藏状态 | 辅助功能 | 系统设置 → 隐私与安全性 → 辅助功能 |
| 普通聊天、手动发图、语音、拖动与贴边 | 无上述权限要求 | 在应用里配置服务与开关即可 |

设置面板及菜单栏中的权限入口可打开系统设置。授权、更换应用副本或撤销权限后，macOS 可能要求退出并重新打开应用。Apple 的[屏幕录制权限](https://support.apple.com/guide/mac-help/control-access-to-screen-and-system-audio-recording-mchld6aa7d23/mac)和[辅助功能权限](https://support.apple.com/guide/mac-help/allow-accessibility-apps-to-access-your-mac-mh43185/mac)说明列出了系统管理方式。

自动看屏默认关闭，原图只在内存中处理。采集目标仍限定为主屏最上层窗口的可见区域；权限不足、元数据不完整、目标发生变化或敏感窗口遮挡时，跳过本次截图，不改截副屏。屏幕权限未授予时，普通程序类别采样仍可使用，不以空白窗口标题代替敏感内容检查。敏感过滤依赖可取得的系统信息与规则，无法保证识别所有敏感画面。详情见 [SECURITY.md](../SECURITY.md)。

## 与 Windows 轻便版对照

下表说明共用功能和 Mac 适配方式，**不是逐项实机通过记录**。Mac 验证状态统一见 [发布说明](release-0.3.0-macos.1.md#验证状态)。

| 功能 | Mac 0.3.0-macos.1 范围 |
|---|---|
| 聊天、独立偏好、多会话、历史关键词摘录 | 沿用轻便版服务和界面；无 DSH 历史分页工具或内置联网检索 |
| 手动发图、独立识图配置 | 沿用轻便版实现，不要求系统屏幕录制权限 |
| 阿里百炼 Qwen 在线语音、本地互动短语音 | 沿用设置与播放路径；在线服务仍需用户自己的 Key、音色及额度 |
| 回复动作、喂饭、摸头、睡眠与手动唤醒 | 共用动画、互动与持久化睡眠逻辑 |
| 主动陪伴、程序类别、提醒与免打扰 | Mac 原生活动适配；窗口标题只在本机参与过滤，不送模型 |
| 拖动、甩动、贴边、自由走动、底部散步 | 共用移动逻辑，采用 Electron 逻辑坐标；Retina 和混合缩放多屏仍需实机验收 |
| 爬窗口与窗口跟随 | Swift 原生辅助程序与 Accessibility；拒绝权限时停用该能力 |
| 自动看屏 | macOS 屏幕录制授权、主屏可见区域和截图前后复核 |
| 托盘、Spaces、全屏与多屏 | Mac 菜单栏入口及浮窗适配；不同显示器、桌面空间与全屏应用组合仍需实机验收 |
| 开机自启 | 提供 Mac 登录项入口；ad-hoc 签名下的注册和跨更新行为需用户确认 |
| 游戏控制与完整版 DSH 集成 | 本次没有移植 |

## 数据、更新与卸载

默认用户数据目录为 `~/Library/Application Support/大肥鱼/`，与应用所在位置分开：

- `state.json` 保存聊天、设置与记忆；它不是加密存档。
- `secrets.json` 保存由 Electron `safeStorage` 加密的 API Key，Mac 密钥由系统 Keychain 管理。面板只显示末 4 位。不同 ad-hoc 构建可能被系统视作不同应用，更新后可能再次出现钥匙串授权；见 [Electron safeStorage 文档](https://www.electronjs.org/docs/latest/api/safe-storage)。一次构建读写通过不证明升级后永远可读。

更新时先退出旧版，再替换 `/Applications` 中的应用，保留上述目录。不要公开上传该目录、Key、未脱敏日志或私人对话；跨系统迁移时重新输入自己的 Key，不直接复制 Windows 的加密凭据。删除应用不会自动删除聊天；需要清空时先退出，再删除用户数据目录。开机自启在系统登录项中可另行关闭。

## 从源码构建

GitHub Actions 的构建目标为 `macos-15` arm64，使用 Node 22+、Electron 44 arm64 和 Xcode/Swift 工具链。Mac 包需在 macOS 上构建；Swift 辅助程序随应用分发，用户不需要另装编译工具。在 Apple Silicon Mac 上，从仓库根目录运行：

```bash
cd lite
npm ci
npm test
npm run build:mac
```

构建会下载对应的 Electron，编译原生辅助程序，生成 `.app`、DMG 和 ZIP；输出位于 `outputs/lite-dist-mac-arm64/`。已有 Electron 44 arm64 解压目录时可设置 `ELECTRON_DIST`，该目录应包含 `Electron.app`。`WHALE_PET_SOURCE` 可指定解压好的原版插件；未设置时由脚本下载 `@luweiyabo/dsh-whale-pet@0.1.3`。源码和资源暂存目录为 `outputs/lite-stage-mac-arm64/`。

在其他系统上可从 `lite/` 运行 `node scripts/build.mjs --mac --arm64 --stage-only` 检查暂存文件；这一步不会编译 Swift、启动 Mac 应用或生成 Mac 安装包。

本次默认采用 ad-hoc 签名。Apple Developer ID 签名与公证需要维护者提供有效的开发者身份及凭据，本仓库不包含这些凭据。Electron 官方说明了[签名、公证与登录项等 API 的限制](https://www.electronjs.org/docs/latest/tutorial/code-signing)；未公证的预发布不保证登录项注册或不同构建间的 Keychain 行为稳定。

官方权限与签名资料核对日期：2026-10-28。
