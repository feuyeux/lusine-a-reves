# Maintenance Lessons

本文记录本轮对通用演示生成器的审计、修复、TTS 扩展和课程媒体批量生成经验。目标是让后续维护者知道哪些约束必须留在核心、哪些状态只是本地生成物，以及如何避免“单机可跑、换主题就漂移”。

## 1. 单一 schema seam 必须是真正的单一事实来源

`core/src/domain.ts` 同时服务于 Remotion、PPTX、CLI 校验和测试。跨输出规则应只在这里声明一次：

- 合法 slide type；
- theme 与 style 字段；
- 布局容量；
- caption 区间；
- brand、locale 和默认值；
- public-relative 资产路径。

脚本层只处理 schema 无法知道的磁盘事实，例如文件存在、manifest 与 deck 一致、字幕未超出实际音频或无音频页面时长。

经验：如果 Remotion、PPTX、validator 各自手写一套类型或密度表，它们一定会漂移。测试应双向验证 enum 与配置表覆盖完全一致，并禁止 CSS/adapter 私藏硬编码主题值。

## 2. 新检出必须能直接 lint/test

曾经的失败模式是：`example/content/audio-manifest.json` 被忽略，但浏览器入口静态 import 它，导致全新检出下 `npm test` 与 TypeScript 检查失败。修复原则：

- 被源码静态引用、且可确定生成的小型示例 manifest 应随仓库提交；
- 大型媒体与构建输出仍留在 `out/` / `build/`；
- README 中的“发布前检查”必须能按所列顺序在新检出执行。

## 3. CLI 不能静默回退

严格 flag 解析的价值已经被多次证明：拼错 `--presentation` 若静默回退到示例，会产生“校验通过但校验错对象”的危险结果。所有脚本应：

- 拒绝未知 flag；
- 给出最接近的建议；
- `--help` 在加载 deck、模型或依赖前退出；
- 子脚本路径从仓库根解析，不依赖调用者当前目录；
- 不用 `shell: true` 拼接用户路径。

Python argparse 子命令与 npm 参数转发语义不同：`npm run script -- --flag` 需要分隔符；`uv run lusine-meta check --flag` 不应插入裸 `--`。文档必须实际执行验证，不能按经验猜。

## 4. TTS profile、运行时和交付格式要分离

Profile 是声音和确定性参数的事实来源；运行时是机器本地状态；最终格式是媒体契约。三者不可混写：

- profile 不写某台机器的 `/mnt/...`、驱动器或 Python 绝对路径；
- runtime 安装在 `.tts-runtime/<provider>/`，可通过环境变量改位置；
- Edge 在线服务返回 MP3，但生产输出显式转为 24 kHz、单声道、PCM 16-bit WAV；
- Qwen3-TTS 先生成带 profile/request hash 的计划，再由 adapter 执行；
- slide 不允许覆盖 voice、emotion、seed 或 sampling，避免整场声音漂移。

每个随仓库提供的 profile 都应有“能通过共享 validator”的测试。字段命名必须和执行器一致；本轮曾发现 Edge profile 使用 `pitchAdjustment`，而 validator 错验 `pitch`。

## 5. Edge TTS 的稳定性策略

在线服务具有瞬时失败和限流，`--list-voices` 返回音色并不保证紧接着的每次合成都成功。本轮 182 段课程旁白生成中形成的可靠策略：

1. 音色由每课 profile 固定，并记录到 `lesson-media.json`；
2. 同参数最多重试 5 次，退避时间逐次增加；
3. 每段成功后节流，避免连续突发请求；
4. 失败时清理临时 MP3/WAV，不污染下一次断点续跑；
5. 已存在 WAV 先做格式和可听度验证，再跳过；
6. 绝不因为某个音色暂时不可用而静默换声。

本轮实际验证了 `Xiaoxiao`、`Xiaoyi`、`Yunxi`、`Yunjian`、`Yunxia`、`Yunyang` 六种普通话音色。`Yunxi` 曾短暂对最短文本返回 `NoAudioReceived`，稍后恢复；保持原定 profile 并断点续跑，最终产物与追踪一致。

## 6. Qwen3-TTS：源码能力与本地可用性是两回事

安装/执行脚本和 adapter 可以是正确的，但不能因此声称本机音色可用。本轮环境为 4 GiB 显存，计划用 0.6B CustomVoice 验证；CUDA wheel 安装两次因 NVIDIA PyPI 网络超时失败。正确处理是：

- 保留经过测试的安装器、profile、plan/hash adapter；
- 删除失败安装留下的半成品 `.tts-runtime/qwen3-tts/`；
- 未实际加载模型并生成可听 WAV 前，不把 Qwen 音色列为“当前可用”；
- 大型 NVIDIA wheel 使用更合理的 `UV_HTTP_TIMEOUT`，但仍需报告真实失败。

## 7. PPTX 与 MP4 的一致性和清晰度

PPTX 应保持可编辑矢量元素；MP4 不能通过降低 deck 分辨率换速度。课程媒体采用以下质量门禁：

- deck 固定 1920×1080@30fps；
- 中间帧为 PNG，不经过 JPEG 代际压缩；
- `render-slide-stills.mjs` 每页只渲染一张稳定后的高分辨率静帧；
- 静态课程画面用 H.264 `stillimage` tune 与高质量 CRF 编码；
- 最终验证 MP4 的 codec、分辨率、帧率、AAC 音频流和时长；
- 代表帧至少检查尺寸、非空色彩统计和 OCR 可识别性。

本轮对 `dsh-example` / `iota-example` 26 课的聚合验证：

- 26 个 deck 与 26 个 PPTX 均为 7 页；
- 26 个 MP4 均为 H.264 1920×1080@30fps + AAC；
- 182 个 WAV 均为 PCM 16-bit、24 kHz、单声道；
- deck 确定性重新生成 26/26 一致；
- 总视频时长 64.60 分钟。

## 8. 长任务与验证纪律

不要把“启动了命令”当作成功。耗时流程需要分层证据：

1. 纯函数/schema/profile 测试；
2. shell/CLI `--help` 和参数契约；
3. 单个短样本音频；
4. 一份 PPTX + 一段 MP4 端到端门禁；
5. 批量生成；
6. 聚合检查所有产物，不抽样代替总验收。

Remotion/编码超过隧道响应时间时，应使用可持久追踪的任务，或通过独立文件断点续跑；任何重新执行都必须复用已经验证的音频 hash，避免重复成本。

## 9. 清理边界

| 分类 | 例子 | 处理 |
|---|---|---|
| 核心源码 | `core/src/`、`core/scripts/`、`core/python/`、`core/test/` | 保留并测试 |
| 示例契约 | `example/content/presentation.json`、已提交的 `audio-manifest.json` | 保留 |
| 本地有效运行时 | `.tts-runtime/edge-tts/` | 当前课程生成依赖，保留；可由 installer 重建 |
| 失败运行时 | 未安装任何包的 `.tts-runtime/qwen3-tts/` | 删除；需要时重新运行 installer |
| 开发依赖 | `node_modules/`、`.venv/` | 当前验证仍需要，可重建但默认保留 |
| 构建/媒体输出 | `build/`、`out/` | 可再生成，清理不会丢源码 |
| 测试缓存 | `.pytest_cache/`、`__pycache__/` | 始终可清理 |

`render-slide-stills.mjs` 不是临时脚本：兄弟项目 `hello-olleh/scripts/build_lesson_media.py` 依赖它来生成无 JPEG 中间损失的课程视频，因此必须保留并纳入 CLI help/lint/test 契约。
