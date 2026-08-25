# Topic Intent Intake

新主题不是从标题直接进入 `presentation.json`。先完成一份 `topic-intent` brief，确认后再开始内容创作。

```powershell
uv run lusine-meta intake --brief work/my-topic/topic-brief.json
```

intake 的字段分为两级：

**必答（12 项，缺失即阻塞内容创作）**：主题对象、观众目标、受众、范围与排除项、必须出现的实体、中心论点、语气、语言、页数、时长、交付物、约束。这些是工程无法从主题名推断的事实。

**可选（4 项，留空不阻塞）**：视觉方向、旁白音色、情绪基调、语速节奏。它们能让结果更贴合预期，但不改变主题的事实边界。

只想快速确认必答项时用 `--minimal`：

```powershell
uv run lusine-meta intake --brief work/my-topic/topic-brief.json --minimal
```

已有 draft 会只询问缺失项；用户否定最终摘要后，可以指定需要修改的字段，直到输入 `yes`。

## 旁白偏好只是记录

`voiceCharacter`、`voiceEmotion`、`voicePace` **仅作为意图记录**，不会改变任何合成参数。实际音色、情绪与语速由 `--profile` 选择的 TTS profile 固定决定（见 [`tts.md`](tts.md)）。`tts-plan` 会把它们连同一条 `note` 写进 `voiceIntent`，用于审计追溯，而不是驱动模型。想真正改变声音，请更换或新增 profile。

brief 的最小状态是：

```json
{
  "schemaVersion": 1,
  "kind": "topic-intent",
  "status": "confirmed"
}
```

只填写答案文件不等于确认。自动化调用必须同时传入 `--yes`：

```powershell
uv run lusine-meta intake `
  --brief work/my-topic/topic-brief.json `
  --answers work/my-topic/answers.json `
  --yes
```

在构建新主题时，将 brief 传给校验命令：

```powershell
npm run check -- `
  --presentation work/my-topic/presentation.json `
  --manifest work/my-topic/audio-manifest.json `
  --public-dir work/my-topic/public `
  --brief work/my-topic/topic-brief.json
```

`--brief` 只接受 `schemaVersion: 1`、`kind: "topic-intent"` 且 `status: "confirmed"` 的文件。旧 example 不传该参数时保持兼容。

## 资料驱动视觉

`--source` 会把资料摘要写进 brief 的 `materials`，并在 `visualDirection` 为空时填入一条基于资料信号的建议。资料分析同时给出可直接套用的调色板预设：

```powershell
uv run lusine-meta ingest --source "C:\资料\主题全记录.md" --output work/my-topic/material-analysis.json
uv run lusine-meta apply-theme --preset core/profiles/theme.ink-paper-rust.json --presentation work/my-topic/presentation.json
```

资料读取支持 UTF-8（含 BOM）、GB18030 和 Big5；二进制文件会被明确拒绝，而不是解码成乱码。风格信号采用关键词密度阈值，单次提及不会左右整体视觉方向。
