# companion-overlay（桌面窗口）

用 Electron 44 把插件面板 `/game-companion/view` 显示成一个透明、置顶、能点透的窗口。它只负责显示和桌面上的小动作，聊天和决策都在插件里。安装见根目录 [README](../../README.md)。

启动时会读三样东西：根目录的 `companion.config.json`，`outputs/companion-runtime/host.stdout.log` 里的宿主地址，以及 `<dataDir>/overlay-session.txt` 里的令牌。令牌只在主进程和这个窗口的 cookie 里，网页那一侧拿不到。

## 文件

| 文件 | 做什么 |
|---|---|
| `main.cjs` | 窗口、托盘、拖拽、固定半身停靠、爬窗口、全屏躲开、提醒 |
| `desktop-life.cjs` | 散步路线、爬窗口位置、掉落、提醒计时 |
| `edge-snap.cjs`、`roaming.cjs`、`inertia.cjs` | 贴边、乱跑、甩出去 |
| `activity.cjs` + `tools/companion-activity.ps1` | 每 2 秒看一次前台是哪类程序、是否全屏 |
| `screen-capture.cjs` | 主屏可见画面裁剪到顶层页面，只放内存，不回退到副屏 |

`*-check.cjs` 和 `smoke.cjs` 是作者在自己电脑上检查真实窗口用的，需要宿主在跑。

`--edge-check` 使用 `dock-check.cjs` 检查左右停靠、缩放、气泡、输入和透明区域点透；回复为模拟数据，不发送聊天或屏幕图片。停靠后只有拖拽会解除，聊天和悬停都保持半身。实现与验证范围见 [本版说明](../../docs/fixed-half-dock.md)。

## 测试

```powershell
node --test
```
