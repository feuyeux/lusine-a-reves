"""CLI entry point for uv-managed build tooling."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

from .tts import TTSProfile, build_plan
from .intake import (
    VOICE_INTENT_KEYS,
    apply_answers,
    collect_interactively,
    is_confirmed,
    load_brief,
    validate_brief,
    write_brief,
)
from .materials import ingest_material


ROOT = Path(__file__).resolve().parents[3]


def _path(value: str | None, default: str) -> Path:
    candidate = Path(value or default)
    return candidate if candidate.is_absolute() else ROOT / candidate


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _tts_plan(args: argparse.Namespace) -> int:
    brief = load_brief(_path(args.brief, "")) if args.brief else None
    if args.brief and not is_confirmed(brief):
        raise ValueError("A confirmed topic brief is required before selecting a global TTS voice")
    presentation_path = _path(args.presentation, "example/content/presentation.json")
    profile_path = _path(args.profile, "core/profiles/tts-profile.json")
    output_path = _path(args.output, "out/tts/plan.json")
    plan = build_plan(_load_json(presentation_path), TTSProfile.load(profile_path))
    if brief:
        # Recorded intent only: the synthesised voice is fixed by the profile.
        # Surfacing it in the plan keeps the audit trail complete without
        # implying that these strings change any synthesis parameter.
        plan["voiceIntent"] = {
            "note": "recorded intent only; synthesis parameters come from the TTS profile",
            **{key: brief[key] for key in VOICE_INTENT_KEYS},
        }
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
    if args.brief:
        command += ["--brief", args.brief]
    return subprocess.run(command, cwd=ROOT, check=False).returncode


def _intake(args: argparse.Namespace) -> int:
    brief_path = _path(args.brief, "work/topic/topic-brief.json")
    brief = load_brief(brief_path)
    if args.source:
        material = ingest_material(_path(args.source, ""))
        brief["materials"] = [material]
        suggestion = material["designSuggestion"]
        brief.setdefault("designSuggestion", suggestion)
        if not brief.get("visualDirection"):
            brief["visualDirection"] = (
                f"资料驱动的 {suggestion['mood']} 视觉；采用 {suggestion['palette']} 配色，"
                f"信息密度为 {suggestion['density']}，动效保持 {suggestion['motion']}。"
            )
    if brief.get("status") == "confirmed" and not args.revise:
        print(f"Topic brief already confirmed: {brief_path}")
        print("Use --revise to reopen it.")
        return 0

    if args.answers:
        answers_path = _path(args.answers, "")
        answers = _load_json(answers_path)
        if not isinstance(answers, dict):
            raise ValueError("--answers must point to a JSON object")
        apply_answers(brief, answers)
        if args.yes:
            brief["status"] = "confirmed"
    else:
        collect_interactively(brief, minimal=args.minimal)

    errors = validate_brief(brief)
    if errors:
        brief["status"] = "draft"
        write_brief(brief_path, brief)
        print(f"Topic brief saved as draft: {brief_path}")
        for error in errors:
            print(f"- {error}")
        return 1
    if not is_confirmed(brief):
        brief["status"] = "draft"
        write_brief(brief_path, brief)
        print(f"Topic brief saved as draft: {brief_path}")
        print("Explicit confirmation is still required before authoring presentation content.")
        return 1
    write_brief(brief_path, brief)
    print(f"Topic brief confirmed: {brief_path}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="lusine-meta")
    subparsers = parser.add_subparsers(dest="command", required=True)

    plan = subparsers.add_parser("tts-plan", help="create a deterministic TTS request plan")
    plan.add_argument("--presentation")
    plan.add_argument("--profile")
    plan.add_argument("--output")
    plan.add_argument("--brief", help="require a confirmed topic brief before TTS planning")
    plan.set_defaults(func=_tts_plan)

    doctor = subparsers.add_parser("doctor", help="check cross-platform build dependencies")
    doctor.set_defaults(func=_doctor)

    check = subparsers.add_parser("check", help="run the Node deck validator through the uv entry point")
    check.add_argument("--presentation")
    check.add_argument("--manifest")
    check.add_argument("--public-dir")
    check.add_argument("--brief", help="require a confirmed topic brief before validation")
    check.set_defaults(func=_node_check)

    intake = subparsers.add_parser("intake", help="confirm intent before creating a new topic")
    intake.add_argument("--brief", help="topic brief JSON path")
    intake.add_argument("--answers", help="JSON file containing field answers")
    intake.add_argument("--yes", action="store_true", help="explicitly confirm complete machine-provided answers")
    intake.add_argument("--revise", action="store_true", help="reopen an already confirmed brief")
    intake.add_argument("--source", help="reference material path to ingest before confirming intent")
    intake.add_argument("--minimal", action="store_true", help="only ask the fields that block content authoring")
    intake.set_defaults(func=_intake)

    ingest = subparsers.add_parser("ingest", help="summarise a reference material file")
    ingest.add_argument("--source", required=True)
    ingest.add_argument("--output")
    ingest.set_defaults(func=_ingest)

    apply_theme = subparsers.add_parser("apply-theme", help="apply a palette preset to a deck")
    apply_theme.add_argument("--preset", required=True, help="core/profiles/theme.<palette>.json")
    apply_theme.add_argument("--presentation", required=True)
    apply_theme.set_defaults(func=_apply_theme)
    return parser


def _ingest(args: argparse.Namespace) -> int:
    result = ingest_material(_path(args.source, ""))
    output = _path(args.output, "out/materials/material-analysis.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Material analysis written: {output}")
    print(f"Design suggestion: {result['designSuggestion']}")
    print(f"Apply it with: lusine-meta apply-theme --preset {result['designSuggestion']['themePreset']} --presentation <deck.json>")
    return 0


def _apply_theme(args: argparse.Namespace) -> int:
    """Write a palette preset's theme and style into an existing deck."""

    preset_path = _path(args.preset, "")
    preset = _load_json(preset_path)
    if preset.get("schemaVersion") != 1 or "theme" not in preset:
        raise ValueError(f"Not a valid theme preset: {preset_path}")
    presentation_path = _path(args.presentation, "")
    deck = _load_json(presentation_path)
    deck["theme"] = preset["theme"]
    # Preset style keys are merged so caller-specific fonts survive.
    deck["style"] = {**deck.get("style", {}), **preset.get("style", {})}
    presentation_path.write_text(json.dumps(deck, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Applied palette {preset.get('paletteId')} to {presentation_path}")
    return 0


def main() -> int:
    args = build_parser().parse_args()
    try:
        return args.func(args)
    except (EOFError, OSError, ValueError, json.JSONDecodeError) as error:
        print(f"lusine-meta: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
