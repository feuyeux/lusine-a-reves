# Lusine a Reves Meta Builder

用一份 `presentation.json` 生成同一主题的：

- 可编辑 PPTX 演示稿
- Remotion MP4 视频
- 旁白、字幕和音频时间轴

`core/` 是可复用的生成资产，`example/` 是仅用于展示能力的 `signals-systems-stories` 示例。制作新主题时不要修改 `example/`。

![当前示例预览](example/preview-opening.png)

## 1. 安装

需要 Node.js 18+、Python 3.10+、[uv](https://docs.astral.sh/uv/)、FFmpeg 和 FFprobe。

```powershell
npm install
uv sync
uv run lusine-meta doctor
```

## 2. 运行仓库示例

示例已经带有音频，不需要安装 TTS 模型：

```powershell
npm run check
npm run dev
```

Remotion Studio 打开后选择 `Presentation`。示例输入在：

```text
example/content/presentation.json
example/content/audio-manifest.json
example/public/audio/
```

导出示例：

```powershell
npm run export:pptx
npm run render
```

默认输出：

```text
out/signals-systems-stories.pptx
out/signals-systems-stories.mp4
```

`out/` 是被 Git 忽略的本地生成目录。当前完整验证视频位于 `out/migration-check/signals-systems-stories.mp4`。

## 3. 制作新主题

最省事的方式不是从零设计 JSON，而是只填写模板里的值。工程已经提供字段名、页面类型、默认主题和命令所需的结构。

### 3.1 复制模板

在仓库根目录执行：

```powershell
New-Item -ItemType Directory -Force work/my-topic/public/audio
Copy-Item templates/presentation.template.json work/my-topic/presentation.json
```

模板文件是 [`templates/presentation.template.json`](templates/presentation.template.json)。只需要把模板中的中文占位内容替换成自己的内容；字段名、颜色、页面类型和目录结构先保持不变。

复制后得到：

```text
work/my-topic/
├── presentation.json         从模板复制，只修改 value
└── public/
    └── audio/                放入或生成旁白
```

`work/my-topic` 不要求加入仓库，也可以换成任意目录名或绝对路径。

### 3.2 只填写这些 value

模板中的 key 已经准备好，用户主要填写以下 value：

| key | 用户填写什么 | 示例 |
| --- | --- | --- |
| `id` | 主题的英文短名 | `robotics-in-2026` |
| `title` | 演讲标题 | `2026 年机器人趋势` |
| `subtitle` | 一句话副标题 | `从实验室走向真实世界` |
| `author` | 作者或团队名 | `Acme Research` |
| `slides[].title` | 每页标题 | `三个变化正在发生` |
| `slides[].subtitle` | 每页解释 | `它们会改变产品设计` |
| `slides[].body` | 正文页内容 | 一段解释性文字 |
| `slides[].stats` | 概览页的三个事实 | 数值、标签、说明 |
| `slides[].callout` | 页面结论 | `关键不是规模，而是反馈速度` |
| `slides[].narration` | 这一页完整旁白 | 一段自然语言 |
| `slides[].audio` | 音频文件名 | `audio/opening.wav` |

模板默认包含 `title`、`overview`、`closing` 三页。需要更多页面时，复制一个 slide 对象，修改 `id`、`type` 和其中的 value 即可。支持的页面类型见下一节。

必须注意：

- `schemaVersion` 必须是 `1`。
- `id` 只能使用小写字母、数字和连字符，例如 `my-topic`。
- 每个 slide 的 `id` 必须唯一。
- `audio` 是相对于该主题 `public/` 的路径，所以写 `audio/opening.wav`，不要写 `public/audio/opening.wav`。
- `narration` 是 TTS 文本；如果已有外部音频，也可以只提供 `audio`。
- 修改旁白或音频后，必须重新生成 `audio-manifest.json`。

### 3.3 选择页面类型

每个 slide 都需要 `id`、`type` 和 `title`：

| `type` | 适合内容 | 额外字段 |
| --- | --- | --- |
| `title` | 开场 | `body` |
| `text` | 正文、说明、列表 | `body`, `bullets` |
| `overview` | 三列概览 | `stats`, `callout` |
| `metrics` | 指标和结论 | `stats`, `callout` |
| `diagram` | 流程或架构 | `nodes`, `callout` |
| `quote` | 重点引述 | `quote` |
| `closing` | 结尾页 | `quote`, `subtitle` |

可选通用字段：`eyebrow`、`subtitle`、`body`、`bullets`、`quote`、`callout`、`narration`、`audio`、`minDurationSec`、`captions`。

### 3.4 准备旁白音频

有两种方式，二选一。

#### 方式 A：使用已有音频

把音频放到：

```text
work/my-topic/public/audio/<slide-id>.wav
```

并在对应 slide 中填写：

```json
"audio": "audio/opening.wav"
```

支持 `.wav`、`.mp3` 和 `.m4a`。音频必须有有效时长和可听电平。

#### 方式 B：使用工程的 TTS 命令

Windows SAPI 适合快速生成：

```powershell
npm run voiceover -- `
  --presentation work/my-topic/presentation.json `
  --profile core/profiles/tts-profile.windows-sapi.json `
  --public-dir work/my-topic/public
```

Edge TTS 使用：

```powershell
npm run voiceover -- `
  --presentation work/my-topic/presentation.json `
  --profile core/profiles/tts-profile.edge-tts.json `
  --public-dir work/my-topic/public
```

CosyVoice2 适合高质量旁白，但需要在仓库外准备模型、runtime 和 zero-shot prompt audio。Windows 下通过 WSL2 执行：

```powershell
npm run voiceover -- `
  --presentation work/my-topic/presentation.json `
  --profile core/profiles/tts-profile.cosyvoice2.json `
  --public-dir work/my-topic/public
```

模型权重和 runtime 不放进仓库。`voice`、speaker、情绪、采样参数统一由 profile 管理，不要写到 slide 里。

Qwen3-TTS 当前生成的是确定性请求计划，模型推理由外部 adapter 完成：

```powershell
uv run lusine-meta tts-plan `
  --presentation work/my-topic/presentation.json `
  --profile core/profiles/tts-profile.qwen3.json `
  --output out/my-topic/tts-plan.json
```

外部 adapter 完成音频后，将文件放入 `work/my-topic/public/audio/`，继续执行下面的 manifest 和导出步骤。

### 3.5 生成 manifest、校验并导出

这是新主题的完整命令顺序：

```powershell
npm run manifest -- `
  --presentation work/my-topic/presentation.json `
  --manifest work/my-topic/audio-manifest.json `
  --public-dir work/my-topic/public

npm run check -- `
  --presentation work/my-topic/presentation.json `
  --manifest work/my-topic/audio-manifest.json `
  --public-dir work/my-topic/public

npm run export:pptx -- `
  --presentation work/my-topic/presentation.json `
  --manifest work/my-topic/audio-manifest.json `
  --public-dir work/my-topic/public `
  --output-dir out/my-topic

npm run render -- `
  --presentation work/my-topic/presentation.json `
  --manifest work/my-topic/audio-manifest.json `
  --public-dir work/my-topic/public `
  --output-dir out/my-topic
```

最终得到：

```text
out/my-topic/
├── my-topic.pptx
└── my-topic.mp4
```

`check` 会检查 JSON、页面类型、音频路径、manifest 和音频时长。`render` 会在编码前再次刷新 manifest 和校验，因此旁白时长会自动决定视频页面长度。

## 字幕

字幕写在 slide 的 `captions` 数组中，时间单位是毫秒：

```json
"captions": [
  {
    "text": "这一句字幕",
    "startMs": 0,
    "endMs": 2400,
    "timestampMs": null,
    "confidence": null
  }
]
```

没有字幕时仍可生成视频；设置 `"showCaptions": false` 可以关闭字幕显示。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 预览默认 `example` 示例 |
| `npm run voiceover` | 按 profile 生成旁白 |
| `npm run manifest` | 读取音频并生成 manifest |
| `npm run check` | 校验主题和音频 |
| `npm run export:pptx` | 导出演示稿 |
| `npm run render` | 导出 MP4 |
| `npm run lint` | ESLint 和 TypeScript 检查 |
| `npm test` | Node 测试 |
| `uv run pytest` | Python 测试 |

所有内容生成命令都可以使用：

```text
--presentation <path>   内容 JSON
--manifest <path>       音频 manifest
--public-dir <path>     主题的 public 目录
--profile <path>        TTS profile
--output-dir <path>     输出目录
```

## 代码位置

- [`core/src/domain.ts`](core/src/domain.ts)：内容 schema
- [`core/src/Presentation.tsx`](core/src/Presentation.tsx)：通用页面渲染器
- [`core/src/timeline.ts`](core/src/timeline.ts)：音频时间轴
- [`core/scripts/validate-deck.mjs`](core/scripts/validate-deck.mjs)：主题校验
- [`core/scripts/export-pptx.mjs`](core/scripts/export-pptx.mjs)：PPTX 生成
- [`core/scripts/render.mjs`](core/scripts/render.mjs)：MP4 生成
- [`core/docs/content-schema.md`](core/docs/content-schema.md)：完整字段说明
- [`core/docs/tts.md`](core/docs/tts.md)：TTS 约束和运行边界

## 发布前检查

```powershell
npm run lint
npm test
uv run pytest
npm run check
```

本仓库不包含模型权重、TTS runtime、API key 或个人参考音频。当前未声明开源许可证，发布 GitHub 前请根据实际授权补充 `LICENSE`。
