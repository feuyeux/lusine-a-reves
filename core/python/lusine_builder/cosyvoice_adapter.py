"""Generate a batch of fixed-profile CosyVoice2 zero-shot WAV files.

The model is loaded once per batch. The caller supplies WSL/POSIX paths in a
JSON request file so Windows can invoke this adapter through WSL2 without
quoting Chinese narration on a shell command line.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", type=Path, required=True)
    parser.add_argument("--requests", type=Path, required=True)
    return parser.parse_args(argv)


def resolve_runtime_path(runtime_root: Path, value: str) -> Path:
    candidate = Path(value).expanduser()
    return candidate if candidate.is_absolute() else runtime_root / candidate


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _load_wav_soundfile(wav: Path, target_sr: int, soundfile, torch, torchaudio):  # noqa: ANN001
    data, sample_rate = soundfile.read(str(wav), dtype="float32", always_2d=True)
    speech = torch.from_numpy(data.T.copy())
    if speech.shape[0] > 1:
        speech = speech.mean(0, keepdim=True)
    if sample_rate != target_sr:
        speech = torchaudio.functional.resample(speech, sample_rate, target_sr)
    return speech


def split_text(text: str, max_chars: int = 180) -> list[str]:
    """Split long narration at punctuation while retaining every character."""
    normalized = " ".join(text.split())
    if len(normalized) <= max_chars:
        return [normalized]
    clauses = re.findall(r".*?[，。！？!?；;：:]|.+$", normalized, flags=re.DOTALL)
    chunks: list[str] = []
    current = ""
    for clause in clauses:
        if current and len(current) + len(clause) > max_chars:
            chunks.append(current.strip())
            current = ""
        if len(clause) <= max_chars:
            current += clause
            continue
        if current:
            chunks.append(current.strip())
            current = ""
        for start in range(0, len(clause), max_chars):
            part = clause[start:start + max_chars].strip()
            if part:
                chunks.append(part)
    if current.strip():
        chunks.append(current.strip())
    return chunks or [normalized]


def prepare_audio(chunks: list, pause_samples: int, peak_dbfs: float, normalize: bool = True):  # noqa: ANN001
    """Validate, join, and peak-normalize model output before writing it."""
    import numpy as np

    arrays = []
    for index, chunk in enumerate(chunks):
        audio = np.asarray(chunk, dtype=np.float32).reshape(-1)
        if not audio.size or not np.isfinite(audio).all():
            raise RuntimeError(f"CosyVoice2 returned invalid audio chunk #{index}")
        arrays.append(audio)
    if not arrays:
        raise RuntimeError("CosyVoice2 produced no audio")
    parts = []
    for index, audio in enumerate(arrays):
        if index:
            parts.append(np.zeros(pause_samples, dtype=np.float32))
        parts.append(audio)
    audio = np.concatenate(parts)
    peak = float(np.max(np.abs(audio)))
    if peak <= 0:
        raise RuntimeError("CosyVoice2 produced silent audio")
    if normalize:
        audio *= (10 ** (peak_dbfs / 20)) / peak
    return np.clip(audio, -1.0, 1.0)


def run(profile: dict, requests: list[dict], runtime_root: Path | None = None) -> int:
    if not isinstance(requests, list) or not requests:
        raise ValueError("CosyVoice request file must contain a non-empty array")
    # Validate every request up front so we fail fast (and without pulling in
    # the heavy torch/cosyvoice stack) when the request file is malformed.
    for index, request in enumerate(requests):
        if not isinstance(request, dict) or not request.get("text") or not request.get("output"):
            raise ValueError(f"CosyVoice request #{index} needs text and output")
        output = Path(request["output"]).expanduser()
        if output.suffix.lower() != ".wav":
            raise ValueError(f"CosyVoice request #{index} output must be WAV: {output}")

    source_root = (runtime_root or Path(
        os.environ.get("COSYVOICE_ROOT")
        or profile.get("runtimeRoot", "/mnt/d/zoo/cosyvoice")
    ).expanduser()).resolve()
    model_dir = resolve_runtime_path(source_root, profile["modelDir"])
    prompt_audio = resolve_runtime_path(source_root, profile["promptAudio"])
    if not source_root.is_dir():
        raise FileNotFoundError(f"CosyVoice source root does not exist: {source_root}")
    if not model_dir.is_dir():
        raise FileNotFoundError(f"CosyVoice model directory does not exist: {model_dir}")
    if not prompt_audio.is_file():
        raise FileNotFoundError(f"CosyVoice prompt audio does not exist: {prompt_audio}")

    sys.path.insert(0, str(source_root))
    sys.path.insert(0, str(source_root / "third_party" / "Matcha-TTS"))

    import soundfile as sf
    import torch
    import torchaudio

    import cosyvoice.cli.frontend as frontend
    from cosyvoice.cli.cosyvoice import AutoModel
    from cosyvoice.utils.common import set_all_random_seed

    frontend.load_wav = lambda wav, target_sr: _load_wav_soundfile(
        Path(wav), target_sr, sf, torch, torchaudio,
    )

    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False
    if not torch.cuda.is_available():
        raise RuntimeError("CosyVoice2 production synthesis requires CUDA in WSL2")

    model = AutoModel(model_dir=str(model_dir), load_jit=False, load_trt=False, fp16=False)
    prompt_text = str(profile["promptText"])
    speed = float(profile.get("speed", 1.0))
    seed = int(profile["seed"])
    max_chars = int(profile.get("maxCharsPerChunk", 180))
    target_sr = int(profile.get("sampleRate", model.sample_rate))
    if int(model.sample_rate) != target_sr:
        raise RuntimeError(f"CosyVoice2 sample rate mismatch: model={model.sample_rate}, profile={target_sr}")
    pause_samples = round(target_sr * int(profile.get("pauseMs", 120)) / 1000)
    peak_dbfs = float(profile.get("peakDbfs", -3.0))

    for request in requests:
        output = Path(request["output"]).expanduser()
        output.parent.mkdir(parents=True, exist_ok=True)

        audio_chunks = []
        for text_chunk in split_text(str(request["text"]), max_chars):
            # Reset every chunk so page order and retries cannot alter the voice path.
            set_all_random_seed(seed)
            generated = list(model.inference_zero_shot(
                text_chunk,
                prompt_text,
                str(prompt_audio),
                stream=False,
                speed=speed,
            ))
            audio_chunks.extend(
                item["tts_speech"].squeeze(0).detach().cpu().numpy() for item in generated
            )
        audio = prepare_audio(audio_chunks, pause_samples, peak_dbfs, bool(profile.get("normalize", True)))
        sf.write(str(output), audio, target_sr, subtype="PCM_16")
        print(
            f"generated: {request.get('slideId', output.name)} "
            f"sample_rate={model.sample_rate} samples={audio.shape[0]}"
        )

    return 0


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    return run(load_json(args.profile), load_json(args.requests))


if __name__ == "__main__":
    raise SystemExit(main())
