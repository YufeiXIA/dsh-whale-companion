# dsh-game-companion（DSH 插件）

大肥鱼的「大脑」：在 DSH 宿主里运行一个专用会话，提供聊天面板 `/game-companion/view`、记忆、陪伴调度、可选的屏幕识图，以及《杀戮尖塔 2》的游戏工具。安装和使用见仓库根目录的 [README](../../README.md)。

## 配置（`cordis.patch.yml`）

| 字段 | 默认 | 说明 |
|---|---|---|
| `provider` / `model` | `deepseek-official` / `deepseek-flash` | 搭子会话使用的 DSH 模型服务，按你的 DSH 配置修改 |
| `reasoningEffort` | `low` | 推理强度 |
| `turnTimeoutMs` | `90000` | 单轮超时 |
| `bridgeUrl` | `http://127.0.0.1:15527` | 鲸鱼游戏席位的 STS2MCP 桥 |
| `dataDir` | `$DSH_HOME/game-companion` | 运行记录、会话令牌、桥接令牌 |
| `tokenFile` | `<dataDir>/bridge-token.txt` | 桥接令牌 |

## 数据目录里有什么

- `state.json`：会话、目标、记忆、聊天投递记录与测试预算。不要靠删除它来解除「待确认」状态。
- `overlay-session.txt`：每次启动重新生成的本机会话令牌，只给桌面窗口用。
- `bridge-token.txt`：游戏桥接认证用，不是模型 API Key。

这三个文件都含私人信息，不要分享。

## 结构

| 位置 | 内容 |
|---|---|
| `src/index.js` | 宿主：会话、调度、路由 |
| `src/route-guard.js` | 本机门禁（cookie、Host、Origin） |
| `src/ambient.js` | 陪伴节奏与识图许可 |
| `src/personal-memory.js`、`src/conversation.js` | 记忆与对话 |
| `src/tools.js`、`src/sts2.js` | 游戏工具与 STS2MCP 适配 |
| `public/index.html` | 面板与桌宠动画（单文件，无构建步骤） |
| `persona/` | 人设与游戏风格提示 |

## 测试

```powershell
node --test
```

`test/route-guard.test.js` 会逐个检查所有 `/game-companion/*` 路由：不带 cookie 返回 401，Host 不对返回 403，控制类 POST 缺少控制头也返回 403。
