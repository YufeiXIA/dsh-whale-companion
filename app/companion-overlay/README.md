# companion-overlay（桌面窗口）

Electron 44 外壳：把插件面板 `/game-companion/view` 显示成透明、置顶、可点透的桌宠窗口。它不创建第二个模型会话，也不做游戏决策。安装和使用见仓库根目录的 [README](../../README.md)。

## 启动

```powershell
pwsh ..\..\tools\start-whale-companion.ps1 -DesktopOnly
```

窗口启动时依次读取：

1. 项目根目录的 `companion.config.json`：端口、`dataDir`、PowerShell 7 路径；
2. `outputs/companion-runtime/host.stdout.log` 里的宿主地址；
3. `<dataDir>/overlay-session.txt` 里的插件会话令牌。

DSH 的 cookie 和插件会话令牌只保存在主进程，以及这个窗口独立的 HttpOnly 会话里。渲染器关闭 Node、开启 sandbox 和 contextIsolation，禁止外站导航和弹窗。

## 桌面行为

| 模块 | 内容 |
|---|---|
| `main.cjs` | 窗口、托盘、拖拽、惯性、贴边、漫游、爬窗口、掉落、全屏躲藏、提醒转发 |
| `desktop-life.cjs` | 任务栏散步路线、爬窗口目标、掉落物理、健康提醒计时（纯函数，有单测） |
| `edge-snap.cjs`、`roaming.cjs`、`inertia.cjs` | 贴边、漫游路线、甩飞惯性 |
| `activity.cjs` + `../../tools/companion-activity.ps1` | 每 2 秒在本机采样一次前台窗口：程序粗分类、空闲时长、敏感标记、窗口矩形、是否全屏。标题只用于敏感判断，不输出 |
| `screen-capture.cjs` | 识图截图：只截当前前台窗口，只留在内存，敏感窗口或窗口变化时放弃 |

`*-check.cjs` 和 `smoke.cjs` 是作者本机的原生窗口检查脚本，需要运行中的宿主，通过 `tools/start-companion-overlay.ps1 -SmokeTest` 等参数调用。

## 测试

```powershell
node --test
```
