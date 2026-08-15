"""
MULTIMODAL FUSION ENGINE

Combines FER, SER, and LER outputs using confidence-adaptive weighted fusion.
Each modality's influence = base_weight × prediction_confidence, then normalized.

Algorithm:
    1. Filter invalid results (NoFace, Unknown excluded)
    2. effective_weight = base_weight × confidence
    3. combined_scores[e] = Σ(prob[e] × effective_weight) / Σ(effective_weight)
    4. Winner = max(combined_scores)
    5. Disagreement penalty: winner_score *= (0.5 + 0.5 × agreeing_count / n_modalities)

Base weights (from config.py):
    SER = 0.40 (40%)
    FER = 0.40 (40%)
    LER = 0.20 (20%)

This file also contains:
    - compute_risk_level() — High/Moderate/Low based on Sad%+Angry%
    - compute_indicators() — human-readable emotional pattern descriptions
    - detect_spikes() — 6 rules for emotional spike detection

Called by: ai/ai_service.py (after per-question FER/SER/LER)
Calls: nothing (pure computation)
"""

import logging
from typing import Optional

import numpy as np

from config import EMOTIONS_TITLE, RISK_HIGH_THRESHOLD, RISK_MODERATE_THRESHOLD
from fusion.fusion_config import FusionConfig, DEFAULT_CONFIG

logger = logging.getLogger(__name__)


def fuse_emotions(
    fer_result: Optional[dict] = None,
    ser_result: Optional[dict] = None,
    ler_result: Optional[dict] = None,
    config: FusionConfig = None,
) -> dict:
    """
    Fuse emotion predictions from multiple modalities.

    Args:
        fer_result: FER output {emotion, confidence, probabilities}
        ser_result: SER output {emotion, confidence, probabilities}
        ler_result: LER output {emotion, confidence, probabilities}
        config: FusionConfig with base weights

    Returns:
        {
            "emotion": str,
            "confidence": float,
            "probabilities": dict,
            "agreement": float,
            "model_results": {"fer": ..., "ser": ..., "ler": ...}
        }
    """
    if config is None:
        config = DEFAULT_CONFIG

    results = {}
    if fer_result and fer_result.get("emotion") not in ("NoFace", "Unknown"):
        results["fer"] = fer_result
    if ser_result and ser_result.get("emotion") not in ("Unknown",):
        results["ser"] = ser_result
    if ler_result and ler_result.get("emotion") not in ("Unknown",):
        results["ler"] = ler_result

    # No valid results
    if not results:
        return _default_neutral()

    # Single modality
    if len(results) == 1:
        modality = list(results.keys())[0]
        r = results[modality]
        return {
            "emotion": r["emotion"],
            "confidence": r["confidence"],
            "probabilities": r["probabilities"],
            "agreement": 100.0,
            "model_results": {k: v for k, v in results.items()},
        }

    # Multimodal fusion
    weight_map = {"fer": config.fer_weight, "ser": config.ser_weight, "ler": config.ler_weight}
    combined_scores = {e: 0.0 for e in EMOTIONS_TITLE}
    total_weight = 0.0

    for modality, result in results.items():
        base_weight = weight_map.get(modality, 0.33)
        confidence = result.get("confidence", 0.5)
        effective_weight = base_weight * confidence
        total_weight += effective_weight

        probs = result.get("probabilities", {})
        for emotion in EMOTIONS_TITLE:
            combined_scores[emotion] += probs.get(emotion, 0.0) * effective_weight

    # Normalize
    if total_weight > 0:
        for emotion in combined_scores:
            combined_scores[emotion] /= total_weight

    # Determine winner
    winner = max(combined_scores, key=combined_scores.get)
    winner_score = combined_scores[winner]

    # Confidence guard
    if winner_score < 0.20:
        winner = "Neutral"
        winner_score = combined_scores.get("Neutral", 0.20)

    # Agreement
    agreement = _compute_agreement(results)

    # Agreement-aware confidence damping
    # High individual confidence should NOT produce high fusion confidence when modalities disagree.
    emotions_list = [r["emotion"] for r in results.values()]
    unique_emotions = set(emotions_list)
    n_modalities = len(results)

    if len(unique_emotions) > 1 and n_modalities >= 2:
        agreeing_count = sum(1 for e in emotions_list if e == winner)
        agreement_ratio = agreeing_count / n_modalities
        # penalty range: 0.5 (no agreement) to 1.0 (full agreement)
        disagreement_penalty = 0.5 + 0.5 * agreement_ratio
        original_score = winner_score
        winner_score *= disagreement_penalty
        logger.info(
            "[FUSION] Disagreement penalty: %d/%d agree with %s, "
            "penalty=%.3f, confidence: %.1f%% → %.1f%%",
            agreeing_count, n_modalities, winner,
            disagreement_penalty, original_score * 100, winner_score * 100,
        )

    return {
        "emotion": winner,
        "confidence": round(winner_score, 4),
        "probabilities": {k: round(v, 4) for k, v in combined_scores.items()},
        "agreement": round(agreement, 2),
        "model_results": {k: v for k, v in results.items()},
    }


def compute_risk_level(distribution: dict) -> str:
    """
    Compute risk level from emotion distribution.

    Args:
        distribution: {"Sad": 40, "Angry": 20, "Neutral": 30, "Happy": 10}

    Returns: "High", "Moderate", or "Low"
    """
    negative = distribution.get("Sad", 0) + distribution.get("Angry", 0)
    if negative > RISK_HIGH_THRESHOLD:
        return "High"
    if negative > RISK_MODERATE_THRESHOLD:
        return "Moderate"
    return "Low"


