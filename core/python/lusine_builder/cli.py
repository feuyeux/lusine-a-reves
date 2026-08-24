"""CLI entry point for uv-managed build tooling."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

from .tts import TTSProfile, build_plan


ROOT = Path(__file__).resolve().parents[3]


def _path(value: str | None, default: str) -> Path:
    candidate = Path(value or default)
    return candidate if candidate.is_absolute() else ROOT / candidate


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _tts_plan(args: argparse.Namespace) -> int:
    presentation_path = _path(args.presentation, "example/content/presentation.json")
    profile_path = _path(args.profile, "core/profiles/tts-profile.json")
    output_path = _path(args.output, "out/tts/plan.json")
    plan = build_plan(_load_json(presentation_path), TTSProfile.load(profile_path))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"TTS plan written: {output_path} ({len(plan['requests'])} requests)")
    return 0


def _doctor(_: argparse.Namespace) -> int:
    required = ("uv", "node", "npm", "ffprobe", "ffmpeg")
    missing = [command for command in required if shutil.which(command) is None]
    for command in required:
        status = "ok" if command not in missing else "missing"
        print(f"{status:7} {command}")
    if missing:
        print("Install the missing tools and rerun uv run lusine-meta doctor.", file=sys.stderr)
        return 1
    return 0


def _node_check(args: argparse.Namespace) -> int:
    command = ["node", "core/scripts/validate-deck.mjs"]
    if args.presentation:
        command += ["--presentation", args.presentation]
    if args.manifest:
        command += ["--manifest", args.manifest]
    if args.public_dir:
        command += ["--public-dir", args.public_dir]
    return subprocess.run(command, cwd=ROOT, check=False).returncode


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="lusine-meta")
    subparsers = parser.add_subparsers(dest="command", required=True)

    plan = subparsers.add_parser("tts-plan", help="create a deterministic TTS request plan")
    plan.add_argument("--presentation")
    plan.add_argument("--profile")
    plan.add_argument("--output")
    plan.set_defaults(func=_tts_plan)

    doctor = subparsers.add_parser("doctor", help="check cross-platform build dependencies")
    doctor.set_defaults(func=_doctor)

    check = subparsers.add_parser("check", help="run the Node deck validator through the uv entry point")
    check.add_argument("--presentation")
    check.add_argument("--manifest")
    check.add_argument("--public-dir")
    check.set_defaults(func=_node_check)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        return args.func(args)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"lusine-meta: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
