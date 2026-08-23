# Architecture

## External seam

调用方只需要提供两份数据：

1. `Presentation`：主题、slide、视觉语义、旁白路径和字幕。
2. `AudioManifest`：音频路径、真实时长、采样率、声道和 hash。

`src/domain.ts` 是唯一 schema seam。Remotion、PPTX 和未来的 HTML/图片导出都消费这个 seam，不直接读取主题专属字段。

TTS 是一个独立的 Python/uv seam：`content/tts-profile.json` 提供全局确定性 profile，`uv run lusine-meta tts-plan` 输出带 hash 的 request plan，外部 Qwen3-TTS 或其他适配器只负责执行计划并产出音频。这样渲染器不会在每个 slide 中隐式选择音色或情绪。

## Modules

### Domain module

`src/domain.ts` 用 Zod 解析并补齐默认值。它拒绝未知结构中的关键错误，例如非法颜色、重复格式不正确的 ID 和非正时长。

### Timeline module

`src/timeline.ts` 根据 `audio.durationSec + tailFrames` 计算每个 slide 的帧数；没有旁白时退回 `minDurationSec`。因此旁白变化不会要求手动修改渲染组件。

### Presentation renderer

`src/Presentation.tsx` 只负责把语义化 slide 映射到通用版式。它包含固定版本的人形 presenter、字幕和音频可视化，但不包含任何业务主题。presenter 的身份由根级 `presenterProfile` 决定，不能按页漂移。

### Output adapters

- Remotion adapter：浏览器预览、still 和 MP4。
- PPTX adapter：PptxGenJS，用相同的 slide 数据生成可编辑演示稿。
- TTS adapter：不进入核心；任何 TTS 工具只需要产出音频文件和 manifest。

这种拆分让变化保持局部：换主题只改 `content/`，换 TTS 只改音频适配器，换输出格式只新增 adapter。

## Render contract

```text
content/presentation.json
        |
        v
validate-deck <---- public/audio + audio-manifest
        |
        +--> PPTX adapter --> out/<id>.pptx
        |
        +--> Remotion adapter --> out/<id>.mp4
```

`npm run render` 会先刷新 audio manifest，再执行结构校验，最后才启动 Remotion。任何缺音频、时长无效或 slide 结构错误都会在编码前失败。
