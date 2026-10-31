"""
Measured voice features for one answer: pitch, loudness, pace and pauses.

These are real measurements of the patient's recording (not model outputs),
shown next to the Voice Tone (SER) result so the therapist can see *how* the
voice sounded. Absolute loudness depends on the patient's microphone, so
every feature is also compared with the patient's own average for the
session ("12% higher than usual"), which is meaningful across microphones.
"""

from __future__ import annotations

import logging
from statistics import median

import librosa
import numpy as np

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16000
MAX_SECONDS = 180  # longest answer measured
FRAME = 1024
HOP = 256
# Human speaking pitch: ~85–180 Hz (men), ~165–255 Hz (women); allow margin.
PITCH_FMIN = 65.0
PITCH_FMAX = 450.0
PITCH_SR = 8000
SILENCE_TOP_DB = 35  # quieter than peak by this much = silence
MIN_SPEECH_DB = -55.0  # quieter overall than this = no speech at all
MIN_PAUSE_S = 0.3

# Relative-to-usual thresholds for the labels.
PITCH_CHANGE_PCT = 8.0
LOUDNESS_CHANGE_DB = 3.0
PACE_CHANGE_PCT = 15.0


def measure_voice(y: np.ndarray, sr: int = SAMPLE_RATE) -> dict | None:
    """Numeric voice features of a mono signal; None if there is no speech."""
    if y is None or len(y) < sr * 0.5:
        return None

    intervals = librosa.effects.split(y, top_db=SILENCE_TOP_DB, frame_length=FRAME, hop_length=HOP)
    if len(intervals) == 0:
        return None
    speech = np.concatenate([y[start:end] for start, end in intervals])
    if len(speech) < sr * 0.3:
        return None
    # Silence is "speech" relative to its own (silent) peak — require real level.
    if 20 * np.log10(max(float(np.sqrt(np.mean(speech**2))), 1e-10)) < MIN_SPEECH_DB:
        return None

    # Pitch (fundamental frequency) of voiced frames only. pYIN at 8 kHz with
    # a coarser search is ~5x faster and measured identically (speech pitch
    # is far below 4 kHz) — it keeps analysis quick on modest hardware.
    pitch_audio = librosa.resample(speech, orig_sr=sr, target_sr=PITCH_SR) if sr != PITCH_SR else speech
    f0, voiced, _ = librosa.pyin(
        pitch_audio,
        fmin=PITCH_FMIN,
        fmax=PITCH_FMAX,
        sr=PITCH_SR,
        frame_length=1024,
        hop_length=256,
        n_thresholds=30,
        resolution=0.2,
    )
    voiced_f0 = f0[voiced & ~np.isnan(f0)] if f0 is not None else np.array([])

    pitch = None
    if len(voiced_f0) >= 5:
        semitones = 12 * np.log2(voiced_f0 / np.median(voiced_f0))
        pitch = {
            "pitch_mean_hz": round(float(np.mean(voiced_f0)), 1),
            "pitch_median_hz": round(float(np.median(voiced_f0)), 1),
            "pitch_min_hz": round(float(np.percentile(voiced_f0, 10)), 1),
            "pitch_max_hz": round(float(np.percentile(voiced_f0, 90)), 1),
            "pitch_std_hz": round(float(np.std(voiced_f0)), 1),
            "pitch_std_semitones": round(float(np.std(semitones)), 2),
        }

    # Loudness of the speech parts, in dB relative to full scale.
    rms = float(np.sqrt(np.mean(speech**2)))
    loudness_db = round(20 * np.log10(max(rms, 1e-10)), 1)

    # Timing: when they started, how long they spoke, and the pauses between.
    starts = intervals[:, 0] / sr
    ends = intervals[:, 1] / sr
    gaps = starts[1:] - ends[:-1]
    pauses = gaps[gaps >= MIN_PAUSE_S]
    speaking_span = float(ends[-1] - starts[0])

    return {
        **(pitch or {}),
        "energy_rms": round(rms, 6),
        "loudness_db": float(loudness_db),
        "response_delay_s": round(float(starts[0]), 2),
        "speaking_time_s": round(speaking_span, 2),
        "pause_count": int(len(pauses)),
        "longest_pause_s": round(float(pauses.max()), 2) if len(pauses) else 0.0,
        "pause_ratio": round(float(pauses.sum() / speaking_span), 3) if speaking_span > 0 else 0.0,
    }


