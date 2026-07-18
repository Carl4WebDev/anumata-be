"""
STT (Speech-to-Text) service.

Uses faster-whisper for audio transcription.
Supports Filipino (Tagalog), Bisaya, and English with auto-detection.
"""

import logging
import tempfile
import time
from pathlib import Path

import numpy as np

from config import (
    STT_CONFIG,
    WHISPER_COMPUTE_TYPE,
    WHISPER_DEVICE,
    WHISPER_LANGUAGE,
    WHISPER_MODEL_SIZE,
)

logger = logging.getLogger(__name__)

_model = None


def _get_model():
    global _model
    if _model is None:
        logger.info(
            "Loading Whisper model (%s, device=%s, compute=%s)...",
            WHISPER_MODEL_SIZE, WHISPER_DEVICE, WHISPER_COMPUTE_TYPE,
        )
        start = time.time()
        _model = WhisperModel(
            WHISPER_MODEL_SIZE, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE_TYPE
        )
        elapsed = time.time() - start
        logger.info("Whisper model loaded in %.1fs", elapsed)
    return _model


def _convert_to_wav(audio_bytes: bytes, filename: str) -> str:
    """Convert audio bytes to WAV temp file."""
    suffix = Path(filename).suffix.lower() if filename else ".webm"

    if suffix == ".wav":
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        tmp.write(audio_bytes)
        tmp.close()
        return tmp.name

    from pydub import AudioSegment
    tmp_in = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    tmp_in.write(audio_bytes)
    tmp_in.close()

    tmp_out = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp_out.close()

    audio = AudioSegment.from_file(tmp_in.name)
    audio.export(tmp_out.name, format="wav")
    Path(tmp_in.name).unlink(missing_ok=True)
    return tmp_out.name


def _preprocess_audio(wav_path: str) -> str:
    """Apply audio preprocessing: normalize, reduce noise, trim silence."""
    from pydub import AudioSegment
    import pydub.effects as effects

    audio = AudioSegment.from_wav(wav_path)

    # 1. Normalize audio levels
    audio = effects.normalize(audio)

    # 2. Convert to mono if stereo
    if audio.channels > 1:
        audio = audio.set_channels(1)

    # 3. Set sample rate to 16kHz (Whisper's expected rate)
    audio = audio.set_frame_rate(16000)

    # 4. Apply high-pass filter to reduce low-frequency noise
    audio = audio.high_pass_filter(80)

    # 5. Apply low-pass filter to reduce high-frequency noise
    audio = audio.low_pass_filter(8000)

    # 6. Trim silence from start and end
    audio = effects.strip_silence(audio, silence_len=500, silence_thresh=-40)

    # Save preprocessed audio
    tmp_out = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp_out.close()
    audio.export(tmp_out.name, format="wav")

    return tmp_out.name


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """
    Transcribe audio to text with preprocessing and auto-detection.

    Returns transcribed text or "[No speech detected]" on failure.
    """
    model = _get_model()
    wav_path = None
    preprocessed_path = None

    try:
        start_time = time.time()

        # Convert to WAV
        wav_path = _convert_to_wav(audio_bytes, filename)
        logger.info("Audio converted to WAV: %s", filename)

        # Preprocess audio
        preprocessed_path = _preprocess_audio(wav_path)
        logger.info("Audio preprocessed (normalized, filtered, trimmed)")

        # Transcribe with auto-detection (no forced language)
        # This lets Whisper detect Filipino, Bisaya, English, or mixed
        segments, info = model.transcribe(
            preprocessed_path,
            beam_size=STT_CONFIG.beam_size,
            vad_filter=STT_CONFIG.vad_filter,
            language=None,  # Auto-detect language
            condition_on_previous_text=True,
            temperature=0.0,
            compression_ratio_threshold=2.4,
            log_prob_threshold=-1.0,
            no_speech_threshold=0.6,
        )

        text = " ".join(segment.text.strip() for segment in segments)
        elapsed = time.time() - start_time

        logger.info(
            "Transcription complete in %.1fs\n"
            "  Language: %s (prob: %.2f)\n"
            "  Duration: %.1fs\n"
            "  Text length: %d chars\n"
            "  Text: %s",
            elapsed,
            info.language,
            info.language_probability,
            info.duration,
            len(text),
            text[:200] if text else "(empty)",
        )

        if not text:
            return "[No speech detected]"

        return text

    except Exception as e:
        logger.error("Transcription failed for %s: %s", filename, e, exc_info=True)
        return "[Transcription failed]"

    finally:
        if wav_path:
            Path(wav_path).unlink(missing_ok=True)
        if preprocessed_path:
            Path(preprocessed_path).unlink(missing_ok=True)
