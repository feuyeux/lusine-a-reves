"""Interactive topic-intent intake for new presentation themes.

The presentation schema describes *how* a deck is rendered.  This module
captures *what the caller means* before content is authored, so an ambiguous
request cannot silently become a polished but incorrect deck.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable


BRIEF_SCHEMA_VERSION = 1
BRIEF_KIND = "topic-intent"


def _text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [item for item in (_text(item) for item in value) if item]
    return [item.strip() for item in _text(value).replace(";", ",").split(",") if item.strip()]


def _positive_int(value: Any) -> int:
    text = _text(value)
    try:
        number = int(text)
    except (TypeError, ValueError):
        # int() 的原生报错（invalid literal for int()）会直接展示给交互式用户，
        # 所以在这里换成可读的中文提示。
        raise ValueError(f"请输入正整数，当前输入为“{text}”") from None
    if number <= 0:
        raise ValueError("请输入大于 0 的正整数")
    return number


FIELD_SPECS: tuple[tuple[str, str, Callable[[Any], Any]], ...] = (
    ("topic", "主题是什么？请给出工作主题或核心对象", _text),
    ("objective", "这场内容要让观众理解、相信或采取什么行动？", _text),
    ("audience", "主要观众是谁？他们已有多少背景知识？", _text),
    ("scope", "范围是什么？明确包含什么、排除什么", _text),
    ("entities", "必须出现的人物、组织、作品或事实有哪些？（逗号分隔）", _list),
    ("angle", "希望采用什么核心叙事角度或中心论点？", _text),
    ("tone", "语气和情绪是什么？例如严谨、轻松、批评性或纪实", _text),
    ("language", "使用什么语言和地区表达？例如 zh-CN", _text),
    ("slideCount", "预计多少页？", _positive_int),
    ("durationMinutes", "预计讲述时长（分钟）？", _positive_int),
    ("outputs", "需要哪些交付物？例如 pptx、mp4、字幕（逗号分隔）", _list),
    ("visualDirection", "画面、色彩、素材或设计风格有什么要求？", _text),
    ("constraints", "有哪些禁区、版权、事实核验或其他约束？没有请明确写‘无’", _text),
    ("voiceCharacter", "旁白希望是什么样的音色？例如温暖、克制、年轻或沉稳（仅作记录，实际音色由 --profile 决定）", _text),
    ("voiceEmotion", "整场旁白的情绪基调是什么？例如平静、亲切或有张力（仅作记录）", _text),
    ("voicePace", "整场旁白的语速节奏是什么？例如慢速、自然或略快（仅作记录）", _text),
)

# Intent that the engine cannot infer from a topic name. A brief is incomplete
# without these, so content authoring stays blocked until they are answered.
REQUIRED_FIELD_KEYS: tuple[str, ...] = (
    "topic", "objective", "audience", "scope", "entities", "angle", "tone",
    "language", "slideCount", "durationMinutes", "outputs", "constraints",
)

# Refinements that improve the result but do not change what is factually true
# about the topic. `intake --minimal` skips them.
OPTIONAL_FIELD_KEYS: tuple[str, ...] = (
    "visualDirection", "voiceCharacter", "voiceEmotion", "voicePace",
)

# voice* fields are recorded intent only: the synthesised voice is fixed by the
# selected TTS profile, never per-deck. Documented in core/docs/tts.md.
VOICE_INTENT_KEYS: tuple[str, ...] = ("voiceCharacter", "voiceEmotion", "voicePace")

FIELD_LABELS = {key: prompt.split("？", 1)[0].split("（", 1)[0] for key, prompt, _ in FIELD_SPECS}
FIELD_KEYS = tuple(key for key, _, _ in FIELD_SPECS)
LIST_FIELD_KEYS = frozenset({"entities", "outputs"})


def empty_brief() -> dict[str, Any]:
    """Return a stable, serialisable draft brief."""

    return {
        "schemaVersion": BRIEF_SCHEMA_VERSION,
        "kind": BRIEF_KIND,
        "status": "draft",
        **{key: [] if key in LIST_FIELD_KEYS else None for key in FIELD_KEYS},
    }


def load_brief(path: Path) -> dict[str, Any]:
    if not path.exists():
        return empty_brief()
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("topic brief must be a JSON object")
    if value.get("schemaVersion") != BRIEF_SCHEMA_VERSION or value.get("kind") != BRIEF_KIND:
        raise ValueError("unsupported topic brief schema")
    return {**empty_brief(), **value}


def _is_blank(brief: dict[str, Any], key: str) -> bool:
    value = brief.get(key)
    if key in LIST_FIELD_KEYS:
        return not isinstance(value, list) or not [item for item in value if _text(item)]
    return value is None or not _text(value)


def missing_fields(brief: dict[str, Any], keys: tuple[str, ...] = FIELD_KEYS) -> list[str]:
    """Report unanswered fields among `keys` (defaults to every field)."""

    return [key for key in keys if _is_blank(brief, key)]


def missing_required_fields(brief: dict[str, Any]) -> list[str]:
    """Report only the fields that block content authoring."""

    return missing_fields(brief, REQUIRED_FIELD_KEYS)


def validate_brief(brief: dict[str, Any]) -> list[str]:
    """Return human-readable errors without changing the caller's object."""

    errors: list[str] = []
    if brief.get("schemaVersion") != BRIEF_SCHEMA_VERSION:
        errors.append("schemaVersion must be 1")
    if brief.get("kind") != BRIEF_KIND:
        errors.append(f"kind must be {BRIEF_KIND}")
    blocking = set(missing_required_fields(brief))
    for key, _, parser in FIELD_SPECS:
        if key in blocking:
            errors.append(f"missing required field: {key}")
            continue
        # Optional fields left blank are acceptable; only parse what is present.
        if _is_blank(brief, key):
            continue
        try:
            parsed = parser(brief.get(key))
            if key in LIST_FIELD_KEYS and not parsed:
                errors.append(f"{key} must contain at least one item")
        except (TypeError, ValueError) as error:
            errors.append(f"{key}: {error}")
    return errors


