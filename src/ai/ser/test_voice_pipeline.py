"""Pipeline-level test: recorded answers → measured voice → ser.audio_details.

Run from src/ai:  python -m pytest ser/test_voice_pipeline.py
"""

import io

import numpy as np
import pytest
import soundfile as sf

from ai_service import _attach_voice_details, _measure_answer_voice

SR = 16000


def wav_bytes(freq: float, seconds: float, amp: float) -> bytes:
    t = np.arange(int(SR * seconds)) / SR
    y = amp * (np.sin(2 * np.pi * freq * t) + 0.5 * np.sin(4 * np.pi * freq * t)) / 1.5
    y = np.concatenate([np.zeros(int(SR * 0.8)), y])  # answer starts after 0.8 s
    buf = io.BytesIO()
    sf.write(buf, y, SR, format="WAV")
    return buf.getvalue()


def test_each_answer_is_measured_and_compared_with_the_session():
    answers = {0: wav_bytes(200, 3, 0.1), 1: wav_bytes(200, 3, 0.1), 2: wav_bytes(250, 3, 0.2)}
    measured = {}
    for i, audio in answers.items():
        features = _measure_answer_voice(audio, f"audio_{i}.wav", i)
        assert features is not None
        features["words_per_minute"] = None
        measured[i] = features

    per_question = [{"question_index": i, "ser": {"emotion": "Neutral"}} for i in answers]
    _attach_voice_details(per_question, measured)

    raised = per_question[2]["ser"]["audio_details"]
    assert raised["pitch_mean_hz"] == pytest.approx(250, abs=6)
    assert raised["baseline"]["pitch_mean_hz"] == pytest.approx(200, abs=6)
    assert raised["pitch_vs_usual_pct"] == pytest.approx(25, abs=4)
    assert raised["pitch_label"].startswith("higher than usual")
    assert raised["loudness_vs_usual_db"] == pytest.approx(6, abs=0.5)
    assert raised["response_delay_s"] == pytest.approx(0.8, abs=0.1)
    assert per_question[0]["ser"]["audio_details"]["pitch_label"] == "about usual for this patient"


def test_unreadable_audio_is_skipped_not_fatal():
    assert _measure_answer_voice(b"not audio", "audio_0.wav", 0) is None
    per_question = [{"question_index": 0, "ser": None}]
    _attach_voice_details(per_question, {})
    assert per_question[0]["ser"] is None
