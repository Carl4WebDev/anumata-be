"""LLM reports must reach the frontend with list fields as lists of strings — the
patient page crashed (i.map is not a function) when a list came back as one sentence."""

from report.report_generator import _validate_longitudinal_schema, _validate_schema


def test_longitudinal_sentence_becomes_one_item_list():
    report = _validate_longitudinal_schema({
        "overall_summary": "One session so far.",
        "session_changes": "Not applicable — only one session.",
        "limitations": None,
        "therapist_focus": [{"area": "Relationships", "why": "Mentioned often"}, "", "Sleep"],
        "evidence_quality": "Limited: one session only.",
    })
    assert report["session_changes"] == ["Not applicable — only one session."]
    assert report["limitations"] == []
    assert report["therapist_focus"] == ["Relationships — Mentioned often", "Sleep"]
    assert report["evidence_quality"]["notes"] == "Limited: one session only."
    for field in ("emotional_patterns", "recurring_indicators", "areas_for_attention",
                  "suggested_follow_up_questions", "session_highlights"):
        assert report[field] == []


def test_longitudinal_good_lists_are_kept():
    report = _validate_longitudinal_schema({
        "overall_summary": "Steady.",
        "emotional_patterns": ["Sadness in 2 of 3 sessions"],
        "evidence_quality": {"overall": "moderate", "notes": "3 sessions"},
    })
    assert report["emotional_patterns"] == ["Sadness in 2 of 3 sessions"]
    assert report["evidence_quality"] == {"overall": "moderate", "notes": "3 sessions"}


def test_session_report_lists_are_normalized():
    report = _validate_schema({
        "session_summary": "Calm overall.",
        "keywords": "family",
        "limitations": 5,
        "therapist_explanation": "Old field name.",
    })
    assert report["keywords"] == ["family"]
    assert report["limitations"] == ["5"]
    assert report["topics_discussed"] == []
    assert report["therapist_evaluation"] == "Old field name."
    assert report["evidence_quality"]["overall"] == "limited"


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("passed:", name)