def compute_indicators(distribution: dict) -> list:
    """Generate emotional indicators from distribution."""
    indicators = []
    sad = distribution.get("Sad", 0)
    angry = distribution.get("Angry", 0)
    happy = distribution.get("Happy", 0)
    neutral = distribution.get("Neutral", 0)

    if sad > 50:
        indicators.append("Predominantly sad affect")
    if angry > 30:
        indicators.append("Elevated anger indicators")
    if sad > 30 and angry > 20:
        indicators.append("Mixed negative emotions")
    if neutral > 70:
        indicators.append("Predominantly neutral affect")
    if happy > 50:
        indicators.append("Predominantly positive affect")

    return indicators


def detect_spikes(per_question: list, per_question_results: list = None) -> list:
    """
    Detect emotional spikes across interview questions.

    Rules:
    1. Transition: Neutral/Happy → Sad/Angry (confidence > 0.5)
    2. High-confidence negative: Sad/Angry with confidence >= 0.7
    3. Emotion flip: Sad ↔ Angry (confidence > 0.5)
    4. Intensification: Same negative emotion increasing by > 0.1 confidence
    5. High-confidence negative modality signal (even if fused result differs)
    6. Complete modality disagreement (all 3 modalities differ)
    """
    spikes = []

    for i, q in enumerate(per_question):
        emotion = q.get("combined_emotion", "Neutral")
        confidence = q.get("confidence", 0.0)

        # Rule 1: Transition from positive to negative
        if i > 0:
            prev_emotion = per_question[i - 1].get("combined_emotion", "Neutral")
            if prev_emotion in ("Neutral", "Happy") and emotion in ("Sad", "Angry") and confidence > 0.5:
                spikes.append({
                    "question_index": i,
                    "label": f"Emotional shift: {prev_emotion} → {emotion}",
                    "emotion": emotion,
                    "intensity": min(int(confidence * 100), 95),
                })

        # Rule 2: High-confidence negative
        if emotion in ("Sad", "Angry") and confidence >= 0.7:
            spikes.append({
                "question_index": i,
                "label": f"High-confidence {emotion.lower()} detected",
                "emotion": emotion,
                "intensity": min(int(confidence * 100), 95),
            })

        # Rule 3: Emotion flip
        if i > 0:
            prev_emotion = per_question[i - 1].get("combined_emotion", "Neutral")
            if {prev_emotion, emotion} == {"Sad", "Angry"} and confidence > 0.5:
                spikes.append({
                    "question_index": i,
                    "label": f"Emotion flip: {prev_emotion} → {emotion}",
                    "emotion": emotion,
                    "intensity": min(int(confidence * 100), 95),
                })

        # Rule 4: Intensification
        if i > 0:
            prev = per_question[i - 1]
            prev_emotion = prev.get("combined_emotion", "Neutral")
            prev_confidence = prev.get("confidence", 0.0)
            if prev_emotion == emotion and emotion in ("Sad", "Angry"):
                if confidence - prev_confidence > 0.1:
                    spikes.append({
                        "question_index": i,
                        "label": f"Intensifying {emotion.lower()} (confidence +{round((confidence - prev_confidence) * 100)}%)",
                        "emotion": emotion,
                        "intensity": min(int(confidence * 100), 95),
                    })

        # Rule 5: High-confidence negative modality signal
        # When a modality detects Sad/Angry at >= 80% but fused result differs, flag it.
        if per_question_results and i < len(per_question_results):
            q_result = per_question_results[i]
            model_results = q_result.get("model_results", {})
            for modality_name, result in model_results.items():
                mod_emotion = result.get("emotion", "")
                mod_confidence = result.get("confidence", 0.0)
                if mod_emotion in ("Sad", "Angry") and mod_confidence >= 0.80:
                    if emotion not in ("Sad", "Angry"):
                        spikes.append({
                            "question_index": i,
                            "label": f"High-confidence {mod_emotion.lower()} detected in {modality_name.upper()} ({mod_confidence:.0%})",
                            "emotion": mod_emotion,
                            "intensity": min(int(mod_confidence * 100), 95),
                            "type": "modality_alert",
                        })

            # Rule 6: Complete modality disagreement (all 3 differ)
            if len(model_results) >= 3:
                emotions_set = set(r.get("emotion", "") for r in model_results.values())
                if len(emotions_set) == 3:
                    spikes.append({
                        "question_index": i,
                        "label": "Complete modality disagreement — all three modalities differ",
                        "emotion": emotion,
                        "intensity": 50,
                        "type": "disagreement",
                    })

    return spikes


def _compute_agreement(results: dict) -> float:
    """Compute model agreement percentage."""
    if len(results) < 2:
        return 100.0

    emotions = [r["emotion"] for r in results.values()]
    unique = set(emotions)

    if len(unique) == 1:
        return 100.0
    if len(unique) == 2:
        return 66.67
    return 33.33


def _default_neutral() -> dict:
    probs = {e: 0.0 for e in EMOTIONS_TITLE}
    probs["Neutral"] = 1.0
    return {
        "emotion": "Neutral",
        "confidence": 1.0,
        "probabilities": probs,
        "agreement": 0.0,
        "model_results": {},
    }
