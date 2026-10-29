# 鲸鱼合作搭子浮窗

独立 Electron 外壳，显示既有 `companion-test` 宿主的 `/game-companion/view`。不创建第二个模型会话，不承担游戏决策，也不修改 DSH 的安装包。

## 启动

1. 先运行工作区 `tools/start-companion-profile.ps1`，让测试宿主监听本机 19388。
2. 运行 `tools/start-companion-overlay.ps1`。

可移植 Electron 44.0.0 位于工作区 `tools/electron44`；来自官方 release 的 Windows x64 包，已对照官方 SHASUMS256 校验。窗口数据、缓存、日志均保存在 G 盘工作区。默认不加入开机启动。

## 操作

- 拖动顶栏移动窗口；窗口边缘可调整大小。
- Windows `Ctrl+Alt+Space`，macOS `⌘⌥⇧Space` 切换鼠标点透。恢复快捷键被其他应用占用时禁用点透，避免无法点击恢复。
- `Ctrl+Alt+Enter` 恢复交互并聚焦聊天输入框。
- `Esc` 释放键鼠并进入点透；中文输入法组词期间不拦截 Esc。
- “暂停并关闭”先让 DSH 关闭游戏动作许可，再关闭窗口。如果服务不可达，会提示尚未确认暂停。

启动时 `showInactive()` 不主动抢焦点。关闭浮窗不会结束 DSH 或游戏进程。进程被强制结束、系统断电等情况无法保证发出暂停请求；随时可在 DSH 面板手动暂停。独占全屏下的覆盖效果尚未验收，当前测试面向窗口化游戏。

宿主访问 token 从已有本地启动日志读取，仅用于同机认证。视图 URL 不带 token；cookie 保留在主进程与 HttpOnly 的独立 Electron 会话。渲染器禁用 Node、启用 sandbox/contextIsolation，窗口 IPC 仅提供四个固定操作；禁止外站导航和弹窗。

## 验证

`tools/start-companion-overlay.ps1 -SmokeTest` 要求搭子已暂停，实际显示浮窗并检查同一会话、动画、置顶、焦点、拖动区域、点透焦点设置和关闭暂停。它不调用模型或执行游戏动作；报告及截图保存到 `outputs/companion-runtime`，运行器检查子进程退出码，避免误用旧成功报告。

当前已通过原生冒烟。物理拖动、鼠标事件真正穿透到游戏、真人操作席位以及完整模型合作局仍待验收。

参考：[Electron 自定义窗口交互](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions)、[BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)、[全局快捷键](https://www.electronjs.org/docs/latest/api/global-shortcut)。
