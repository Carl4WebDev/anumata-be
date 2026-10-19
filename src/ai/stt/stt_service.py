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
from faster_whisper import WhisperModel

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
    original_duration = len(audio) / 1000.0
    logger.info("[STT PREPROCESS] Input: %.2fs, %dHz, %d channels, %d dBFS",
                original_duration, audio.frame_rate, audio.channels, audio.dBFS)

    # 1. Normalize audio levels
    audio = effects.normalize(audio)
    logger.info("[STT PREPROCESS] After normalize: %d dBFS", audio.dBFS)

    # 2. Convert to mono if stereo
    if audio.channels > 1:
        audio = audio.set_channels(1)
        logger.info("[STT PREPROCESS] Converted to mono")

    # 3. Set sample rate to 16kHz (Whisper's expected rate)
    audio = audio.set_frame_rate(16000)

    # 4. Apply high-pass filter to reduce low-frequency noise
    audio = audio.high_pass_filter(80)

    # 5. Apply low-pass filter to reduce high-frequency noise
    audio = audio.low_pass_filter(8000)
    logger.info("[STT PREPROCESS] Filters applied (HP 80Hz, LP 8000Hz)")

    # 6. Trim silence from start and end — but guard against stripping too much
    stripped = effects.strip_silence(audio, silence_len=500, silence_thresh=-40)
    stripped_duration = len(stripped) / 1000.0
    logger.info("[STT PREPROCESS] After strip_silence: %.2fs (was %.2fs)", stripped_duration, original_duration)

    # If stripping removed more than 60% of audio or left < 1.0s, skip stripping
    if stripped_duration < 1.0 or stripped_duration < original_duration * 0.4:
        logger.warning("[STT PREPROCESS] Strip silence too aggressive (%.2fs remaining), using unstripped audio",
                        stripped_duration)
        stripped = audio

    # Save preprocessed audio
    tmp_out = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp_out.close()
    stripped.export(tmp_out.name, format="wav")
    final_duration = len(stripped) / 1000.0
    logger.info("[STT PREPROCESS] Output: %.2fs, saved to %s", final_duration, tmp_out.name)

    return tmp_out.name


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> dict:
    """
    Transcribe audio to text with preprocessing and auto-detection.

    Returns dict with transcription result and quality metadata.
    """
    model = _get_model()
    wav_path = None
    preprocessed_path = None

    logger.info("[STT] Starting transcription: %s (%d bytes)", filename, len(audio_bytes))

    try:
        start_time = time.time()

        # Convert to WAV
        wav_path = _convert_to_wav(audio_bytes, filename)
        logger.info("[STT] Audio converted to WAV")

        # Preprocess audio
        preprocessed_path = _preprocess_audio(wav_path)
        logger.info("[STT] Audio preprocessed")

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
            "[STT] Transcription complete in %.1fs\n"
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
            logger.warning("[STT] No speech detected in %s", filename)
            return {
                "text": "[No speech detected]",
                "language": info.language,
                "language_probability": round(info.language_probability, 4),
                "duration": round(info.duration, 2),
                "processing_time": round(elapsed, 2),
            }

        return {
            "text": text,
            "language": info.language,
            "language_probability": round(info.language_probability, 4),
            "duration": round(info.duration, 2),
            "processing_time": round(elapsed, 2),
        }

    except Exception as e:
        logger.error("[STT] Transcription FAILED for %s: %s: %s", filename, type(e).__name__, e, exc_info=True)
        return {
            "text": "[Transcription failed]",
            "language": None,
            "language_probability": None,
            "duration": 0,
            "processing_time": 0,
        }

    finally:
        if wav_path:
            Path(wav_path).unlink(missing_ok=True)
        if preprocessed_path:
            Path(preprocessed_path).unlink(missing_ok=True)
