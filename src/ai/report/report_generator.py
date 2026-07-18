"""
AI Report Generator — Qwen 3:4B via Ollama.

Generates session summaries, topics, keywords, therapist explanations,
and follow-up questions. NEVER predicts emotions or diagnoses.

Qwen MUST NOT:
- Predict emotions
- Override fusion results
- Change emotional labels
- Diagnose mental illnesses
- Determine suicide risk
"""

import json
import logging
import re
import time
from typing import Dict, List, Optional

import requests

from config import OLLAMA_BASE_URL, OLLAMA_MODEL

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a report-writing assistant for psychotherapy sessions. Your role is to generate structured summaries from emotion analysis data.

IMPORTANT RULES:
- NEVER predict emotions. Emotion analysis is already complete.
- NEVER diagnose mental illnesses (depression, anxiety, PTSD, etc.).
- NEVER determine suicide risk.
- NEVER override or change emotional labels from the analysis.
- Use hedging language: "may indicate", "appeared associated with", "suggested".
- The therapist is the final decision-maker.

Your output must be valid JSON with these fields:
- "session_summary": A 2-3 sentence summary of the emotional patterns observed.
- "topics_discussed": List of main topics extracted from the transcript.
- "keywords": List of significant emotional keywords found.
- "therapist_explanation": A brief, professional explanation suitable for a therapist.
- "suggested_follow_ups": List of 3-5 suggested follow-up questions for the next session.
"""


def generate_report(
    transcript: List[Dict],
    fusion_results: List[Dict],
    overall_distribution: Dict[str, float],
    risk_level: str,
    indicators: List[str],
    spikes: List[Dict],
) -> Dict:
    """
    Generate a therapist-friendly session report using Qwen via Ollama.

    Returns:
        {
            "session_summary": str,
            "topics_discussed": list,
            "keywords": list,
            "therapist_explanation": str,
            "suggested_follow_ups": list
        }
    """
    logger.info("Starting AI Summary generation...")
    start_time = time.time()

    context = _build_context(
        transcript, fusion_results, overall_distribution,
        risk_level, indicators, spikes,
    )
    logger.info("Prompt generated successfully (%d chars)", len(context))

    try:
        logger.info("Calling Ollama at %s with model %s...", OLLAMA_BASE_URL, OLLAMA_MODEL)
        response = requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "system": SYSTEM_PROMPT,
                "prompt": context,
                "stream": False,
                "options": {
                    "temperature": 0.3,
                    "num_predict": 1024,
                },
            },
            timeout=120,
        )

        if response.status_code != 200:
            logger.error(
                "Ollama returned non-200.\n"
                "  Status: %s\n"
                "  Response: %s",
                response.status_code, response.text[:500],
            )
            return _fallback_report(overall_distribution, risk_level)

        result = response.json()
        raw_output = result.get("response", "")
        logger.info("Ollama response received (%d chars)", len(raw_output))

        # Strip Qwen3 thinking tags before JSON extraction
        cleaned_output = _strip_thinking_tags(raw_output)
        if cleaned_output != raw_output:
            logger.info("Stripped thinking tags from Qwen response (%d -> %d chars)", len(raw_output), len(cleaned_output))

        parsed = _extract_json(cleaned_output)
        if parsed:
            elapsed = time.time() - start_time
            logger.info("Summary parsed successfully in %.1fs", elapsed)
            return parsed

        # Log the raw response when parsing fails
        logger.warning(
            "Failed to parse Qwen JSON. Using fallback.\n"
            "  Raw output (first 500 chars): %s\n"
            "  Cleaned output (first 500 chars): %s",
            raw_output[:500], cleaned_output[:500],
        )
        return _fallback_report(overall_distribution, risk_level)

    except requests.ConnectionError:
        logger.warning("Ollama not available at %s — connection refused", OLLAMA_BASE_URL)
        return _fallback_report(overall_distribution, risk_level)

    except requests.Timeout:
        logger.error("Ollama request timed out after 120s")
        return _fallback_report(overall_distribution, risk_level)

    except Exception as e:
        logger.error("Report generation failed: %s", e, exc_info=True)
        return _fallback_report(overall_distribution, risk_level)


def _strip_thinking_tags(text: str) -> str:
    """Remove Qwen3 <think>...</think> tags from the response."""
    # Remove <think>...</think> blocks (may span multiple lines)
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    return cleaned.strip()


def _build_context(
    transcript, fusion_results, distribution, risk_level, indicators, spikes,
) -> str:
    lines = []
    lines.append("=== SESSION EMOTION ANALYSIS ===\n")
    lines.append(f"Risk Level: {risk_level}")
    lines.append(f"Overall Distribution: {json.dumps(distribution)}")
    lines.append(f"Indicators: {json.dumps(indicators)}")
    lines.append(f"Emotional Spikes: {json.dumps(spikes)}")

    lines.append("\n=== TRANSCRIPT ===\n")
    for i, entry in enumerate(transcript):
        q = entry.get("question", f"Question {i + 1}")
        a = entry.get("answer", "")
        emotion = entry.get("emotion", "N/A")
        confidence = entry.get("confidence", 0)

        lines.append(f"Q{i + 1}: {q}")
        lines.append(f"A{i + 1}: {a}")
        lines.append(f"Emotion: {emotion} ({confidence:.0%})")
        lines.append("")

    lines.append("\nGenerate the session report as JSON.")
    return "\n".join(lines)


def _extract_json(text: str) -> Optional[Dict]:
    """Extract JSON from Qwen's response."""
    # Strategy 1: Direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Strategy 2: Extract from markdown code blocks
    json_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass

    # Strategy 3: Brace matching — find first { and last }
    brace_start = text.find("{")
    brace_end = text.rfind("}")
    if brace_start != -1 and brace_end != -1:
        try:
            return json.loads(text[brace_start:brace_end + 1])
        except json.JSONDecodeError:
            pass

    return None


def _fallback_report(distribution: Dict, risk_level: str) -> Dict:
    """Fallback when Ollama is unavailable."""
    dominant = max(distribution, key=distribution.get) if distribution else "Neutral"
    dominant_pct = distribution.get(dominant, 0)

    return {
        "session_summary": (
            f"The session showed predominantly {dominant.lower()} affect "
            f"({dominant_pct:.0f}%). "
            f"Risk level assessed as {risk_level.lower()}."
        ),
        "topics_discussed": [],
        "keywords": [dominant.lower()],
        "therapist_explanation": (
            f"Based on the automated analysis, the patient's emotional indicators "
            f"were predominantly {dominant.lower()}. "
            f"The risk level is assessed as {risk_level.lower()}. "
            f"Please review the detailed per-question breakdown for clinical context."
        ),
        "suggested_follow_ups": [
            "How have you been feeling since our last session?",
            "Can you tell me more about what triggered these emotions?",
            "What coping strategies have you tried recently?",
        ],
    }
