"""SER must hear the patient, not the muted-mic silence while Amumata reads the question."""

import numpy as np

from config import SER_MAX_DURATION
from ser.ser_service import speech_window

SR = 16000


def _tone(seconds: float, amplitude: float = 0.1) -> np.ndarray:
    t = np.arange(int(seconds * SR)) / SR
    return (amplitude * np.sin(2 * np.pi * 180 * t)).astype(np.float32)


def _rms(y: np.ndarray) -> float:
    return float(np.sqrt(np.mean(y**2))) if y.size else 0.0


def test_skips_the_silent_start_and_hears_the_answer() -> None:
    # 6 s of digital silence (mic muted while the question is read), then 10 s of speech.
    recording = np.concatenate([np.zeros(6 * SR, dtype=np.float32), _tone(10)])
    window = speech_window(recording, SR)
    assert len(window) == int(SER_MAX_DURATION * SR)
    assert _rms(window) > 0.05  # the old fixed slice (0.5–3.5 s) had RMS 0


def test_a_short_answer_is_still_used() -> None:
    window = speech_window(np.concatenate([np.zeros(4 * SR, dtype=np.float32), _tone(2)]), SR)
    assert _rms(window) > 0.05


def test_a_truly_silent_recording_stays_silent() -> None:
    assert _rms(speech_window(np.zeros(8 * SR, dtype=np.float32), SR)) == 0.0
