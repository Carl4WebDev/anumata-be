"""Tests for measured voice features, on synthetic audio with known answers.

Run from src/ai:  python -m pytest ser/test_acoustics.py
"""

import numpy as np
import pytest

from ser.acoustics import (
    SAMPLE_RATE,
    describe_voice,
    measure_voice,
    session_baseline,
    words_per_minute,
)

SR = SAMPLE_RATE


def tone(freq: float, seconds: float, amp: float = 0.3) -> np.ndarray:
    t = np.arange(int(SR * seconds)) / SR
    # A few harmonics so it looks like a voiced sound to the pitch tracker.
    return amp * (np.sin(2 * np.pi * freq * t) + 0.5 * np.sin(4 * np.pi * freq * t) + 0.25 * np.sin(6 * np.pi * freq * t)) / 1.75


def silence(seconds: float) -> np.ndarray:
    return np.zeros(int(SR * seconds))


def test_pitch_of_a_220_hz_voice_is_220_hz():
    f = measure_voice(tone(220, 2.0))
    assert f is not None
    assert f["pitch_mean_hz"] == pytest.approx(220, abs=5)
    assert f["pitch_min_hz"] <= f["pitch_mean_hz"] <= f["pitch_max_hz"]
    # A steady tone has almost no pitch variation.
    assert f["pitch_std_semitones"] < 0.5


def test_pauses_and_response_delay():
    y = np.concatenate([silence(1.5), tone(200, 1.0), silence(1.2), tone(200, 1.0), silence(0.5), tone(200, 1.0)])
    f = measure_voice(y)
    assert f["response_delay_s"] == pytest.approx(1.5, abs=0.1)
    assert f["pause_count"] == 2
    assert f["longest_pause_s"] == pytest.approx(1.2, abs=0.1)
    assert f["speaking_time_s"] == pytest.approx(4.7, abs=0.15)


def test_loudness_doubles_amplitude_adds_6_db():
    quiet = measure_voice(tone(200, 2.0, amp=0.1))
    loud = measure_voice(tone(200, 2.0, amp=0.2))
    assert loud["loudness_db"] - quiet["loudness_db"] == pytest.approx(6.0, abs=0.3)


def test_no_speech_returns_none():
    assert measure_voice(silence(3.0)) is None
    assert measure_voice(np.zeros(100)) is None


def test_words_per_minute():
    assert words_per_minute("one two three four five six seven eight nine ten", 5.0) == 120.0
    assert words_per_minute("[No speech detected]", 5.0) is None
    assert words_per_minute("hello", 1.0) is None


def test_baseline_and_comparisons():
    answers = [
        {"pitch_mean_hz": 200.0, "loudness_db": -25.0, "words_per_minute": 130.0},
        {"pitch_mean_hz": 210.0, "loudness_db": -24.0, "words_per_minute": 140.0},
        {"pitch_mean_hz": 240.0, "loudness_db": -20.0, "words_per_minute": 175.0},
    ]
    base = session_baseline(answers)
    assert base == {"pitch_mean_hz": 210.0, "loudness_db": -24.0, "words_per_minute": 140.0}

    raised = {
        **answers[2],
        "pitch_min_hz": 200.0,
        "pitch_max_hz": 280.0,
        "pitch_std_hz": 30.0,
        "pitch_std_semitones": 4.0,
        "energy_rms": 0.1,
        "pause_count": 1,
        "longest_pause_s": 0.8,
    }
    d = describe_voice(raised, base)
    assert d["pitch_vs_usual_pct"] == pytest.approx(14.3, abs=0.1)
    assert d["pitch_label"] == "higher than usual (+14.3%)"
    assert d["energy_label"] == "louder than usual (+4 dB)"
    assert d["speech_rate"] == "fast"
    assert d["pitch_variability"] == "very expressive"
    assert "average pitch 240 Hz (range 200–280 Hz)" in d["description"]
    assert "175 words per minute (fast)" in d["description"]


def test_typical_answer_reads_as_usual():
    base = {"pitch_mean_hz": 210.0, "loudness_db": -24.0, "words_per_minute": 140.0}
    f = {
        "pitch_mean_hz": 212.0, "pitch_min_hz": 190.0, "pitch_max_hz": 235.0, "pitch_std_hz": 12.0,
        "pitch_std_semitones": 2.0, "loudness_db": -24.5, "words_per_minute": 138.0, "energy_rms": 0.05,
        "pause_count": 0, "longest_pause_s": 0.0,
    }
    d = describe_voice(f, base)
    assert d["pitch_label"] == "about usual for this patient"
    assert d["energy_label"] == "about usual for this patient"
    assert d["speech_rate"] == "moderate"
    assert "0 pauses" in d["description"]
