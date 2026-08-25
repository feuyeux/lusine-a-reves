import json
from pathlib import Path

import pytest

from lusine_builder.materials import (
    LITERARY_MIN_HITS,
    PALETTE_PRESETS,
    MaterialDecodeError,
    ingest_material,
)


def test_ingest_material_is_hashed_and_suggests_editorial_style(tmp_path: Path):
    source = tmp_path / "notes.md"
    source.write_text("# 新东北叙事\n\n2020 年的小说与文学叙事。", encoding="utf-8")
    result = ingest_material(source)
    assert len(result["sha256"]) == 64
    assert result["signals"]["hasLiteraryTerms"] is True
    assert result["designSuggestion"]["mood"] == "literary-documentary"


def test_gb18030_material_is_decoded_without_crashing(tmp_path: Path):
    source = tmp_path / "gbk.md"
    source.write_bytes("# 中文资料\n\n这是一段用 GBK 保存的中文正文。".encode("gb18030"))
    result = ingest_material(source)
    assert result["encoding"] == "gb18030"
    assert result["title"] == "中文资料"


def test_utf8_bom_material_is_decoded(tmp_path: Path):
    source = tmp_path / "bom.md"
    source.write_bytes("# 带 BOM\n\n正文".encode("utf-8-sig"))
    assert ingest_material(source)["encoding"] == "utf-8-sig"


def test_binary_material_is_rejected_instead_of_producing_garbage(tmp_path: Path):
    source = tmp_path / "shot.png"
    source.write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x01" * 64)
    with pytest.raises(MaterialDecodeError, match="binary"):
        ingest_material(source)


def test_undecodable_bytes_are_rejected(tmp_path: Path):
    source = tmp_path / "weird.txt"
    source.write_bytes(b"\xff\xfe\xfd\xfc")
    with pytest.raises(MaterialDecodeError, match="not decodable"):
        ingest_material(source)


def test_single_literary_keyword_does_not_hijack_the_visual_direction(tmp_path: Path):
    """A passing mention must not outweigh a long non-literary document."""
    source = tmp_path / "report.md"
    body = "本节讨论系统吞吐与延迟指标的采集方法。" * 40
    source.write_text(f"# 工程报告\n\n{body}\n\n这不是一篇小说。", encoding="utf-8")
    result = ingest_material(source)
    assert result["signals"]["literaryTermHits"] < LITERARY_MIN_HITS
    assert result["signals"]["hasLiteraryTerms"] is False
    assert result["designSuggestion"]["mood"] != "literary-documentary"


def test_dense_literary_material_still_triggers_editorial_style(tmp_path: Path):
    source = tmp_path / "essay.md"
    source.write_text("# 叙事研究\n\n小说、文学、叙事与作家的诗意散文。", encoding="utf-8")
    result = ingest_material(source)
    assert result["signals"]["hasLiteraryTerms"] is True
    assert result["designSuggestion"]["density"] == "editorial"


def test_every_palette_suggestion_maps_to_an_existing_preset():
    """The palette name must be actionable, not an unmappable label."""
    repo_root = Path(__file__).resolve().parents[3]
    for palette, relative in PALETTE_PRESETS.items():
        preset_path = repo_root / relative
        assert preset_path.is_file(), f"missing preset for {palette}: {preset_path}"
        preset = json.loads(preset_path.read_text(encoding="utf-8"))
        assert preset["paletteId"] == palette
        assert set(preset["theme"]) == {"ink", "paper", "muted", "accent", "accent2", "accent3", "panel"}
