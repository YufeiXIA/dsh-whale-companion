# 第三方资源与署名

本项目的原创源代码以根目录 [LICENSE](LICENSE)（MIT）授权。MIT **不适用于**下列媒体资源。复制、分发或改编这些资源时，请遵守各自的条款并保留署名。

## 角色形象「大肥鱼」

- 社区二创的 DeepSeek 鲸鱼娘，不是 DeepSeek 官方形象。
- 原型「溟月」：B 站 [@上善无形](https://space.bilibili.com/4456176)。
- 女仆鲸鱼娘版设计：B 站 [@ZipZipPipe](https://space.bilibili.com/4168597)，参考画作 Pixiv [148186519](https://www.pixiv.net/artworks/148186519)。
- 授权：[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans)（署名 · 非商业 · 相同方式共享）。作者[声明原文](https://www.bilibili.com/opus/1247156596114456581)写明，该形象不可以任何形式商业化。

本项目中以该形象为基础的衍生图像，同样以 CC BY-NC-SA 4.0 发布：

| 文件 | 说明 |
|---|---|
| `app/dsh-game-companion/public/art/portrait.png`、`public/assets/whale-rice-card.png` | Q 版捧饭头像，本项目作者的二创 |
| `app/dsh-game-companion/public/art/expressions/*.png` | 四张表情差分，以上图为参考生成 |
| `app/companion-overlay/assets/*`、`app/dsh-game-companion/public/assets/whale-gaming-*` | 抱手柄的托盘与快捷方式图标，AI 辅助生成 |

## 动画

- `/whale-pet/*.webm` 的 95 个动画由原版插件 [luweiyabo/dsh-whale-pet](https://github.com/luweiyabo/dsh-whale-pet) 在运行时提供，本仓库不包含这些文件。它们大多来自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)。
- `app/dsh-game-companion/public/animations/*.webm` 的 69 个动画由本项目作者新增：以原版动态小人为参考图，用图生视频生成，再抠像处理。它们属于上述角色与动画素材的衍生作品。
- 条款：PC2005-cloud/dsh-pet 写明素材（动画、提示词、源视频）**允许开源使用，禁止商用**，且二创须在公开渠道附上原作者地址 <https://github.com/PC2005-cloud/dsh-pet>。本项目新增的动画沿用同样的条款。

上游条款可能更新。使用前请核对 [PC2005-cloud/dsh-pet 的许可说明](https://github.com/PC2005-cloud/dsh-pet#许可)与 [luweiyabo/dsh-whale-pet 的第三方资源说明](https://github.com/luweiyabo/dsh-whale-pet/blob/main/THIRD_PARTY_ASSETS.md)。

## 字体

| 文件 | 字体 | 许可 |
|---|---|---|
| `public/art/fonts/title.woff2` | 站酷庆科黄油体 ZCOOL QingKe HuangYou（Google Fonts 版本）的子集 | SIL OFL 1.1，见同目录 `OFL-ZCOOLQingKeHuangYou.txt` |
| `public/art/fonts/quote.woff2` | 霞鹜文楷 LXGW WenKai v1.530 的子集 | SIL OFL 1.1，见同目录 `OFL-LXGWWenKai.txt` |

两份子集只包含面板用到的字符，仅供网页显示，不作为可安装的桌面字体分发。霞鹜文楷的保留字体名附加条款允许这种用法。

## 代码依赖与桥接

| 项目 | 用途 | 许可 |
|---|---|---|
| [luweiyabo/dsh-whale-pet](https://github.com/luweiyabo/dsh-whale-pet) | 运行时提供动画；本项目的设计起点 | 代码 MIT，素材见上 |
| [Gennadiyev/STS2MCP](https://github.com/Gennadiyev/STS2MCP) | 《杀戮尖塔 2》状态与动作桥；`sts2-bridge/companion.patch` 是对它的修改 | MIT，见 `sts2-bridge/STS2MCP-LICENSE` |
| [Madlezz/LanSpire](https://github.com/Madlezz/LanSpire) | 本地联机，未修改 | MIT |
| [Electron](https://www.electronjs.org/) | 桌面窗口运行时，需自行下载 | MIT |

## 不包含的内容

本仓库**不包含**以下内容：

- 《杀戮尖塔 2》的游戏文件、存档或反编译代码；
- 任何 API Key、访问令牌或个人运行记录；
- 作者本机的语音适配器和语音试听录音。
