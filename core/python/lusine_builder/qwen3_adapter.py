"""Execute deterministic Qwen3-TTS CustomVoice request plans on Ubuntu."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--public-dir", type=Path, required=True)
    parser.add_argument("--device", default="cuda:0")
    return parser.parse_args(argv)


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def load_plan(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or value.get("schemaVersion") != 1:
        raise ValueError(f"Unsupported Qwen3-TTS plan: {path}")
    requests = value.get("requests")
    if not isinstance(requests, list) or not requests:
        raise ValueError("Qwen3-TTS plan must contain at least one request")
    return value


def validate_request(request: Any) -> dict[str, Any]:
    if not isinstance(request, dict):
        raise ValueError("Qwen3-TTS requests must be JSON objects")
    required = ("slideId", "text", "output", "profile", "generation", "requestHash")
    missing = [key for key in required if key not in request]
    if missing:
        raise ValueError(f"Qwen3-TTS request fields are missing: {', '.join(missing)}")
    expected_hash = hashlib.sha256(
        canonical_json({key: value for key, value in request.items() if key != "requestHash"}).encode("utf-8")
    ).hexdigest()
    if request["requestHash"] != expected_hash:
        raise ValueError(f"Qwen3-TTS request hash mismatch for slide {request['slideId']}")
    profile = request["profile"]
    generation = request["generation"]
    if profile.get("provider") != "qwen3-tts":
        raise ValueError(f"Request {request['slideId']} is not a qwen3-tts request")
    if generation != {
        "do_sample": False,
        "subtalker_dosample": False,
        "repetition_penalty": 1.0,
        "max_new_tokens": generation.get("max_new_tokens"),
    }:
        raise ValueError(f"Request {request['slideId']} does not retain deterministic generation settings")
    if not isinstance(generation["max_new_tokens"], int) or generation["max_new_tokens"] <= 0:
        raise ValueError(f"Request {request['slideId']} has invalid max_new_tokens")
    return request


def output_path(public_dir: Path, relative_output: str) -> Path:
    candidate = (public_dir / relative_output).resolve()
    root = public_dir.resolve()
    if candidate.suffix.lower() != ".wav" or root not in candidate.parents:
        raise ValueError(f"Qwen3-TTS output must be a public-relative WAV path: {relative_output}")
    return candidate


def configure_determinism(torch: Any, seed: int) -> None:
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False


def synthesize(plan: dict[str, Any], public_dir: Path, device: str) -> int:
    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel

    requests = [validate_request(request) for request in plan["requests"]]
    profile = requests[0]["profile"]
    if any(request["profile"] != profile for request in requests[1:]):
        raise ValueError("Qwen3-TTS plan must use one global profile")
    if device.startswith("cuda") and not torch.cuda.is_available():
        raise RuntimeError("Qwen3-TTS requested CUDA, but torch.cuda.is_available() is false")
    configure_determinism(torch, int(profile["seed"]))
    dtype = torch.bfloat16 if device.startswith("cuda") else torch.float32
    model = Qwen3TTSModel.from_pretrained(
        profile["model"], device_map=device, dtype=dtype, attn_implementation="sdpa",
    )
    speakers = {speaker.lower() for speaker in model.get_supported_speakers()}
    if str(profile["voice"]).lower() not in speakers:
        raise ValueError(f"Profile voice is unsupported by {profile['model']}: {profile['voice']}")

    for request in requests:
        configure_determinism(torch, int(profile["seed"]))
        generation = request["generation"]
        wavs, sample_rate = model.generate_custom_voice(
            text=request["text"],
            language=profile["language"],
            speaker=profile["voice"],
            instruct=profile["instruct"],
            do_sample=generation["do_sample"],
            subtalker_dosample=generation["subtalker_dosample"],
            repetition_penalty=generation["repetition_penalty"],
            temperature=profile["temperature"],
            top_p=profile["topP"],
            max_new_tokens=generation["max_new_tokens"],
        )
        if sample_rate != profile["sampleRate"] or len(wavs) != 1:
            raise RuntimeError(f"Unexpected Qwen3-TTS output for {request['slideId']}: {len(wavs)} waves at {sample_rate} Hz")
        output = output_path(public_dir, request["output"])
        output.parent.mkdir(parents=True, exist_ok=True)
        sf.write(output, wavs[0], sample_rate, subtype="PCM_16")
        print(f"generated: {request['slideId']} sample_rate={sample_rate} output={output}")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    return synthesize(load_plan(args.plan), args.public_dir, args.device)


if __name__ == "__main__":
    raise SystemExit(main())