def measure_voice_file(wav_path: str) -> dict | None:
    """measure_voice for a WAV file (whole answer, up to MAX_SECONDS)."""
    y, sr = librosa.load(wav_path, sr=SAMPLE_RATE, mono=True, duration=MAX_SECONDS)
    return measure_voice(y, sr)


def words_per_minute(transcript: str | None, speaking_time_s: float) -> float | None:
    """Speaking pace from the transcript; None if it can't be computed."""
    if not transcript or speaking_time_s < 2 or transcript.startswith("["):
        return None
    words = len(transcript.split())
    return round(words / speaking_time_s * 60, 1) if words else None


def session_baseline(all_features: list[dict]) -> dict:
    """The patient's usual voice this session: medians across answers."""
    def med(key: str) -> float | None:
        values = [f[key] for f in all_features if f.get(key) is not None]
        return round(median(values), 1) if values else None

    return {
        "pitch_mean_hz": med("pitch_mean_hz"),
        "loudness_db": med("loudness_db"),
        "words_per_minute": med("words_per_minute"),
    }


def _pct(value: float | None, base: float | None) -> float | None:
    if value is None or not base:
        return None
    return round((value - base) / base * 100, 1)


def _relative(change: float | None, threshold: float, up: str, down: str, unit: str = "%") -> str:
    if change is None:
        return "no comparison available"
    if change >= threshold:
        return f"{up} than usual (+{change:g}{unit})"
    if change <= -threshold:
        return f"{down} than usual ({change:g}{unit})"
    return "about usual for this patient"


def _pace_label(wpm: float | None) -> str:
    # Typical conversational speech is roughly 120–160 words per minute.
    if wpm is None:
        return "unknown"
    if wpm < 110:
        return "slow"
    if wpm > 170:
        return "fast"
    return "moderate"


def _variability_label(std_semitones: float | None) -> str:
    if std_semitones is None:
        return "unknown"
    if std_semitones < 1.5:
        return "flat and monotone"
    if std_semitones > 3.5:
        return "very expressive"
    return "normal variation"


def describe_voice(features: dict, baseline: dict) -> dict:
    """audio_details for the UI: the numbers plus comparisons with the patient's usual voice."""
    pitch_change = _pct(features.get("pitch_mean_hz"), baseline.get("pitch_mean_hz"))
    loud_change = (
        round(features["loudness_db"] - baseline["loudness_db"], 1)
        if features.get("loudness_db") is not None and baseline.get("loudness_db") is not None
        else None
    )
    pace_change = _pct(features.get("words_per_minute"), baseline.get("words_per_minute"))

    details = {
        **features,
        "pitch_mean_hz": features.get("pitch_mean_hz", 0),
        "pitch_std_hz": features.get("pitch_std_hz", 0),
        "pitch_label": _relative(pitch_change, PITCH_CHANGE_PCT, "higher", "lower"),
        "pitch_variability": _variability_label(features.get("pitch_std_semitones")),
        "energy_label": _relative(loud_change, LOUDNESS_CHANGE_DB, "louder", "softer", " dB"),
        "speech_rate": _pace_label(features.get("words_per_minute")),
        "baseline": baseline,
        "pitch_vs_usual_pct": pitch_change,
        "loudness_vs_usual_db": loud_change,
        "pace_vs_usual_pct": pace_change,
    }

    parts = []
    if features.get("pitch_mean_hz"):
        parts.append(
            f"average pitch {features['pitch_mean_hz']:g} Hz "
            f"(range {features['pitch_min_hz']:g}–{features['pitch_max_hz']:g} Hz), {details['pitch_label']}"
        )
    parts.append(f"loudness {features['loudness_db']:g} dBFS, {details['energy_label']}")
    if features.get("words_per_minute"):
        parts.append(f"{features['words_per_minute']:g} words per minute ({details['speech_rate']})")
    parts.append(
        f"{features['pause_count']} pause{'s' if features['pause_count'] != 1 else ''}"
        + (f", longest {features['longest_pause_s']:g} s" if features["pause_count"] else "")
    )
    details["description"] = "Measured voice: " + "; ".join(parts) + "."
    return details
