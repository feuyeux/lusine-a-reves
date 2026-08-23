"""Deterministic TTS request planning.

This module deliberately does not call a vendor SDK. It creates a canonical,
auditable request plan that a local or hosted TTS adapter can consume.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_PROFILE = {
    "schemaVersion": 1,
    "profileId": "technical-neutral-zh-windows-sapi-v1",
    "provider": "windows-sapi",
    "runtime": "Microsoft System.Speech / PowerShell",
    "model": "Microsoft Huihui Desktop",
    "voice": "Microsoft Huihui Desktop",
    "language": "Chinese",
    "languageCode": "zh-CN",
    "emotion": "neutral",
    "style": "technical-explainer",
    "instruct": "语速适中，发音清晰，语气专业自然。",
    "rate": -1,
    "volumePercent": 100,
    "sampleRate": 22050,
    "channels": 1,
    "format": "wav",
    "normalize": False,
    "randomize": False,
}


@dataclass(frozen=True)
class TTSProfile:
    values: dict[str, Any]

    @classmethod
    def load(cls, path: Path) -> "TTSProfile":
        values = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(values, dict):
            raise ValueError("TTS profile must be a JSON object")
        merged = {**DEFAULT_PROFILE, **values}
        profile = cls(merged)
        profile.validate()
        return profile

    def validate(self) -> None:
        if self.values.get("schemaVersion") != 1:
            raise ValueError("TTS profile schemaVersion must be 1")
        required = ("profileId", "provider", "runtime", "model", "voice", "language", "emotion", "style", "instruct")
        missing = [key for key in required if not str(self.values.get(key, "")).strip()]
        if missing:
            raise ValueError(f"TTS profile fields are empty: {', '.join(missing)}")
        if self.values.get("randomize") is not False:
            raise ValueError("TTS profile randomize must be false")
        if self.values.get("provider") == "qwen3-tts":
            if self.values.get("temperature") != 0.0 or self.values.get("topP") != 1.0:
                raise ValueError("TTS profile temperature must be 0.0 and topP must be 1.0 for deterministic generation")
            if self.values.get("doSample") is not False or self.values.get("subtalkerDoSample") is not False:
                raise ValueError("TTS profile sampling flags must both be false")
            if self.values.get("repetitionPenalty") != 1.0:
                raise ValueError("TTS profile repetitionPenalty must be 1.0")
            if not isinstance(self.values.get("seed"), int):
                raise ValueError("TTS profile seed must be an integer")
        if self.values.get("provider") == "edge-tts":
            for key in ("rate", "pitch", "volumeAdjustment"):
                if not str(self.values.get(key, "")).strip():
                    raise ValueError(f"TTS profile {key} must be fixed for edge-tts")
        if self.values.get("provider") == "windows-sapi":
            if not isinstance(self.values.get("rate"), int) or not -10 <= self.values["rate"] <= 10:
                raise ValueError("TTS profile rate must be an integer between -10 and 10 for windows-sapi")
            if not isinstance(self.values.get("volumePercent"), int) or not 0 <= self.values["volumePercent"] <= 100:
                raise ValueError("TTS profile volumePercent must be between 0 and 100 for windows-sapi")
        if self.values.get("provider") == "cosyvoice2":
            if self.values.get("mode") != "zero_shot":
                raise ValueError("CosyVoice2 production profile must use zero_shot mode")
            for key in ("runtimeRoot", "modelDir", "promptAudio", "promptText"):
                if not str(self.values.get(key, "")).strip():
                    raise ValueError(f"CosyVoice2 profile {key} must be fixed")
            if not isinstance(self.values.get("seed"), int):
                raise ValueError("CosyVoice2 profile seed must be an integer")
            if int(self.values.get("sampling", 0)) != 25:
                raise ValueError("CosyVoice2 sampling must stay at the model default top-k value 25")
            if float(self.values.get("samplingTopP", 0)) != 0.8:
                raise ValueError("CosyVoice2 samplingTopP must stay at the model default 0.8")
            if int(self.values.get("samplingTopK", 0)) != 25:
                raise ValueError("CosyVoice2 samplingTopK must stay at the model default 25")
        if self.values.get("provider") in ("qwen3-tts", "cosyvoice2"):
            if not 0.5 <= float(self.values.get("speed", 0)) <= 2.0:
                raise ValueError("TTS profile speed must be between 0.5 and 2.0")
        if not 8000 <= int(self.values.get("sampleRate", 0)) <= 96000:
            raise ValueError("TTS profile sampleRate must be between 8000 and 96000")
        if int(self.values.get("channels", 0)) not in (1, 2):
            raise ValueError("TTS profile channels must be 1 or 2")
        if self.values.get("format") not in ("wav", "mp3", "m4a"):
            raise ValueError("TTS profile format must be wav, mp3, or m4a")

    def canonical(self) -> str:
        return json.dumps(self.values, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

    @property
    def digest(self) -> str:
        return hashlib.sha256(self.canonical().encode("utf-8")).hexdigest()

    def request(self, slide_id: str, text: str, output: str) -> dict[str, Any]:
        if not text.strip():
            raise ValueError(f"Narration is empty for slide {slide_id}")
        cjk_count = sum(1 for char in text if "\u4e00" <= char <= "\u9fff")
        content_units = max(1, cjk_count, len(text.split()))
        provider = self.values["provider"]
        payload = {
            "slideId": slide_id,
            "text": text,
            "output": output,
            "profile": self.values,
            "providerParams": {
                "voice": self.values["voice"],
                "language": self.values.get("languageCode", self.values["language"]),
                "rate": self.values.get("rate"),
                "pitch": self.values.get("pitchAdjustment", self.values.get("pitch")),
                "volume": self.values.get("volumeAdjustment", self.values.get("volumePercent")),
            },
        }
        if provider == "qwen3-tts":
            max_new_tokens = min(
                int(self.values["maxNewTokens"]),
                max(int(self.values["minNewTokens"]), content_units * int(self.values["maxNewTokensPerCjkChar"])),
            )
            payload["generation"] = {
                "do_sample": self.values["doSample"],
                "subtalker_dosample": self.values["subtalkerDoSample"],
                "repetition_penalty": self.values["repetitionPenalty"],
                "max_new_tokens": max_new_tokens,
            }
        if provider == "cosyvoice2":
            payload["generation"] = {
                "mode": self.values["mode"],
                "seed": self.values["seed"],
                "sampling": self.values["sampling"],
                "sampling_top_p": self.values["samplingTopP"],
                "sampling_top_k": self.values["samplingTopK"],
                "speed": self.values["speed"],
                "prompt_audio": self.values["promptAudio"],
                "prompt_text": self.values["promptText"],
            }
        canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return {
            **payload,
            "requestHash": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
        }


def build_plan(presentation: dict[str, Any], profile: TTSProfile) -> dict[str, Any]:
    slides = presentation.get("slides")
    if not isinstance(slides, list) or not slides:
        raise ValueError("presentation.slides must be a non-empty array")
    requests = []
    seen_ids: set[str] = set()
    extension = profile.values["format"]
    for slide in slides:
        slide_id = slide.get("id")
        if not isinstance(slide_id, str) or not slide_id:
            raise ValueError("Every slide needs a non-empty id")
        if slide_id in seen_ids:
            raise ValueError(f"Duplicate slide id: {slide_id}")
        seen_ids.add(slide_id)
        if any(key in slide for key in ("voice", "emotion", "style", "seed", "temperature")):
            raise ValueError(f"Slide {slide_id} contains a forbidden TTS override; use the global profile")
        narration = slide.get("narration")
        if narration:
            requests.append(profile.request(slide_id, narration, f"audio/{slide_id}.{extension}"))
    return {
        "schemaVersion": 1,
        "presentationId": presentation.get("id"),
        "profileId": profile.values["profileId"],
        "profileHash": profile.digest,
        "requests": requests,
    }
