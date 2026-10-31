"""Unit tests for STT language handling (pure functions — no model needed).

Run from src/ai:  python -m pytest stt/test_language.py
"""

from stt.language import is_phantom, pick_language


def test_clear_english_and_tagalog():
    assert pick_language([("en", 0.9), ("tl", 0.05)]) == "en"
    assert pick_language([("tl", 0.8), ("en", 0.1)]) == "tl"


def test_bisaya_misdetected_as_indonesian_or_malay_goes_local():
    # Typical short Bisaya clip: Whisper guesses Indonesian/Malay.
    assert pick_language([("id", 0.45), ("ms", 0.2), ("en", 0.25), ("tl", 0.05)]) == "tl"
    assert pick_language([("jw", 0.5), ("en", 0.3)]) == "tl"


def test_hint_breaks_ties_only():
    ambiguous = [("en", 0.45), ("tl", 0.4)]
    assert pick_language(ambiguous) == "en"
    assert pick_language(ambiguous, hint="ceb") == "tl"
    assert pick_language(ambiguous, hint="tl") == "tl"
    # A clear signal beats the hint.
    assert pick_language([("en", 0.9), ("tl", 0.05)], hint="ceb") == "en"
    assert pick_language([("tl", 0.85), ("en", 0.1)], hint="en") == "tl"


def test_empty_probs_default_to_english_or_hint():
    assert pick_language([]) == "en"
    assert pick_language(None, hint="ceb") == "tl"


def test_phantom_phrases_dropped_only_when_unsure():
    assert is_phantom("Thank you.", no_speech_prob=0.5)
    assert is_phantom("Salamat po.", no_speech_prob=0.45)
    # Clearly spoken thanks is real speech.
    assert not is_phantom("Salamat po.", no_speech_prob=0.05)


def test_low_confidence_silence_dropped():
    assert is_phantom("random words", no_speech_prob=0.8, avg_logprob=-1.2)
    assert not is_phantom("Okay lang ako", no_speech_prob=0.1, avg_logprob=-0.3)
    assert is_phantom("   ")
