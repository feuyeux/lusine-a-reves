# Deterministic TTS

示例旁白默认按 `core/profiles/tts-profile.json` 生成；新内容应通过 `--profile` 显式指定 profile。当前 Windows 默认使用系统 `Microsoft Huihui Desktop`（System.Speech），固定语速、音量和 WAV 输出。profile 是全局事实来源，禁止在 slide 中写 voice、emotion、style、seed 或 sampling 参数。

默认本机命令：

```powershell
npm run voiceover -- --force
npm run manifest
npm run render
```

`npm run voiceover` 会逐页生成并用 FFmpeg 检查音频电平；纯静音或无效文件会立即失败。Windows SAPI 使用固定的 `Microsoft Huihui Desktop`、`rate=-1`、`volume=100`。Edge TTS 可通过 `--profile core/profiles/tts-profile.edge-tts.json` 显式选择；Qwen3-TTS 使用 `core/profiles/tts-profile.qwen3.json` 和 `uv run lusine-meta tts-plan`，需要外部已验证的模型 runtime。

Qwen3-TTS profile 对齐 `hello-acoustics` 中已经验证过的路线：

- provider：`qwen3-tts`
- model：`Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice`
- 中文 speaker：`serena`
- language：`Chinese` / `zh`
- 固定情绪：`neutral`
- 固定指令：`语速适中，发音清晰，语气专业自然。`
- `do_sample=false`
- `subtalker_dosample=false`
- `repetition_penalty=1.0`
- `temperature=0.0`、`topP=1.0`
- 24 kHz、单声道、WAV

模型权重和 Qwen3-TTS runtime 不放进本仓库。工程只负责产生可审计的请求计划：

```powershell
uv sync
uv run lusine-meta tts-plan
```

输出文件是 `out/tts/plan.json`。每个请求包括 profile hash、请求 hash、slide id、台词、固定 voice/style 和确定性的 `max_new_tokens`。外部 Qwen3-TTS adapter 应逐条消费 requests，并把音频写入调用方的 `public/audio/<slide-id>.wav`，随后运行：

```powershell
npm run manifest
npm run check
npm run render
```

不要让 adapter 在每页循环里重新选择 speaker、随机 instruct、开启 sampling、依赖当前时间命名文件或复用未清空的临时目录。若模型或 runtime 实际不支持某个确定性参数，adapter 必须失败并报告，不应静默删除该参数。

## 运行时边界

`uv` 管理本工程的 Python 工具和测试；Qwen3-TTS 的 PyTorch、模型权重和平台后端可以由外部环境提供。这样 Windows CPU、macOS MLX 和 Linux CUDA 可以各自使用已验证的 runtime，同时共享相同的 profile 与 request plan。

检查本机工具链：

```powershell
uv run lusine-meta doctor
```

该命令只检查 `uv`、Node、npm、FFmpeg 和 FFprobe，不会下载模型或修改系统环境。
