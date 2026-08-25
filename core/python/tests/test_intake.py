import json
from pathlib import Path

import pytest

from lusine_builder.intake import (
    FIELD_KEYS,
    OPTIONAL_FIELD_KEYS,
    REQUIRED_FIELD_KEYS,
    VOICE_INTENT_KEYS,
    _positive_int,
    apply_answers,
    collect_interactively,
    empty_brief,
    is_confirmed,
    missing_fields,
    missing_required_fields,
    validate_brief,
    write_brief,
)


def complete_answers() -> dict:
    return {
        "topic": "东北文艺复兴三杰",
        "objective": "让观众理解三位代表人物如何形成共同的文化现象",
        "audience": "对东北流行文化感兴趣的普通观众",
        "scope": "聚焦人物、作品和时代语境，不做未经证实的私生活推断",
        "entities": ["人物甲", "人物乙", "人物丙"],
        "angle": "从地方经验到全国文化符号",
        "tone": "轻松但尊重事实",
        "language": "zh-CN",
        "slideCount": 8,
        "durationMinutes": 10,
        "outputs": ["pptx", "mp4"],
        "visualDirection": "高对比、档案感、适量东北地域视觉元素",
        "constraints": "人物名单和事实必须由用户确认",
        "voiceCharacter": "沉稳、略带叙事感",
        "voiceEmotion": "克制而温暖",
        "voicePace": "自然偏慢",
    }


def test_empty_brief_reports_all_required_fields():
    brief = empty_brief()
    assert len(missing_fields(brief)) == 16
    assert validate_brief(brief)


def test_complete_answers_are_valid_only_after_explicit_confirmation():
    brief = apply_answers(empty_brief(), complete_answers())
    assert not validate_brief(brief)
    assert not is_confirmed(brief)
    brief["status"] = "confirmed"
    assert is_confirmed(brief)


def test_brief_round_trip(tmp_path: Path):
    path = tmp_path / "topic-brief.json"
    brief = apply_answers(empty_brief(), complete_answers())
    write_brief(path, brief)
    assert json.loads(path.read_text(encoding="utf-8"))["topic"] == "东北文艺复兴三杰"


def test_interactive_intake_requires_confirmation_after_revision():
    answers = complete_answers()
    responses = [str(answers[key]) if key not in {"entities", "outputs"} else ",".join(answers[key]) for key in FIELD_KEYS]
    responses.extend(["no", "angle", "改为从边缘文化到主流符号", "yes"])
    response_iter = iter(responses)
    brief = collect_interactively(empty_brief(), lambda _: next(response_iter))
    assert brief["status"] == "confirmed"
    assert brief["angle"] == "改为从边缘文化到主流符号"


def test_optional_fields_do_not_block_confirmation():
    """Voice and visual hints refine a deck but must not gate authoring."""
    answers = {key: value for key, value in complete_answers().items() if key in REQUIRED_FIELD_KEYS}
    brief = apply_answers(empty_brief(), answers)
    assert missing_required_fields(brief) == []
    assert validate_brief(brief) == []
    assert sorted(missing_fields(brief)) == sorted(OPTIONAL_FIELD_KEYS)
    brief["status"] = "confirmed"
    assert is_confirmed(brief)


def test_missing_required_field_still_blocks_confirmation():
    answers = {key: value for key, value in complete_answers().items() if key in REQUIRED_FIELD_KEYS}
    answers.pop("entities")
    brief = apply_answers(empty_brief(), answers)
    brief["status"] = "confirmed"
    assert "entities" in missing_required_fields(brief)
    assert not is_confirmed(brief)


def test_minimal_intake_only_asks_the_blocking_fields():
    answers = complete_answers()
    responses = [
        ",".join(answers[key]) if key in {"entities", "outputs"} else str(answers[key])
        for key in REQUIRED_FIELD_KEYS
    ]
    responses.append("yes")
    response_iter = iter(responses)
    asked: list[str] = []

    def ask(prompt: str) -> str:
        asked.append(prompt)
        return next(response_iter)

    brief = collect_interactively(empty_brief(), ask, minimal=True)
    assert brief["status"] == "confirmed"
    # 12 blocking questions plus the single confirmation prompt.
    assert len(asked) == len(REQUIRED_FIELD_KEYS) + 1
    for key in OPTIONAL_FIELD_KEYS:
        assert brief[key] in (None, [])


def test_slide_count_rejects_non_numeric_input_with_a_readable_message():
    with pytest.raises(ValueError, match="正整数"):
        _positive_int("八页")
    with pytest.raises(ValueError, match="大于 0"):
        _positive_int("0")


def test_voice_intent_keys_are_all_optional():
    """voice* is recorded intent only, so it can never block a build."""
    assert set(VOICE_INTENT_KEYS).issubset(set(OPTIONAL_FIELD_KEYS))
