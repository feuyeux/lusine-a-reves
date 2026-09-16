# Deterministic TTS

示例旁白默认按 `core/profiles/tts-profile.json` 生成；新内容应通过 `--profile` 显式指定 profile。当前 Windows 默认使用系统 `Microsoft Huihui Desktop`（System.Speech），固定语速、音量和 WAV 输出。profile 是全局事实来源，禁止在 slide 中写 voice、emotion、style、seed 或 sampling 参数。新主题应先确认 topic brief，再用 `tts-plan --brief ...` 生成整场演示的请求计划；不会按页面重新选择。

brief 里的 `voiceCharacter` / `voiceEmotion` / `voicePace` 是**记录性意图，不参与合成**。它们会被写入 plan 的 `voiceIntent`（附带一条说明 note）以保留审计线索，但真正决定声音的始终是 profile 中的 `voice`、`emotion`、`style`、`rate` 等固定字段。要改变实际音色，必须更换 profile 或新增一个 profile，而不是修改 brief。

默认本机命令：

```powershell
npm run voiceover -- --force
npm run manifest
npm run render
```

`npm run voiceover` 会逐页生成并用 FFmpeg 检查音频电平；纯静音或无效文件会立即失败。Windows SAPI 使用固定的 `Microsoft Huihui Desktop`、`rate=-1`、`volume=100`，并会在非 Windows 主机上明确拒绝运行。Edge TTS 和 Qwen3-TTS 使用下方独立、固定版本的 installer/executor，而不是混入工程的 `uv` 开发环境。

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

模型权重和 Qwen3-TTS runtime 不放进本仓库。工程先产生可审计的请求计划：

```powershell
uv sync
uv run lusine-meta tts-plan
```

输出文件是 `out/tts/plan.json`。每个请求包括 profile hash、请求 hash、slide id、台词、固定 voice/style 和确定性的 `max_new_tokens`。仓库内 `qwen3_adapter.py` 会逐条验证并消费 requests，随后把音频写入调用方的 `public/audio/<slide-id>.wav`：

```powershell
npm run install:qwen3-tts
npm run voiceover:qwen3 -- --plan out/tts/plan.json --public-dir work/my-topic/public --device cuda:0
npm run manifest
npm run check
npm run render
```

`install:qwen3-tts` 固定 `qwen-tts==0.1.1`、`torch==2.7.1+cu126` 和同版本 `torchaudio`，默认放入 `.tts-runtime/qwen3-tts/`。执行器使用官方 `Qwen3TTSModel.generate_custom_voice`，固定 `do_sample=false`、`subtalker_dosample=false`、`top_p=1.0`、`temperature=0.0`、`repetition_penalty=1.0` 与 seed；任何 hash、profile、设备、speaker 或采样率不符合契约的情况都会失败。

不要让 adapter 在每页循环里重新选择 speaker、随机 instruct、开启 sampling、依赖当前时间命名文件或复用未清空的临时目录。若模型或 runtime 实际不支持某个确定性参数，adapter 必须失败并报告，不应静默删除该参数。

## Edge TTS

```powershell
npm run install:edge-tts
npm run voiceover:edge -- --presentation work/my-topic/presentation.json --profile core/profiles/tts-profile.edge-tts.json --public-dir work/my-topic/public
```

`install:edge-tts` 固定 `edge-tts==7.2.8` 于 `.tts-runtime/edge-tts/`。`voiceover:edge` 通过该 Python runtime 调用 Microsoft 在线服务，随后用 FFmpeg 固定输出为 24 kHz、单声道、PCM 16-bit WAV，并运行可听度检查。音色清单和服务可用性随服务端变化；此路线需要网络，不能作为离线依赖。

## CosyVoice2 配置

`core/profiles/tts-profile.cosyvoice2.json` 只包含可共享的模型和生成参数，不包含任意机器的绝对路径。Linux/WSL 调用前必须设置 `COSYVOICE_ROOT`，或在调用方自己的 profile 中设置 `runtimeRoot`。Windows/WSL2 还必须通过 `COSYVOICE_PYTHON_WSL` 或该调用方 profile 的 `wslPython` 选择 adapter Python。缺少这些配置会失败并说明缺少哪一项，绝不会回退到某个驱动器或 `/mnt` 目录。

## 运行时边界

`uv` 管理本工程的 Python 工具和测试；Qwen3-TTS 的 PyTorch、模型权重和平台后端可以由外部环境提供。这样 Windows CPU、macOS MLX 和 Linux CUDA 可以各自使用已验证的 runtime，同时共享相同的 profile 与 request plan。

检查本机工具链：

```powershell
uv run lusine-meta doctor
```

该命令只检查 `uv`、Node、npm、FFmpeg 和 FFprobe，不会下载模型或修改系统环境。
