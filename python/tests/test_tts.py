import json
from pathlib import Path

import pytest

from lusine_builder.tts import TTSProfile, build_plan


ROOT = Path(__file__).resolve().parents[2]


def test_profile_generates_stable_request_hashes():
    profile = TTSProfile.load(ROOT / "content/tts-profile.json")
    presentation = {"id": "demo", "slides": [{"id": "intro", "narration": "固定播报"}]}
    first = build_plan(presentation, profile)
    second = build_plan(json.loads(json.dumps(presentation)), profile)
    assert first == second
    assert first["requests"][0]["profile"]["emotion"] == "neutral"


def test_slide_level_voice_override_is_rejected():
    profile = TTSProfile.load(ROOT / "content/tts-profile.json")
    presentation = {"id": "demo", "slides": [{"id": "intro", "narration": "变化音色", "voice": "other"}]}
    with pytest.raises(ValueError, match="global profile"):
        build_plan(presentation, profile)


def test_nondeterministic_profile_is_rejected(tmp_path):
    path = tmp_path / "profile.json"
    values = json.loads((ROOT / "content/tts-profile.json").read_text(encoding="utf-8"))
    values["randomize"] = True
    path.write_text(json.dumps(values), encoding="utf-8")
    with pytest.raises(ValueError, match="randomize"):
        TTSProfile.load(path)
