"""
AI Service Orchestrator.

Coordinates FER, SER, LER, STT, fusion, and report generation
for the full interview analysis pipeline.

Pipeline per question:
    FER → SER → STT → LER → Fusion → Store

After all questions:
    Overall distribution → Risk assessment → Spike detection → Report generation
"""

import logging
import time
from collections import Counter
from typing import Dict, List

from fer.fer_service import predict_emotion as fer_predict
from ser.ser_service import predict_emotion as ser_predict
from ler.ler_service import predict_emotion as ler_predict
from stt.stt_service import transcribe_audio
from fusion.fusion_engine import (
    fuse_emotions,
    compute_risk_level,
    compute_indicators,
    detect_spikes,
)
from report.report_generator import generate_report
from config import EMOTIONS_TITLE

logger = logging.getLogger(__name__)


def analyze_interview(
    questions: List[str],
    frames: Dict[int, bytes],
    audios: Dict[int, bytes],
    audio_filenames: Dict[int, str],
) -> dict:
    """
    Run the full analysis pipeline on an interview.

    Args:
        questions: List of question texts.
        frames: {question_index: image_bytes} — JPEG frames from webcam.
        audios: {question_index: audio_bytes} — recorded audio per question.
        audio_filenames: {question_index: filename} — original audio filenames.

    Returns:
        {
            "per_question": [...],
            "overall_distribution": {...},
            "risk_level": str,
            "indicators": [...],
            "spikes": [...],
            "report": {...}
        }
    """
    pipeline_start = time.time()
    per_question = []
    fusion_results = []
    transcript_entries = []

    logger.info("=" * 60)
    logger.info("Starting AI pipeline: %d questions, %d frames, %d audios",
                len(questions), len(frames), len(audios))
    logger.info("=" * 60)

    for i, question in enumerate(questions):
        q_start = time.time()
        logger.info("--- Q%d/%d ---", i + 1, len(questions))

        # --- FER ---
        fer_result = None
        if i in frames:
            try:
                fer_start = time.time()
                fer_result = fer_predict(frames[i])
                fer_elapsed = time.time() - fer_start
                logger.info(
                    "FER completed in %.1fs\n"
                    "  Emotion: %s\n"
                    "  Confidence: %.1f%%",
                    fer_elapsed,
                    fer_result.get("emotion", "N/A"),
                    fer_result.get("confidence", 0) * 100,
                )
            except Exception as e:
                logger.error("FER failed for Q%d: %s", i, e, exc_info=True)
        else:
            logger.warning("FER skipped for Q%d: no frame", i)

        # --- SER ---
        ser_result = None
        if i in audios:
            try:
                ser_start = time.time()
                ser_result = ser_predict(audios[i], audio_filenames.get(i, "audio.webm"))
                ser_elapsed = time.time() - ser_start
                logger.info(
                    "SER completed in %.1fs\n"
                    "  Emotion: %s\n"
                    "  Confidence: %.1f%%",
                    ser_elapsed,
                    ser_result.get("emotion", "N/A"),
                    ser_result.get("confidence", 0) * 100,
                )
            except Exception as e:
                logger.error("SER failed for Q%d: %s", i, e, exc_info=True)
        else:
            logger.warning("SER skipped for Q%d: no audio", i)

        # --- Speech-to-Text (BEFORE LER) ---
        transcript_text = None
        if i in audios:
            try:
                stt_start = time.time()
                transcript_text = transcribe_audio(audios[i], audio_filenames.get(i, "audio.webm"))
                stt_elapsed = time.time() - stt_start
                logger.info(
                    "STT completed in %.1fs\n"
                    "  Text: %s",
                    stt_elapsed,
                    (transcript_text[:100] + "...") if len(transcript_text) > 100 else transcript_text,
                )
            except Exception as e:
                logger.error("STT failed for Q%d: %s", i, e, exc_info=True)
                transcript_text = "[Transcription failed]"
        else:
            logger.warning("STT skipped for Q%d: no audio", i)

        # --- LER (from transcript) ---
        ler_result = None
        if transcript_text and transcript_text not in ("[No speech detected]", "[Transcription failed]"):
            try:
                ler_start = time.time()
                ler_result = ler_predict(transcript_text)
                ler_elapsed = time.time() - ler_start
                logger.info(
                    "LER completed in %.1fs\n"
                    "  Emotion: %s\n"
                    "  Confidence: %.1f%%\n"
                    "  Language: %s",
                    ler_elapsed,
                    ler_result.get("emotion", "N/A"),
                    ler_result.get("confidence", 0) * 100,
                    ler_result.get("language_detected", "N/A"),
                )
            except Exception as e:
                logger.error("LER failed for Q%d: %s", i, e, exc_info=True)
        else:
            logger.warning("LER skipped for Q%d: no valid transcript", i)

        # --- Fusion ---
        fusion_start = time.time()
        fusion = fuse_emotions(fer_result, ser_result, ler_result)
        fusion_elapsed = time.time() - fusion_start
        fusion_results.append(fusion)

        logger.info(
            "Fusion completed in %.1fs\n"
            "  Final Emotion: %s\n"
            "  Confidence: %.1f%%\n"
            "  Agreement: %.0f%%",
            fusion_elapsed,
            fusion["emotion"],
            fusion["confidence"] * 100,
            fusion.get("agreement", 0),
        )

        # Build per-question entry
        entry = {
            "question_index": i,
            "question": question,
            "fer": fer_result,
            "ser": ser_result,
            "ler": ler_result,
            "combined_emotion": fusion["emotion"],
            "confidence": fusion["confidence"],
            "agreement": fusion["agreement"],
            "transcript_text": transcript_text,
        }
        per_question.append(entry)

        # Build transcript entry for report
        transcript_entries.append({
            "question": question,
            "answer": transcript_text or "",
            "emotion": fusion["emotion"],
            "confidence": fusion["confidence"],
        })

        q_elapsed = time.time() - q_start
        logger.info(
            "Q%d complete in %.1fs | FER=%s SER=%s LER=%s -> %s (%.1f%%)",
            i, q_elapsed,
            fer_result["emotion"] if fer_result else "N/A",
            ser_result["emotion"] if ser_result else "N/A",
            ler_result["emotion"] if ler_result else "N/A",
            fusion["emotion"],
            fusion["confidence"] * 100,
        )

    # --- Pipeline validation ---
    _validate_pipeline(per_question, frames, audios)

    # --- Session-level aggregation ---
    logger.info("Computing session-level aggregation...")
    distribution = _compute_distribution(fusion_results)
    risk_level = compute_risk_level(distribution)
    indicators = compute_indicators(distribution)
    spikes = detect_spikes(per_question)

    logger.info("Distribution: %s", distribution)
    logger.info("Risk Level: %s", risk_level)
    logger.info("Spikes: %d detected", len(spikes))

    # --- Report generation (Qwen via Ollama) ---
    report = generate_report(
        transcript=transcript_entries,
        fusion_results=fusion_results,
        overall_distribution=distribution,
        risk_level=risk_level,
        indicators=indicators,
        spikes=spikes,
    )

    total_elapsed = time.time() - pipeline_start
    logger.info("=" * 60)
    logger.info("Pipeline complete in %.1fs", total_elapsed)
    logger.info("=" * 60)

    return {
        "per_question": per_question,
        "overall_distribution": distribution,
        "risk_level": risk_level,
        "indicators": indicators,
        "spikes": spikes,
        "report": report,
    }