def is_confirmed(brief: dict[str, Any]) -> bool:
    return brief.get("status") == "confirmed" and not validate_brief(brief)


def summary_lines(brief: dict[str, Any]) -> list[str]:
    lines = []
    for key in FIELD_KEYS:
        value = brief.get(key)
        rendered = ", ".join(value) if isinstance(value, list) else _text(value)
        note = "（仅记录，不改变合成音色）" if key in VOICE_INTENT_KEYS and rendered else ""
        optional = "（可选）" if key in OPTIONAL_FIELD_KEYS and not rendered else ""
        lines.append(f"- {FIELD_LABELS[key]}: {rendered or '（未填写）'}{note}{optional}")
    return lines


def _ask_field(brief: dict[str, Any], key: str, prompt: str, parser: Callable[[Any], Any], ask: Callable[[str], str]) -> None:
    current = brief.get(key)
    default = ", ".join(current) if isinstance(current, list) else _text(current)
    suffix = f" [{default}]" if default else ""
    optional = key in OPTIONAL_FIELD_KEYS
    while True:
        answer = ask(f"{prompt}{suffix}{'（可留空跳过）' if optional else ''}: ").strip()
        if not answer and default:
            answer = default
        if not answer and optional:
            return
        try:
            parsed = parser(answer)
            if key in LIST_FIELD_KEYS and not parsed:
                raise ValueError("至少填写一项")
            brief[key] = parsed
            return
        except (TypeError, ValueError) as error:
            print(f"输入无效：{error}，请重新填写。")


def collect_interactively(
    brief: dict[str, Any],
    ask: Callable[[str], str] = input,
    minimal: bool = False,
) -> dict[str, Any]:
    """Ask missing fields, then repeat revisions until the caller confirms."""

    askable = REQUIRED_FIELD_KEYS if minimal else FIELD_KEYS
    pending = missing_fields(brief, askable) or list(askable)
    while True:
        for key, prompt, parser in FIELD_SPECS:
            if key not in pending:
                continue
            _ask_field(brief, key, prompt, parser, ask)
        print("\n请确认主题意图：")
        print("\n".join(summary_lines(brief)))
        if ask("以上信息完整且准确吗？输入 yes 确认，其他输入将继续修改: ").strip().lower() in {"y", "yes", "是", "确认"}:
            brief["status"] = "confirmed"
            return brief
        requested = ask("需要修改哪些字段？输入字段名（逗号分隔），留空则重新检查全部: ").strip()
        selected = _list(requested) if requested else list(askable)
        unknown = [key for key in selected if key not in FIELD_KEYS]
        if unknown:
            print(f"未知字段：{', '.join(unknown)}，将重新检查全部字段。")
            selected = list(askable)
        pending = selected


def apply_answers(brief: dict[str, Any], answers: dict[str, Any]) -> dict[str, Any]:
    """Apply machine-provided answers using the same parsers as the prompts."""

    for key, _, parser in FIELD_SPECS:
        if key in answers:
            brief[key] = parser(answers[key])
    return brief


def write_brief(path: Path, brief: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(brief, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
