# Architecture

## External seam

调用方只需要提供两份数据：

1. `Presentation`：主题、slide、视觉语义、旁白路径和字幕。
2. `AudioManifest`：音频路径、真实时长、采样率、声道和 hash。

`core/src/domain.ts` 是唯一 schema seam。Remotion、PPTX 和未来的 HTML/图片导出都消费这个 seam，不直接读取主题专属字段。

TTS 是一个独立的 Python/uv seam：调用方选择的 profile 提供全局确定性参数，`uv run lusine-meta tts-plan` 输出带 hash 的 request plan，外部 Qwen3-TTS 或其他适配器只负责执行计划并产出音频。

## Modules

### Domain module

`core/src/domain.ts` 用 Zod 解析并补齐默认值。它拒绝未知结构中的关键错误，例如非法颜色、重复格式不正确的 ID 和非正时长。

### Timeline module

`core/src/timeline.ts` 根据 `audio.durationSec + tailFrames` 计算每个 slide 的帧数；没有旁白时退回 `minDurationSec`。因此旁白变化不会要求手动修改渲染组件。

### Presentation renderer

`core/src/Presentation.tsx` 只负责把语义化 slide 映射到通用版式，包含字幕和音频播放，但不包含任何业务主题或人物逻辑。

### Output adapters

- Remotion adapter：浏览器预览、still 和 MP4。
- PPTX adapter：PptxGenJS，用相同的 slide 数据生成可编辑演示稿。
- TTS adapter：不进入核心；任何 TTS 工具只需要产出音频文件和 manifest。

这种拆分让变化保持局部：换主题只改调用方内容目录，换 TTS 只改音频适配器，换输出格式只新增 adapter。

## Render contract

```text
调用方 presentation.json
        |
        v
validate-deck <---- 调用方 public/audio + audio-manifest
        |
        +--> PPTX adapter --> out/<id>.pptx
        |
        +--> Remotion adapter --> out/<id>.mp4
```

`npm run render` 会先刷新 audio manifest，再执行结构校验，最后才启动 Remotion。任何缺音频、时长无效或 slide 结构错误都会在编码前失败。

## 单一事实来源

跨输出的规则只在 `core/src/domain.ts` 定义一次，其它消费者一律导入，不再各写一份：

| 常量 | 含义 | 消费者 |
| --- | --- | --- |
| `PresentationSchema` | 全部结构规则 | Remotion 渲染器、`validate-deck.mjs` |
| `MAX_STATS` / `MAX_DIAGRAM_NODES` | 单行布局容量 | schema 校验、两个渲染器的排版 |
| `DENSITY_SCALES` | `style.density` 的间距/字号系数 | `Presentation.tsx` 注入 CSS 变量、`export-pptx.mjs` 缩放字号 |
| `MOTION_CONFIGS` | `style.motion` 的 spring 参数 | `Presentation.tsx` |
| `SLIDE_TYPES` | 合法页面类型 | schema 校验 |

Node 22.18.0+ 可直接 `import` TypeScript，所以 `.mjs` 脚本能复用同一份 schema。`validate-deck.mjs` 因此只负责 schema 无法判断的部分：磁盘上的资产是否存在、manifest 是否与 deck 一致、相邻字幕是否重叠，以及无音频页的字幕是否超出页面时长。

`styles.css` 不含任何硬编码颜色或密度数值——颜色全部来自 `--ink`/`--paper`/`--muted`/`--accent*`/`--panel`，密度来自 `--gap-scale`/`--text-scale`。这条约束由测试 `customization.test.mjs` 与 `cli-contract.test.mjs` 守护。

## 校验分层

`validate-deck.mjs` 分两个阶段并分别报错：

1. **结构阶段** — 委托给 Zod schema。失败即短路退出，因为在结构错误的 deck 上做资产检查只会产生淹没根因的噪音。
2. **资产阶段** — 文件是否存在、manifest 是否过期、字幕是否越界。

manifest 中未被任何 slide 引用的条目只是警告（多个 deck 共用一份 manifest 是合法用法），不会让构建失败。
