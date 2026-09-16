import hashlib
import json
from pathlib import Path

import pytest

from lusine_builder.qwen3_adapter import canonical_json, load_plan, output_path, validate_request


def request() -> dict:
    value = {
        "slideId": "opening",
        "text": "固定播报。",
        "output": "audio/opening.wav",
        "profile": {
            "provider": "qwen3-tts",
            "model": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
            "voice": "Serena",
            "language": "Chinese",
            "seed": 20260823,
            "temperature": 0.0,
            "topP": 1.0,
            "sampleRate": 24000,
        },
        "generation": {
            "do_sample": False,
            "subtalker_dosample": False,
            "repetition_penalty": 1.0,
            "max_new_tokens": 240,
        },
    }
    value["requestHash"] = hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()
    return value


def test_validate_request_accepts_the_deterministic_plan_contract():
    assert validate_request(request())["slideId"] == "opening"


def test_validate_request_rejects_a_tampered_hash():
    value = request()
    value["text"] = "tampered"
    with pytest.raises(ValueError, match="hash mismatch"):
        validate_request(value)


def test_output_path_stays_under_public_and_requires_wav(tmp_path: Path):
    assert output_path(tmp_path, "audio/opening.wav") == tmp_path / "audio" / "opening.wav"
    with pytest.raises(ValueError, match="public-relative WAV"):
        output_path(tmp_path, "../escape.wav")
    with pytest.raises(ValueError, match="public-relative WAV"):
        output_path(tmp_path, "audio/opening.mp3")


def test_load_plan_requires_a_nonempty_versioned_request_list(tmp_path: Path):
    path = tmp_path / "plan.json"
    path.write_text(json.dumps({"schemaVersion": 1, "requests": []}), encoding="utf-8")
    with pytest.raises(ValueError, match="at least one request"):
        load_plan(path)
