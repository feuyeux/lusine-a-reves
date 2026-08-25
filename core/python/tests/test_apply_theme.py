"""apply-theme closes the loop from a palette suggestion to a real deck."""
import json
from pathlib import Path

import pytest

from lusine_builder.cli import build_parser

REPO_ROOT = Path(__file__).resolve().parents[3]


def _deck() -> dict:
    return {
        "schemaVersion": 1,
        "id": "demo",
        "title": "Demo",
        "theme": {
            "ink": "#111111", "paper": "#ffffff", "muted": "#888888",
            "accent": "#0071e3", "accent2": "#5e5ce6", "accent3": "#ff9f0a", "panel": "#ffffff",
        },
        "style": {"headingFont": "Caller Font", "bodyFont": "Caller Font"},
        "slides": [{"id": "a", "type": "title", "title": "t"}],
    }


def _run(argv: list[str]) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


def test_apply_theme_writes_preset_palette_and_keeps_caller_fonts(tmp_path: Path):
    deck_path = tmp_path / "presentation.json"
    deck_path.write_text(json.dumps(_deck()), encoding="utf-8")
    preset_path = REPO_ROOT / "core/profiles/theme.ink-paper-rust.json"
    preset = json.loads(preset_path.read_text(encoding="utf-8"))

    assert _run(["apply-theme", "--preset", str(preset_path), "--presentation", str(deck_path)]) == 0

    updated = json.loads(deck_path.read_text(encoding="utf-8"))
    assert updated["theme"] == preset["theme"]
    assert updated["style"]["mood"] == preset["style"]["mood"]
    assert updated["style"]["density"] == preset["style"]["density"]
    # Caller-specific values that the preset does not define must survive.
    assert updated["style"]["headingFont"] == "Caller Font"
    # Content is untouched.
    assert updated["slides"] == _deck()["slides"]


def test_apply_theme_rejects_a_file_that_is_not_a_preset(tmp_path: Path):
    deck_path = tmp_path / "presentation.json"
    deck_path.write_text(json.dumps(_deck()), encoding="utf-8")
    bogus = tmp_path / "bogus.json"
    bogus.write_text(json.dumps({"schemaVersion": 1}), encoding="utf-8")
    with pytest.raises(ValueError, match="Not a valid theme preset"):
        _run(["apply-theme", "--preset", str(bogus), "--presentation", str(deck_path)])
