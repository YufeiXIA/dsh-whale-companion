# 《杀戮尖塔 2》AI 队友（实验性）

让大肥鱼在本地合作局里操控一个角色。这里只有对 STS2MCP 的改动补丁，游戏本体要你自己有。

> [!WARNING]
> 还在试验。自动打牌能过几个房间，但不保证打得好，也没和真人完整打过一局。请用复制出来的游戏和测试存档，别动你 Steam 上的正式存档。

## 用到什么

- [Gennadiyev/STS2MCP](https://github.com/Gennadiyev/STS2MCP)（MIT，基于提交 `55e064850a68f3b4cde7e5fd525bf9b2dec4e885`）：读游戏状态、执行操作的模组。
- `companion.patch`：给 STS2MCP 加了大肥鱼用的接口（要令牌、只听本机），接口说明在补丁里的 `docs/companion-api.md`。
- [Madlezz/LanSpire](https://github.com/Madlezz/LanSpire)（MIT，没改）：本地联机。

## 搭建

需要 .NET 9 SDK、Git 和《杀戮尖塔 2》。

1. 在项目根目录下载两个模组，打上补丁：

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

3. 在 `companion.config.json` 里填 `sts2Game`，然后复制出两份游戏，一份给你（`human`），一份给她（`whale`）：

   ```powershell
   pwsh .\tools\prepare-companion-test.ps1
   ```

   两份都放在 `app/companion-test/`，存档分开，原来的游戏目录不动。

4. 全部启动：

   ```powershell
   pwsh .\tools\start-whale-companion.ps1
   ```

   在面板里点「绑定鲸鱼角色」，再点「继续合作」。绑定之后她不会马上开始操作。每轮默认最多 30 分钟、100 次模型调用。

## 安全

- 只接受本机请求，每次都要带 `bridge-token.txt` 里的令牌。
- 点「立即暂停」会先停止接收新操作，再取消正在想的那一步。已经发给游戏的操作可能还是会执行。
- 不确定有没有成功的操作，不会自动重试。
