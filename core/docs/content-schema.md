# Content Schema

内容文件必须是 `schemaVersion: 1`。音频和图片路径相对调用方的 `public/`，例如 `audio/intro.wav`、`images/shot.png`。路径不允许绝对路径或 `..` 穿越段，schema 层与 `validate-deck.mjs` 都会拦截。

`slide.narration` 是 TTS 输入文本；音色、情绪、模型和采样参数不放在 slide 中，而由调用方选择的 TTS profile 统一提供。

## Slide types

| type | 用途 | 必需字段 | 可选字段 |
|---|---|---|---|
| `title` | 开场 | — | `body` |
| `text` | 解释与列表 | — | `body`, `bullets` |
| `overview` | 概览（1–4 列） | `stats`（≥1） | `callout` |
| `metrics` | 指标和结论（1–4 列） | `stats`（≥1） | `callout` |
| `diagram` | 流程或架构（1–5 节点） | `nodes`（≥1） | `callout` |
| `image` | 配图、截图、图表 | `image` | `callout` |
| `quote` | 单句观点 | `quote` 或 `body` | — |
| `closing` | 结尾和行动点 | `quote` | `subtitle` |

页面类型承诺一份内容：`overview` 没有 `stats`、`image` 没有 `image` 会直接校验失败，而不是渲染出一张结构合法但视觉空白的页。

`stats` 上限 4、`nodes` 上限 5，由最窄的输出目标（13.33 英寸 PPTX 宽屏画布）决定。两个渲染器都会按实际数量均分宽度，所以 2 个和 4 个 `stats` 都不会留下空列或溢出。

### `eyebrow`

`eyebrow` 只写语义标签（如 `INTRO`、`MAIN POINT`）。页码由渲染器按实际顺序生成，不要手写 `01 /`，否则增删页面后编号会错位。

## 图片页

```json
{
  "id": "visual",
  "type": "image",
  "title": "配图页标题",
  "image": {
    "src": "images/shot.png",
    "alt": "图片的无障碍描述，必填",
    "caption": "图注：数据来源或拍摄说明",
    "fit": "contain"
  }
}
```

支持 `.png`、`.jpg`、`.jpeg`、`.webp`。`alt` 必填，用于无障碍；PPTX 导出会写入 `altText`。`fit` 为 `contain`（默认，保持比例）或 `cover`（裁剪填满）。

## 主题与视觉

`theme` 的 7 个颜色语义在两个输出中完全一致：**`paper` 是背景，`ink` 是前景**。`accent3` 是引述与结尾页的强调色。深色主题只需把 `paper` 设为深色、`ink` 设为浅色，渲染器不含任何硬编码颜色。

`brand` 控制视频页眉和 PPTX 公司元数据，默认 `Presentation Builder`；`locale` 控制 PPTX 语言标记，默认 `en-US`。示例和模板显式设置各自的值，因此调用方无需修改渲染器来替换品牌或语言。

`style` 字段全部生效：

| 字段 | 作用 | 影响范围 |
|---|---|---|
| `density` | 间距与字号缩放（`editorial`/`information`/`balanced`/`airy`） | 视频 + PPTX 字号 |
| `motion` | 入场动画的 spring 配置与位移（`restrained`/`measured`/`subtle`/`energetic`） | 仅视频（PPTX 无动画） |
| `cornerRadius` | 圆角 | 视频 |
| `headingFont` / `bodyFont` | 字体 | 视频 + PPTX |
| `backgroundPattern` | 背景纹理（`grid`/`rules`/`none`） | 视频 |
| `mood` | 语义标签，输出为 `data-mood` 属性与 PPTX `category` | 供下游 CSS/元数据消费 |

`density` 与 `motion` 的具体数值定义在 `core/src/domain.ts` 的 `DENSITY_SCALES` 和 `MOTION_CONFIGS`，视频端注入为 `--gap-scale`/`--text-scale` CSS 变量，PPTX 端按同一张表缩放字号，因此两个输出不会各自漂移。

字体只能使用渲染机与阅读机上已安装的字体：工程不加载 webfont，缺失字体会静默回退到系统 sans-serif。

### 分章节换色

`slide.themeOverride` 接受 `theme` 的任意子集，只影响该页：

```json
{ "id": "chapter-2", "type": "title", "title": "第二章", "themeOverride": { "paper": "#2b1f14", "accent3": "#ff7043" } }
```

未指定的键继续继承 deck 级 `theme`。

### 调色板预设

`core/profiles/theme.*.json` 提供可直接套用的完整调色板（`ink-paper-rust`、`ink-paper-teal`、`neutral-accent`、`ink-dark`）。`lusine-meta ingest` 会在分析资料后给出对应预设路径，用 `apply-theme` 落地：

```powershell
uv run lusine-meta apply-theme --preset core/profiles/theme.ink-paper-rust.json --presentation work/my-topic/presentation.json
```

该命令只覆盖 `theme` 与预设声明的 `style` 键，调用方自定义的字体等值会保留。

## Captions

字幕使用 Remotion `Caption` 形状，时间单位是毫秒：

```json
{
  "text": "旁白的一句字幕",
  "startMs": 0,
  "endMs": 2400,
  "timestampMs": null,
  "confidence": null
}
```

字幕属于 slide，而不是渲染器中的字符串常量。每条字幕必须满足 `endMs > startMs`；校验会拒绝相互重叠、超出音频时长的字幕，以及无音频页中超出 `minDurationSec` 的字幕。目前需要手工填写时间轴；未来可以由 ASR adapter 自动写入同一字段。

## 校验行为

`npm run check` 分两阶段报错：先用 schema 检查结构（失败即停止，避免资产噪音掩盖根因），再检查磁盘资产与 manifest 一致性。

- 参数名拼错会直接报错并给出建议，不会静默回退到内置示例。
- manifest 中未被任何 slide 引用的条目只警告，不失败（多 deck 共用一份 manifest 是合法用法）。
- 一页可以只有 `captions` 而没有 `audio`：页面时长由 `minDurationSec` 决定，字幕按帧计时照常显示，但其 `endMs` 不得超过该时长。
