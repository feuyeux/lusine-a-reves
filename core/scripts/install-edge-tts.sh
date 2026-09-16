#!/usr/bin/env bash
# Install the online Edge TTS CLI into a repository-local isolated runtime.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="${EDGE_TTS_RUNTIME_DIR:-$ROOT/.tts-runtime/edge-tts}"
VENV_DIR="$RUNTIME_DIR/.venv"
PYTHON_BIN="$VENV_DIR/bin/python"
EDGE_TTS_VERSION="7.2.8"

command -v uv >/dev/null || { echo "uv is required; install it first." >&2; exit 2; }
mkdir -p "$RUNTIME_DIR"
uv venv --python "${EDGE_TTS_PYTHON:-python3}" "$VENV_DIR"
uv pip install --python "$PYTHON_BIN" "edge-tts==$EDGE_TTS_VERSION"
"$PYTHON_BIN" -m edge_tts --version
printf 'Edge TTS runtime ready: %s\n' "$RUNTIME_DIR"
printf 'Use: npm run voiceover:edge -- --presentation <deck.json> --public-dir <public-dir>\n'