def _validate_pipeline(per_question: list, frames: dict, audios: dict) -> None:
    """Log pipeline validation — which stages succeeded/failed per question."""
    logger.info("--- Pipeline Validation ---")
    for entry in per_question:
        i = entry["question_index"]
        has_frame = i in frames
        has_audio = i in audios

        fer_ok = entry["fer"] is not None
        ser_ok = entry["ser"] is not None
        stt_ok = entry["transcript_text"] not in (None, "[No speech detected]", "[Transcription failed]")
        ler_ok = entry["ler"] is not None
        fusion_ok = entry["combined_emotion"] not in ("Unknown", "Neutral") or entry["confidence"] > 0

        stages = []
        if has_frame:
            stages.append(f"FER:{'OK' if fer_ok else 'FAIL'}")
        if has_audio:
            stages.append(f"SER:{'OK' if ser_ok else 'FAIL'}")
            stages.append(f"STT:{'OK' if stt_ok else 'FAIL'}")
        if stt_ok:
            stages.append(f"LER:{'OK' if ler_ok else 'FAIL'}")
        stages.append(f"Fusion:{'OK' if fusion_ok else 'FAIL'}")

        logger.info("  Q%d: %s", i, " | ".join(stages))


def _compute_distribution(fusion_results: list) -> dict:
    """Compute overall emotion distribution from fused results."""
    counts = Counter()
    for r in fusion_results:
        emotion = r.get("emotion", "Neutral")
        counts[emotion] += 1

    total = sum(counts.values()) or 1
    return {
        emotion: round(counts.get(emotion, 0) / total * 100, 1)
        for emotion in EMOTIONS_TITLE
    }
