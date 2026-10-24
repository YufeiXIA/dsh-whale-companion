# 素材来源与署名

代码按 [LICENSE](LICENSE)（MIT）授权，下面这些素材不归 MIT 管，用的时候请按各自的条款来，并保留署名。

## 角色「大肥鱼」

- 同人形象，不是 DeepSeek 官方的。
- 原型「溟月」：B 站 [@上善无形](https://space.bilibili.com/4456176)。
- 女仆版：B 站 [@ZipZipPipe](https://space.bilibili.com/4168597)，参考图 Pixiv [148186519](https://www.pixiv.net/artworks/148186519)。
- 授权：[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans)。作者在[声明](https://www.bilibili.com/opus/1247156596114456581)里写明不能以任何形式商用。

这个项目里基于她画的图，也按 CC BY-NC-SA 4.0 发布：

| 文件 | 是什么 |
|---|---|
| `app/dsh-game-companion/public/art/portrait.png`、`public/assets/whale-rice-card.png` | 捧饭的 Q 版头像 |
| `app/dsh-game-companion/public/art/expressions/*.png` | 四张表情，照着头像生成 |
| `app/companion-overlay/assets/*`、`app/dsh-game-companion/public/assets/whale-gaming-*` | 托盘和快捷方式图标，AI 辅助生成 |

## 动画

- 95 个原版动画由 [luweiyabo/dsh-whale-pet](https://github.com/luweiyabo/dsh-whale-pet) 插件提供，这个仓库里没有。它们大多来自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)。
- `app/dsh-game-companion/public/animations/` 里的 69 个是新做的：拿原版小人当参考图，用图生视频做出来，再抠掉背景。
- 条款：PC2005-cloud/dsh-pet 的素材可以开源使用，不能商用，二创要在公开的地方附上 <https://github.com/PC2005-cloud/dsh-pet>。新做的 69 个也按这个来。

上游条款可能会改，用之前请看一眼 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet#许可) 和 [luweiyabo/dsh-whale-pet](https://github.com/luweiyabo/dsh-whale-pet/blob/main/THIRD_PARTY_ASSETS.md) 的说明。

## 字体

| 文件 | 字体 | 许可 |
|---|---|---|
| `public/art/fonts/title.woff2` | 站酷快乐体（Google Fonts 版） | SIL OFL 1.1 |
| `public/art/fonts/quote.woff2` | 霞鹜文楷 v1.530 | SIL OFL 1.1 |

两个都只截取了面板用到的字，只用于网页显示，许可原文放在同一个目录里。

## 用到的其他项目

| 项目 | 用来做什么 | 许可 |
|---|---|---|
| [luweiyabo/dsh-whale-pet](https://github.com/luweiyabo/dsh-whale-pet) | 提供动画，也是这个项目的起点 | 代码 MIT，素材见上 |
| [Gennadiyev/STS2MCP](https://github.com/Gennadiyev/STS2MCP) | 读取和操作《杀戮尖塔 2》，`sts2-bridge/companion.patch` 是对它的改动 | MIT，见 `sts2-bridge/STS2MCP-LICENSE` |
| [Madlezz/LanSpire](https://github.com/Madlezz/LanSpire) | 本地联机，没改 | MIT |
| [Electron](https://www.electronjs.org/) | 桌面窗口，需要自己下载 | MIT |

## 仓库里没有的东西

- 《杀戮尖塔 2》的游戏文件、存档、反编译代码
- 任何 API Key、令牌和个人记录
- 作者自己的语音组件和录音
