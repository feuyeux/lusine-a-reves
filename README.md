# Lusine a Reves Meta Builder

一个与主题无关的演示稿生成器：同一份结构化内容可以输出 PPTX、Remotion 播放视频和带旁白的 MP4。核心工程不包含任何特定仓库、模型或领域知识；`content/presentation.json` 只是一个可替换的示例输入。示例内容默认带有 Windows SAPI 旁白，渲染器会拒绝纯静音音频。

## 快速开始

需要 Node.js 18+、npm、Python 3.10+、uv 和 FFmpeg。自定义主题可以不提供音频并生成静音预览；只要页面声明了 `audio`，生成和渲染都会要求真实可听的音频。

```powershell
npm install
uv sync
npm run check
npm test
uv run pytest
npm run voiceover -- --force
npm run manifest
npm run export:pptx
npm run dev
```

生成 MP4：

```powershell
npm run render
```

输出：

- `out/<presentation-id>.pptx`：可编辑演示稿
- `out/<presentation-id>.mp4`：Remotion 播放视频

最终 MP4 会经过 FFprobe 流检查和 FFmpeg 电平检查；`node scripts/validate-media.mjs out/<presentation-id>.mp4` 可单独复核。

## 使用任意内容文件

默认命令读取 `content/presentation.json`，但构建器也可以直接接收另一份内容文件。音频资产仍放在当前工程的 `public/` 下，便于 Remotion 在浏览器和渲染器中使用：

```powershell
node scripts/validate-deck.mjs --presentation path/to/topic.json --manifest path/to/topic-audio.json
node scripts/export-pptx.mjs --presentation path/to/topic.json --manifest path/to/topic-audio.json --output-dir out/topic
node scripts/render.mjs --presentation path/to/topic.json --manifest path/to/topic-audio.json --output-dir out/topic
```

Linux/macOS 使用同样的命令，只需把路径改为 POSIX 格式。通过 npm 传参时，在脚本名后加 `--`，例如 `npm run render -- --presentation path/to/topic.json`。`--manifest` 缺省为 `content/audio-manifest.json`，`--output-dir` 缺省为 `out`。

## 使用自己的主题

只需要修改 `content/presentation.json`。外部接口包括：

- `theme`：背景、正文、面板和强调色
- `slides[]`：`title`、`text`、`overview`、`metrics`、`diagram`、`quote`、`closing`
- `stats[]`：指标卡片
- `nodes[]`：流程图节点
- `bullets[]` / `body` / `quote`：正文内容
- `audio`：相对 `public/` 的音频路径，可选
- `captions[]`：Remotion `Caption` 结构的 JSON 字幕
- `presenter`：`none`、`side` 或 `corner`
- `minDurationSec`：没有旁白时的最短场景时长

示例：

```json
{
  "id": "my-topic",
  "type": "diagram",
  "eyebrow": "01 / ARCHITECTURE",
  "title": "从输入到输出",
  "nodes": [
    { "label": "INPUT", "sub": "source", "color": "#54d6c5" },
    { "label": "PROCESS", "sub": "engine", "color": "#7da8ff" },
    { "label": "OUTPUT", "sub": "artifact", "color": "#ffbf78" }
  ],
  "minDurationSec": 7,
  "presenter": "side"
}
```

## 音频时间轴

不要在渲染器里手填旁白时长。把音频放到 `public/audio/`，在 slide 中填写 `audio: "audio/intro.wav"`，然后运行：

```powershell
npm run manifest
npm run check
npm run render
```

`build-audio-manifest.mjs` 使用 FFprobe 记录真实时长、采样率、声道数和 SHA-256。时间轴由音频时长加 `tailFrames` 自动计算，避免旁白变更后出现静音空档或场景截断。

`ffprobe` 需要在 PATH 中可用；如果系统安装位置不同，可以设置 `FFPROBE_BIN`。PowerShell 示例：`$env:FFPROBE_BIN = "C:\\ffmpeg\\bin\\ffprobe.exe"`。没有音频时 manifest 为空，不影响静音预览和 PPTX 导出。

## 确定性 TTS

TTS 不在渲染器中隐式调用。先用 `uv` 生成固定参数的请求计划：

```powershell
uv run lusine-meta tts-plan
```

`content/tts-profile.json` 是全局音色和情绪配置，当前 Windows 默认使用固定的 `Microsoft Huihui Desktop`、`rate=-1`、`volume=100` 和 WAV 输出。每页只能提供 `narration`，不能覆盖 voice、emotion、style、seed 或采样参数。`content/tts-profile.edge-tts.json` 和 `content/tts-profile.qwen3.json` 是显式替代 profile；Qwen3-TTS 计划会写入 profile/request hash，方便发现模型、参数或台词变更。

具体的模型权重和 PyTorch/MLX runtime 放在工程外；生成完成后把音频放入 `public/audio/`，再运行 manifest、校验和渲染。完整约束见 [`docs/tts.md`](docs/tts.md)。

## 适配器设计

核心只消费 `Presentation`、`AudioManifest` 和主题，不绑定 TTS 厂商。TTS、ASR、图片、数字人或远程素材都应作为外部适配器：先产出 `public/` 资产和 manifest，再交给渲染器。

默认数字人是固定版本的 `lina-tech-v1` 人形 presenter：统一脸型、发型、耳朵、眼睛高光、鼻子、嘴唇、颈部、肩部和服装细节。音频只驱动嘴型和声波，不改变身份、音色或视觉设计；没有音频时使用低幅度预览动画。替换数字人时应增加新的 presenter profile/adapter，而不是在各页临时修改。

## 工程边界

- `src/domain.ts`：唯一内容 schema 和外部接口
- `src/timeline.ts`：音频事实驱动的时间轴
- `src/Presentation.tsx`：PPT 式视频渲染器
- `scripts/build-audio-manifest.mjs`：音频资产扫描
- `scripts/validate-deck.mjs`：结构和资产校验
- `scripts/export-pptx.mjs`：PPTX 导出适配器
- `scripts/render.mjs`：manifest、校验、Remotion 渲染编排
- `scripts/lib.mjs`：跨平台 CLI 参数、路径和 JSON 输入
- `python/lusine_builder/`：uv 管理的确定性 TTS 计划和跨平台工具
- `content/`：主题输入，不放模型权重和私有凭证

## TTS、ASR 与数字人适配

核心工程不绑定某个 TTS、ASR 或数字人供应商。一个外部适配器可以按下面的顺序工作：

1. 运行 `uv run lusine-meta tts-plan`，固定所有页的 voice、style、emotion、seed 和采样参数。
2. 根据 plan 中的 `slide.narration` 生成 `public/audio/<slide-id>.<ext>`。
3. 根据音频生成字幕，写入对应 slide 的 `captions` 数组。
4. 运行 `node scripts/build-audio-manifest.mjs`，让时间轴使用真实音频时长。
5. 运行校验、PPTX 导出和视频渲染。

因此可以接入本机表现良好的 TTS 库、云端 TTS、Whisper 类 ASR 或真实数字人服务；它们只需要产出工程约定的资产和 JSON，不需要修改渲染器。

详细 schema 和扩展方式见 [`docs/architecture.md`](docs/architecture.md) 与 [`docs/content-schema.md`](docs/content-schema.md)。
