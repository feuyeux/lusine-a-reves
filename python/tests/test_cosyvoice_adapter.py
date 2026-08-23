"""Pure-function tests for the CosyVoice2 adapter.

These tests intentionally avoid importing torch / cosyvoice, which only exist
inside the WSL2 runtime. The adapter module is split so its argument parsing
and path-resolution helpers can be exercised on any host.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from lusine_builder.cosyvoice_adapter import (  # noqa: E402
    load_json,
    parse_args,
    resolve_runtime_path,
)


def test_parse_args_requires_profile_and_requests() -> None:
    with pytest.raises(SystemExit):
        parse_args([])


def test_parse_args_returns_paths() -> None:
    args = parse_args(["--profile", "p.json", "--requests", "r.json"])
    assert args.profile == Path("p.json")
    assert args.requests == Path("r.json")


def test_load_json_round_trip(tmp_path: Path) -> None:
    path = tmp_path / "data.json"
    path.write_text(json.dumps({"a": 1, "b": [2, 3]}), encoding="utf-8")
    assert load_json(path) == {"a": 1, "b": [2, 3]}


def test_resolve_runtime_path_absolute_passthrough(tmp_path: Path) -> None:
    absolute = tmp_path / "child"
    assert resolve_runtime_path(tmp_path, str(absolute)) == absolute


def test_resolve_runtime_path_relative_joins_under_root(tmp_path: Path) -> None:
    resolved = resolve_runtime_path(tmp_path, "models/checkpoint.pt")
    assert resolved == tmp_path / "models" / "checkpoint.pt"
    assert resolved.is_absolute()


def test_run_rejects_non_list_requests() -> None:
    from lusine_builder.cosyvoice_adapter import run

    profile = {"modelDir": "x", "promptAudio": "y"}
    with pytest.raises(ValueError, match="non-empty array"):
        run(profile, [])
    with pytest.raises(ValueError, match="non-empty array"):
        run(profile, {"not": "a list"})


def test_run_rejects_request_without_text(tmp_path: Path) -> None:
    from lusine_builder.cosyvoice_adapter import run

    profile = {
        "modelDir": "models/x",
        "promptAudio": "prompt.wav",
        "runtimeRoot": str(tmp_path),  # exists, so we hit the request loop
    }
    (tmp_path / "models").mkdir()
    (tmp_path / "models" / "x").mkdir()
    (tmp_path / "prompt.wav").write_bytes(b"")
    requests = [{"slideId": "s1", "output": str(tmp_path / "out.wav"), "text": ""}]
    with pytest.raises(ValueError, match="text and output"):
        run(profile, requests, runtime_root=tmp_path)