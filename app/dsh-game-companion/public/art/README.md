# Panel art

Character: 大肥鱼, a community fan design. The maid version is by ZipZipPipe
(Pixiv artwork 148186519), based on the original by 上善无形. It is licensed under
CC BY-NC-SA 4.0 and is not an official DeepSeek character. Every image here is a
derivative under the same licence: keep the attribution, and do not use it commercially.

`portrait.png` is the header portrait, the chibi rice-bowl card from
`public/assets/whale-rice-card.png`, served as its own cached file.

`expressions/{think,sleepy,eat,pout}.png` are header status expressions of that chibi
portrait. They were generated on 2026-10-24 with image generation, using `portrait.png`
as the reference, on a flat magenta background that was keyed to transparency and fitted
to the portrait's framing. The panel falls back to `portrait.png` if any is missing.

`fonts/title.woff2` is ZCOOL QingKe HuangYou, subset from the Google Fonts release
(github.com/google/fonts, `ofl/zcoolqingkehuangyou`). `fonts/quote.woff2` is LXGW WenKai
v1.530 (github.com/lxgw/LxgwWenKai), subset for web delivery only, which its Reserved
Font Name exception allows. Both were cut on 2026-10-24 to the characters used in
`index.html` and are licensed under SIL Open Font License 1.1; the licence texts are next
to them. Text added later in these fonts needs a fresh subset, or the missing characters
fall back to the system font.
