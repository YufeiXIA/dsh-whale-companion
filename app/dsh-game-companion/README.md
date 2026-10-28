# dsh-game-companion · DSH 插件

完整版的聊天与工具宿主，提供 `/game-companion/view` 面板、会话与历史、偏好记忆、主动陪伴、识图接口、语音和实验性游戏接入。安装与最新行为统一见根目录 [README](../../README.md) 和 [0.2.0 更新说明](../../docs/release-0.2.0.md)；独立运行版本见 [轻便版](../../lite/README.md)。

`cordis.patch.yml` 中的 `provider`、`model`、`reasoningEffort` 和 `turnTimeoutMs` 决定聊天路由与超时；按自己的 DSH 配置调整。`dataDir` 指定私有数据目录，`bridgeUrl` 用于《杀戮尖塔 2》桥接。

首次安装先在仓库根目录运行 `pwsh tools/prepare-companion-profile.ps1`，再按根目录说明安装尚未链接的原版动画插件，最后启动桌宠。准备脚本会在 profile 不存在时创建基础与网页配置。当前验证目标为 DSH Desktop 0.2.0-rc.2，需其内置的 `@deepseek-ai/dsh-web`、`@deepseek-ai/dsh-web-search-deepseek`、`@deepseek-ai/dsh-web-fetch-http` 与 `@deepseek-ai/dsh-tool-web`；未验证其他版本。

聊天模型由 DSH 提供；当前识图实现单独使用官方 DeepSeek API，需要宿主 `DEEPSEEK_API_KEY`。Fish Audio 聊天需要数据目录中的 `fish-audio-key.txt`；龙华及 Momo 聊天需要未随包提供的外部适配器。不要将私有数据、Key、`overlay-session.txt` 或游戏桥令牌提交到仓库，详细边界见 [SECURITY.md](../../SECURITY.md)。

游戏接入：[《杀戮尖塔 2》配置](../../sts2-bridge/README.md) · [《星露谷物语》实验性适配](STARDEW.md)。接口和源码存在不代表完成了游戏实机验收。

主要入口是 `src/index.js`；记忆与历史分别位于 `src/personal-memory.js`、`src/chat-history.js`，界面位于 `public/index.html`。在本目录运行 `node --test` 检查宿主测试。
