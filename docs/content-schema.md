# Content Schema

`content/presentation.json` 必须是 `schemaVersion: 1`。所有路径都相对仓库根目录描述；音频路径相对 `public/`，例如 `audio/intro.wav`。

根级 `presenterProfile` 固定整套视频中的数字人身份，例如 `lina-tech-v1`。slide 只能选择 `presenter: none | side | corner`，不能按页替换人物。

`slide.narration` 是 TTS 输入文本；音色、情绪、模型和采样参数不放在 slide 中，而由 `content/tts-profile.json` 统一提供。这样一套演示稿不会因循环顺序或页级默认值改变播报声音。

## Slide types

| type | 用途 | 主要字段 |
|---|---|---|
| `title` | 开场 | `body`, `presenter` |
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
