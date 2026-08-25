"""Read reference material and derive auditable style signals."""
from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any


# Candidate encodings tried in order. Windows authors frequently save Chinese
# plain text as GBK/GB18030, so a UTF-8-only reader would crash on real input.
# Single-byte encodings such as cp1252 are deliberately excluded: they decode
# arbitrary bytes without error, which would turn a binary file into silent
# garbage text instead of an actionable failure.
CANDIDATE_ENCODINGS = ("utf-8-sig", "utf-8", "gb18030", "big5")

# A single keyword hit is too weak to redirect the whole visual direction, so a
# signal only fires once the term density clears a floor. Density is measured
# per 1000 characters to keep short and long documents comparable.
LITERARY_TERMS = ("小说", "文学", "叙事", "诗意", "作家", "散文", "文本", "隐喻")
LITERARY_MIN_HITS = 3
LITERARY_MIN_DENSITY_PER_1K = 0.5


class MaterialDecodeError(ValueError):
    """Raised when reference material cannot be decoded as text."""


# Each palette name resolves to a real preset under core/profiles/, so a
# suggestion is directly usable instead of being an unmappable label.
PALETTE_PRESETS = {
    "ink-paper-rust": "core/profiles/theme.ink-paper-rust.json",
    "ink-paper-teal": "core/profiles/theme.ink-paper-teal.json",
    "neutral-accent": "core/profiles/theme.neutral-accent.json",
    "ink-dark": "core/profiles/theme.ink-dark.json",
}


def decode_material(data: bytes) -> tuple[str, str]:
    """Decode bytes with an auditable encoding fallback chain."""

    # A NUL byte never appears in text material and is the clearest binary
    # marker, so reject it before any encoding attempt can mangle it.
    if b"\x00" in data:
        raise MaterialDecodeError(
            "Material file looks binary (contains NUL bytes); supply Markdown or plain text"
        )
    for encoding in CANDIDATE_ENCODINGS:
        try:
            return data.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    raise MaterialDecodeError(
        "Material file is not decodable as text using "
        f"{', '.join(CANDIDATE_ENCODINGS)}; convert it to UTF-8 first"
    )


def count_terms(lower_text: str, terms: tuple[str, ...]) -> int:
    return sum(lower_text.count(term) for term in terms)


def _literary_signal(text: str, lower_text: str) -> bool:
    hits = count_terms(lower_text, LITERARY_TERMS)
    if hits < LITERARY_MIN_HITS:
        return False
    density = hits * 1000 / max(1, len(text))
    return density >= LITERARY_MIN_DENSITY_PER_1K


def ingest_material(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(f"Material file not found: {path}")
    data = path.read_bytes()
    text, encoding = decode_material(data)
    headings = [m.group(1).strip() for m in re.finditer(r"^#{1,6}\s+(.+)$", text, re.MULTILINE)]
    lower = text.lower()
    literary_hits = count_terms(lower, LITERARY_TERMS)
    signals = {
        "hasTimeline": bool(re.search(r"\b(19|20)\d{2}\b", text)),
        "hasTables": "|" in text and "---" in text,
        "hasCitations": bool(re.search(r"\[[0-9]+\]|https?://", text)),
        "hasLiteraryTerms": _literary_signal(text, lower),
        "literaryTermHits": literary_hits,
    }
    if signals["hasLiteraryTerms"]:
        suggestion = {"mood": "literary-documentary", "palette": "ink-paper-rust", "density": "editorial", "motion": "restrained"}
    elif signals["hasTimeline"] or signals["hasTables"]:
        suggestion = {"mood": "research-editorial", "palette": "ink-paper-teal", "density": "information", "motion": "measured"}
    else:
        suggestion = {"mood": "clear-explanatory", "palette": "neutral-accent", "density": "balanced", "motion": "subtle"}
    # Point at the concrete preset so the suggestion is actionable.
    suggestion["themePreset"] = PALETTE_PRESETS[suggestion["palette"]]
    return {
        "schemaVersion": 1,
        "kind": "reference-material",
        "path": str(path),
        "sha256": hashlib.sha256(data).hexdigest(),
        "format": path.suffix.lower().lstrip("."),
        "encoding": encoding,
        "title": headings[0] if headings else path.stem,
        "headings": headings,
        "characterCount": len(text),
        "signals": signals,
        "designSuggestion": suggestion,
    }
