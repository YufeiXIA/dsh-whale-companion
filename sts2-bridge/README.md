# 《杀戮尖塔 2》AI 队友（实验性）

让大肥鱼控制本地合作局里的一个席位。本目录只有对 STS2MCP 的修改补丁。游戏文件需要你自己合法拥有，本仓库不提供。

> [!WARNING]
> 实验性功能。自动脚本能走通若干房间，但没有证明能提高胜率，也还没完成真人合作验收。请只在单独复制出来的游戏副本和测试存档里使用，不要用在你的 Steam 正式存档上。

## 组成

| 部分 | 来源 | 作用 |
|---|---|---|
| [Gennadiyev/STS2MCP](https://github.com/Gennadiyev/STS2MCP)，基线提交 `55e064850a68f3b4cde7e5fd525bf9b2dec4e885` | MIT | 读游戏状态、执行动作的模组 |
| `companion.patch` | 本项目 | 给 STS2MCP 增加带令牌的 `/api/v1/companion` 接口、动作回执和局面证据，以及仅限本机的 HTTP 监听 |
| [Madlezz/LanSpire](https://github.com/Madlezz/LanSpire) | MIT，未修改 | 本地联机 |

接口说明在补丁新增的 `docs/companion-api.md` 里。

## 搭建步骤

需要 .NET 9 SDK、Git，以及一份《杀戮尖塔 2》。

1. 在项目根目录下拉取两个模组，并打上补丁：

   ```powershell
   git clone https://github.com/Gennadiyev/STS2MCP upstream/STS2MCP
   git -C upstream/STS2MCP checkout 55e064850a68f3b4cde7e5fd525bf9b2dec4e885
   git -C upstream/STS2MCP apply ../../sts2-bridge/companion.patch
   git clone https://github.com/Madlezz/LanSpire upstream/LanSpire
   ```

2. 编译：

   ```powershell
   dotnet build upstream/STS2MCP -c Release -p:STS2GameDir="<你的杀戮尖塔 2 目录>"
   dotnet build upstream/LanSpire/LanSpire
   ```

3. 在 `companion.config.json` 里填好 `sts2Game`，然后复制出两个隔离的游戏席位：人类玩家 `human`，以及大肥鱼 `whale`。

   ```powershell
   pwsh .\tools\prepare-companion-test.ps1
   ```

   席位放在 `app/companion-test/`，各有自己的存档目录和桥接端口（15526 / 15527）。原游戏目录不会被修改。

4. 启动全部组件：

   ```powershell
   pwsh .\tools\start-whale-companion.ps1
   ```

   在面板里确认鲸鱼玩家，点「绑定鲸鱼角色」，再点「继续合作」。绑定不会自动开始操控。每轮测试默认有预算上限：30 分钟、最多 100 次模型调用。

## 安全边界

- 桥接只监听本机，每个请求都要带 `bridge-token.txt` 里的令牌（由 `prepare-companion-profile.ps1` 生成）。
- 「立即暂停」先关闭动作入口，再取消当前模型任务。已经提交给游戏的动作可能仍会执行，以回执为准。
- 结果不明的动作不会自动重试。
