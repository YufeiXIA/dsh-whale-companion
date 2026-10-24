# dsh-game-companion（DSH 插件）

大肥鱼的「脑子」：在 DSH 里跑她自己的对话，提供聊天面板 `/game-companion/view`、记忆、主动聊天、看屏幕，还有《杀戮尖塔 2》的游戏工具。安装见根目录 [README](../../README.md)。

## 配置（`cordis.patch.yml`）

| 字段 | 默认 | 说明 |
|---|---|---|
| `provider` / `model` | `deepseek-official` / `deepseek-flash` | 用哪个模型服务，按你的 DSH 改 |
| `reasoningEffort` | `low` | 想多想少 |
| `turnTimeoutMs` | `90000` | 一轮最多等多久 |
| `bridgeUrl` | `http://127.0.0.1:15527` | 游戏桥地址 |
| `dataDir` | `$DSH_HOME/game-companion` | 数据放哪儿 |

## 数据目录

- `state.json`：对话、记忆和其他记录。
- `overlay-session.txt`：每次启动换一个的令牌，给桌面窗口用。
- `bridge-token.txt`：连游戏用的令牌，不是 API Key。

这三个都别分享。

## 代码在哪儿

| 位置 | 内容 |
|---|---|
| `src/index.js` | 主体：对话、调度、接口 |
| `src/route-guard.js` | 接口检查（cookie、地址、来源） |
| `src/ambient.js` | 主动聊天和看屏幕的开关 |
| `src/personal-memory.js`、`src/conversation.js` | 记忆和对话 |
| `src/tools.js`、`src/sts2.js` | 游戏工具 |
| `public/index.html` | 面板和动画，单个文件，不用构建 |
| `persona/` | 人设 |

## 测试

```powershell
node --test
```
