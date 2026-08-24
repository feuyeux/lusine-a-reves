# Content Schema

内容文件必须是 `schemaVersion: 1`。音频路径相对调用方的 `public/`，例如 `audio/intro.wav`。

`slide.narration` 是 TTS 输入文本；音色、情绪、模型和采样参数不放在 slide 中，而由调用方选择的 TTS profile 统一提供。

## Slide types

| type | 用途 | 主要字段 |
|---|---|---|
| `title` | 开场 | `body` |
| `text` | 解释与列表 | `body`, `bullets` |
| `overview` | 三列概览 | `stats`, `callout` |
| `metrics` | 指标和结论 | `stats`, `callout` |
| `diagram` | 流程或架构 | `nodes`, `callout` |
| `quote` | 单句观点 | `quote` |
| `closing` | 结尾和行动点 | `quote`, `subtitle` |

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

字幕属于 slide，而不是渲染器中的字符串常量。未来可以由 ASR adapter 自动写入同一字段。
