#!/usr/bin/env bash
# Install the official Qwen3-TTS CustomVoice runtime into an isolated environment.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="${QWEN3_TTS_RUNTIME_DIR:-$ROOT/.tts-runtime/qwen3-tts}"
VENV_DIR="$RUNTIME_DIR/.venv"
PYTHON_BIN="$VENV_DIR/bin/python"
QWEN_TTS_VERSION="0.1.1"
TORCH_VERSION="${QWEN3_TTS_TORCH_VERSION:-2.7.1+cu126}"
TORCH_INDEX_URL="${QWEN3_TTS_TORCH_INDEX_URL:-https://download.pytorch.org/whl/cu126}"
# NVIDIA CUDA wheels are hundreds of MiB; retain a caller override but avoid
# uv's short default request timeout on slower package mirrors.
export UV_HTTP_TIMEOUT="${UV_HTTP_TIMEOUT:-180}"

command -v uv >/dev/null || { echo "uv is required; install it first." >&2; exit 2; }
mkdir -p "$RUNTIME_DIR"
uv venv --python "${QWEN3_TTS_PYTHON:-python3}" "$VENV_DIR"
# CUDA 12.6 is the reproducible default. For CPU or another CUDA release, set
# both QWEN3_TTS_TORCH_VERSION and QWEN3_TTS_TORCH_INDEX_URL explicitly.
uv pip install --python "$PYTHON_BIN" --index-url "$TORCH_INDEX_URL" \
  "torch==$TORCH_VERSION" "torchaudio==$TORCH_VERSION"
uv pip install --python "$PYTHON_BIN" "qwen-tts==$QWEN_TTS_VERSION" "soundfile==0.13.1"
"$PYTHON_BIN" - <<'PY'
import qwen_tts
import torch
print(f"qwen-tts={getattr(qwen_tts, '__version__', 'installed')}")
print(f"torch={torch.__version__}; cuda={torch.cuda.is_available()}")
PY
printf 'Qwen3-TTS runtime ready: %s\n' "$RUNTIME_DIR"
printf 'The first synthesis downloads the fixed model from the selected profile.\n'
printf 'Use: npm run voiceover:qwen3 -- --plan <plan.json> --public-dir <public-dir>\n'
