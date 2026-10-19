"""
AI Report Generator — Local LLM via Ollama.

Generates session summaries, topics, keywords, therapist explanations,
and follow-up questions. NEVER predicts emotions or diagnoses.

The LLM MUST NOT:
- Predict emotions (FER/SER/LER already do this)
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

from config import OLLAMA_BASE_URL, OLLAMA_MODEL, OLLAMA_CONFIG

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a report-writing assistant for psychotherapy pre-evaluation sessions. Your role is to generate structured summaries from emotion analysis data.

IMPORTANT RULES:
- NEVER predict emotions. Emotion analysis is already complete.
- NEVER diagnose mental illnesses (depression, anxiety, PTSD, etc.).
- NEVER determine suicide risk.
- NEVER override or change emotional labels from the analysis.
- Use hedging language: "may indicate", "appeared associated with", "suggested".
- The therapist is the final decision-maker.
- Only discuss evidence that is actually available.
- If a modality is unavailable, acknowledge it as a limitation.

Your output MUST be valid JSON with these exact fields:
- "session_summary": A 2-3 sentence summary of the emotional patterns observed.
- "key_emotional_findings": List of 2-4 key emotional findings from the session (e.g., notable emotional shifts, high-confidence detections, concerning patterns).
- "areas_for_attention": List of 1-3 areas the therapist may want to explore further based on the evidence.
- "therapist_evaluation": A brief, professional evaluation paragraph suitable for a therapist, summarizing the clinical picture from the automated analysis.
- "suggested_therapist_focus": List of 1-3 higher-level areas the therapist may want to explore (e.g., "Explore the context surrounding the emotional shift detected during Question 3").
- "suggested_follow_ups": List of 2-4 concrete, open-ended questions the therapist can ask the client in a subsequent session. These MUST be directly related to the client's actual responses and detected emotional changes. Do NOT use generic questions like "How are you feeling today?" unless genuinely appropriate for the session context.
- "topics_discussed": List of main topics extracted from the transcript.
- "keywords": List of significant emotional keywords found.
- "evidence_quality": An object with keys "fer", "ser", "ler" (each "available" or "unavailable") and "overall" ("strong", "moderate", or "limited"). Note: LER is experimental and excluded from fusion — do not present it as validated evidence.
- "limitations": List of 1-3 limitations or caveats about the analysis (e.g., missing modalities, low confidence, language detection issues).

Output ONLY the JSON object. No markdown fences, no explanatory text."""


def generate_report(
    transcript: List[Dict],
    fusion_results: List[Dict],
    overall_distribution: Dict[str, float],
    risk_level: str,
    indicators: List[str],
    spikes: List[Dict],
    max_retries: int = 2,
    retry_delay: float = 5.0,
) -> Dict:
    """
    Generate a therapist-friendly session report using a local LLM via Ollama.

    Returns:
        {
            "session_summary": str,
            "topics_discussed": list,
            "keywords": list,
            "therapist_explanation": str,
            "suggested_follow_ups": list,
            "report_source": "llm" | "fallback"
        }
    """
    logger.info("[REPORT] Starting generation")
    start_time = time.time()

    context = _build_context(
        transcript, fusion_results, overall_distribution,
        risk_level, indicators, spikes,
    )
    logger.info("[REPORT] Structured session evidence prepared (%d chars)", len(context))

    timeout = OLLAMA_CONFIG.timeout

    for attempt in range(1 + max_retries):
        is_retry = attempt > 0
        if is_retry:
            logger.warning("[REPORT] Retry %d/%d after %.1fs", attempt, max_retries, retry_delay)
            time.sleep(retry_delay)

        try:
            logger.info("[REPORT] Model: %s", OLLAMA_MODEL)
            logger.info("[REPORT] Ollama endpoint: %s (timeout=%ds)", OLLAMA_BASE_URL, timeout)

            response = requests.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "system": SYSTEM_PROMPT,
                    "prompt": context,
                    "stream": False,
                    "options": {
                        "temperature": OLLAMA_CONFIG.temperature,
                        "num_predict": OLLAMA_CONFIG.num_predict,
                    },
                },
                timeout=timeout,
            )

            logger.info("[REPORT] Ollama HTTP status: %d", response.status_code)

            if response.status_code != 200:
                logger.error(
                    "[REPORT ERROR] Ollama returned non-200.\n"
                    "  Status: %s\n"
                    "  Response: %s",
                    response.status_code, response.text[:500],
                )
                # Non-200 is likely not transient — don't retry
                return _fallback_report(overall_distribution, risk_level, transcript, spikes)

            result = response.json()

            # Diagnostic: log response metadata (not patient content)
            logger.info(
                "[REPORT] Response received\n"
                "  response_length: %d chars\n"
                "  done: %s\n"
                "  done_reason: %s\n"
                "  total_duration: %s\n"
                "  eval_count: %s",
                len(result.get("response", "")),
                result.get("done"),
                result.get("done_reason", "N/A"),
                result.get("total_duration", "N/A"),
                result.get("eval_count", "N/A"),
            )

            raw_output = result.get("response", "")

            if not raw_output or not raw_output.strip():
                logger.error(
                    "[REPORT ERROR] Ollama returned empty response.\n"
                    "  done: %s\n"
                    "  done_reason: %s",
                    result.get("done"),
                    result.get("done_reason", "N/A"),
                )
                return _fallback_report(overall_distribution, risk_level, transcript, spikes)

            # Strip thinking tags if present (some models use them)
            cleaned_output = _strip_thinking_tags(raw_output)

            if not cleaned_output or not cleaned_output.strip():
                logger.warning("[REPORT ERROR] Output empty after stripping thinking tags")
                return _fallback_report(overall_distribution, risk_level, transcript, spikes)

            logger.info("[REPORT] Parsing response")
            parsed = _extract_json(cleaned_output)
            if parsed:
                elapsed = time.time() - start_time
                logger.info("[REPORT] Parse successful (%.1fs)", elapsed)
                # Validate schema
                validated = _validate_schema(parsed)
                validated["report_source"] = "llm"
                logger.info("[REPORT] COMPLETE")
                return validated

            logger.warning(
                "[REPORT ERROR] Parse failed.\n"
                "  Raw output (first 500 chars): %s",
                raw_output[:500],
            )
            # Parse failure — don't retry (same output likely)
            return _fallback_report(overall_distribution, risk_level, transcript, spikes)

        except requests.ConnectionError:
            logger.warning(
                "[REPORT ERROR] Ollama not available at %s — connection refused (attempt %d/%d)",
                OLLAMA_BASE_URL, attempt + 1, 1 + max_retries,
            )
            # Transient — will retry if attempts remain
            if attempt < max_retries:
                continue
            logger.error("[REPORT ERROR] All %d attempts exhausted — Ollama unreachable", 1 + max_retries)
            return _fallback_report(overall_distribution, risk_level, transcript, spikes)

        except requests.Timeout:
            logger.error(
                "[REPORT ERROR] Ollama request timed out after %ds (attempt %d/%d)",
                timeout, attempt + 1, 1 + max_retries,
            )
            # Transient — will retry if attempts remain
            if attempt < max_retries:
                continue
            logger.error("[REPORT ERROR] All %d attempts exhausted — Ollama timeout", 1 + max_retries)
            return _fallback_report(overall_distribution, risk_level, transcript, spikes)

        except Exception as e:
            logger.error("[REPORT ERROR] Generation failed: %s", e, exc_info=True)
            return _fallback_report(overall_distribution, risk_level, transcript, spikes)


def _strip_thinking_tags(text: str) -> str:
    """Remove <think>...</think> tags from the response (safety net for models with thinking mode)."""
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

    # Modality availability summary
    fer_count = sum(1 for r in fusion_results if "fer" in r.get("model_results", {}))
    ser_count = sum(1 for r in fusion_results if "ser" in r.get("model_results", {}))
    ler_count = sum(1 for r in fusion_results if "ler" in r.get("model_results", {}))
    total = len(fusion_results) or 1
    lines.append(f"\nModality Coverage: FER {fer_count}/{total}, SER {ser_count}/{total}, LER {ler_count}/{total} (LER is experimental, excluded from fusion)")

    lines.append("\n=== TRANSCRIPT ===\n")
    for i, entry in enumerate(transcript):
        q = entry.get("question", f"Question {i + 1}")
        a = entry.get("answer", "")
        emotion = entry.get("emotion", "N/A")
        confidence = entry.get("confidence", 0)

        fr = fusion_results[i] if i < len(fusion_results) else {}
        model_results = fr.get("model_results", {})
        available = []
        unavailable = []
        if "fer" in model_results:
            available.append("FER")
        else:
            unavailable.append("FER")
        if "ser" in model_results:
            available.append("SER")
        else:
            unavailable.append("SER")
        if "ler" in model_results:
            available.append("LER")
        else:
            unavailable.append("LER")

        lines.append(f"Q{i + 1}: {q}")
        lines.append(f"A{i + 1}: {a}")
        lines.append(f"Emotion: {emotion} ({confidence:.0%})")

        # Include per-modality top predictions for richer context
        modality_details = []
        for mod in ("fer", "ser", "ler"):
            if mod in model_results:
                mr = model_results[mod]
                mod_emotion = mr.get("emotion", "?")
                mod_conf = mr.get("confidence", 0)
                modality_details.append(f"{mod.upper()}: {mod_emotion} ({mod_conf:.0%})")
        if modality_details:
            lines.append(f"Modalities: {', '.join(modality_details)}")

        if unavailable:
            lines.append(f"Unavailable: {', '.join(unavailable)}")
        lines.append("")

    lines.append("Generate the session report as JSON.")
    return "\n".join(lines)


def _extract_json(text: str) -> Optional[Dict]:
    """Extract JSON from model response. Handles markdown fences and surrounding text."""
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


def _validate_schema(parsed: Dict) -> Dict:
    """Ensure the parsed report has all required fields."""
    required = [
        "session_summary", "topics_discussed", "keywords",
        "therapist_evaluation", "suggested_follow_ups",
        "key_emotional_findings", "areas_for_attention",
        "suggested_therapist_focus", "evidence_quality", "limitations",
    ]
    for field in required:
        if field not in parsed:
            logger.warning("[REPORT] Missing field '%s' in parsed report, adding default", field)
            if field == "evidence_quality":
                parsed[field] = {"fer": "unavailable", "ser": "unavailable", "ler": "unavailable", "overall": "limited"}
            elif field in ("topics_discussed", "keywords", "suggested_follow_ups",
                           "key_emotional_findings", "areas_for_attention",
                           "suggested_therapist_focus", "limitations"):
                parsed[field] = []
            else:
                parsed[field] = ""

    # Backward compat: if old schema has therapist_explanation but not therapist_evaluation
    if "therapist_explanation" in parsed and "therapist_evaluation" not in parsed:
        parsed["therapist_evaluation"] = parsed["therapist_explanation"]

    return parsed


def _fallback_report(
    distribution: Dict, risk_level: str,
    transcript: Optional[List[Dict]] = None, spikes: Optional[List[Dict]] = None,
) -> Dict:
    """Fallback when Ollama is unavailable. Generates contextual content from session evidence."""
    dominant = max(distribution, key=distribution.get) if distribution else "Neutral"
    dominant_pct = distribution.get(dominant, 0)

    # Build contextual follow-up questions from actual session data
    follow_ups = _generate_contextual_follow_ups(transcript or [], spikes or [], dominant)

    # Build key findings from spikes and dominant emotion
    key_findings = []
    if dominant_pct > 50:
        key_findings.append(f"Predominantly {dominant.lower()} affect detected ({dominant_pct:.0f}% of session)")
    for spike in (spikes or [])[:3]:
        label = spike.get("label", "Emotional event detected")
        key_findings.append(label)

    # Areas for attention
    areas = []
    if risk_level in ("High", "Moderate"):
        areas.append(f"Risk level assessed as {risk_level.lower()} — consider exploring underlying factors")
    if len(spikes or []) > 1:
        areas.append("Multiple emotional spikes detected — review transitions between questions")

    # Evidence quality (LER excluded — experimental, not part of fusion)
    fer_available = any(t.get("fer_emotion") for t in (transcript or []))
    ser_available = any(t.get("ser_emotion") for t in (transcript or []))
    ler_available = any(t.get("ler_emotion") for t in (transcript or []))
    fusion_available_count = sum([fer_available, ser_available])
    evidence_quality = {
        "fer": "available" if fer_available else "unavailable",
        "ser": "available" if ser_available else "unavailable",
        "ler": "available (experimental)" if ler_available else "unavailable",
        "overall": "strong" if fusion_available_count == 2 else ("moderate" if fusion_available_count == 1 else "limited"),
    }

    return {
        "session_summary": (
            f"The session showed predominantly {dominant.lower()} affect "
            f"({dominant_pct:.0f}%). "
            f"Risk level assessed as {risk_level.lower()}."
        ),
        "key_emotional_findings": key_findings or [f"Predominantly {dominant.lower()} affect observed"],
        "areas_for_attention": areas or ["Review per-question breakdown for clinical context"],
        "therapist_evaluation": (
            f"Based on the automated analysis, the patient's emotional indicators "
            f"were predominantly {dominant.lower()} ({dominant_pct:.0f}%). "
            f"The risk level is assessed as {risk_level.lower()}. "
            f"{'Multiple emotional spikes were detected, suggesting emotional variability during the session. ' if len(spikes or []) > 1 else ''}"
            f"Please review the detailed per-question breakdown for clinical context."
        ),
        "suggested_therapist_focus": [
            f"Explore the context surrounding the predominant {dominant.lower()} affect observed during the session",
            *(["Review the emotional transitions between questions for patterns"] if len(spikes or []) > 1 else []),
        ],
        "suggested_follow_ups": follow_ups,
        "topics_discussed": [],
        "keywords": [dominant.lower()],
        "evidence_quality": evidence_quality,
        "limitations": [
            "AI-generated report was unavailable — this is a deterministic fallback summary",
            "Detailed topic extraction and keyword analysis require the LLM report generator",
        ],
        "report_source": "fallback",
    }


def _generate_contextual_follow_ups(
    transcript: List[Dict], spikes: List[Dict], dominant_emotion: str,
) -> List[str]:
    """Generate follow-up questions from actual session evidence, not generic templates."""
    follow_ups = []

    # Find the most emotionally intense question (highest confidence negative)
    negative_qs = [
        (i, t) for i, t in enumerate(transcript)
        if t.get("emotion", "").lower() in ("sad", "angry") and t.get("confidence", 0) > 0.5
    ]

    if negative_qs:
        # Use the highest-confidence negative question
        idx, entry = max(negative_qs, key=lambda x: x[1].get("confidence", 0))
        emotion = entry.get("emotion", "this emotion").lower()
        follow_ups.append(
            f"Can you tell me more about what was happening when you began feeling {emotion}?"
        )
        follow_ups.append(
            f"What specifically contributed to that change in your mood during that part of the conversation?"
        )

    # If there were spikes, ask about the transition
    if spikes:
        spike_q_idx = spikes[0].get("question_index")
        if spike_q_idx is not None and spike_q_idx < len(transcript):
            follow_ups.append(
                "Have you experienced this feeling in similar situations before?"
            )

    # If patient mentioned specific topics in their answers, ask about those
    for entry in transcript:
        answer = entry.get("answer", "")
        if len(answer) > 50:  # Substantive answer
            follow_ups.append(
                "How have you been coping with the feelings you described?"
            )
            break

    # Ensure we have at least 2 questions
    if len(follow_ups) < 2:
        follow_ups.append(
            f"Can you walk me through what you were experiencing emotionally during the session?"
        )

    return follow_ups[:4]


# =============================================================================
# Longitudinal Report — Cross-session summary for a patient
#
# Architecture: Deterministic analysis FIRST, LLM interpretation SECOND.
#
# 1. _compute_longitudinal_analysis() — ALWAYS runs, produces structured findings
# 2. LLM receives pre-computed analysis → interprets into therapist-friendly narrative
# 3. If LLM fails → deterministic findings returned directly (not a generic fallback)
#
# This ensures the feature NEVER appears broken when Ollama is unavailable.
# =============================================================================

LONGITUDINAL_SYSTEM_PROMPT = """You are a report-writing assistant for psychotherapy pre-evaluation sessions. You receive PRE-COMPUTED longitudinal analysis data across multiple sessions for a single client.

Your role is to INTERPRET and ORGANIZE the pre-computed findings into a therapist-friendly narrative. You do NOT need to recalculate statistics — they are already provided.

IMPORTANT RULES:
- NEVER predict emotions. Emotion analysis is already complete.
- NEVER diagnose mental illnesses (depression, anxiety, PTSD, etc.).
- NEVER determine suicide risk.
- NEVER override or change emotional labels from the analysis.
- NEVER claim a client has improved/worsened unless the structured evidence supports it.
- NEVER recalculate statistics — use the pre-computed values provided.
- Use hedging language: "may indicate", "appeared associated with", "suggested", "observed".
- The therapist is the final decision-maker.
- Only discuss evidence that is actually available.
- If a modality is unavailable in some sessions, acknowledge it as a limitation.
- If only one session exists, say so — do NOT fabricate trends from a single session.

Your output MUST be valid JSON with these exact fields:
- "overall_summary": A 3-5 sentence therapist-oriented summary of the client's emotional patterns across sessions.
- "emotional_patterns": List of 2-5 recurring emotional patterns supported by the data. Each item should reference supporting sessions when available.
- "session_changes": List of 1-4 observed changes between earlier and recent sessions. If too few sessions, state that.
- "recurring_indicators": List of 1-4 emotional indicators that appear repeatedly.
- "areas_for_attention": List of 1-4 areas the therapist may want to explore further.
- "therapist_focus": List of 1-4 practical areas the therapist may explore. Use "may explore", "could follow up on", "consider reviewing". Reference specific sessions/patterns when available.
- "suggested_follow_up_questions": List of 3-5 concrete, open-ended questions based on the session history. Reference actual detected patterns when possible.
- "session_highlights": List of 1-3 notable events: most significant emotional event, most recent concern, most consistent pattern. Each as a string.
- "evidence_quality": An object with "overall" ("strong", "moderate", or "limited") and "notes" (string explaining quality assessment).
- "limitations": List of 1-4 limitations or caveats about the analysis.

Output ONLY the JSON object. No markdown fences, no explanatory text."""


def _compute_longitudinal_analysis(sessions_data: List[Dict]) -> Dict:
    """
    Deterministic longitudinal analysis — ALWAYS produces findings from session data.
    No LLM dependency. Computes patterns, changes, highlights, evidence quality.

    This is the foundation layer. The LLM optionally interprets these findings,
    but if LLM is unavailable, this analysis is returned directly.

    Args:
        sessions_data: List of session dicts with distribution, indicators, spikes,
                       risk_level, emotional_events, session_highlights, transcript, etc.

    Returns:
        Dict with all computed findings, supporting session references, and metadata.
    """
    n = len(sessions_data)

    # --- Per-session dominant emotions ---
    session_dominant: List[Dict] = []  # [{emotion, pct, session_index, date}]
    for i, s in enumerate(sessions_data):
        dist = s.get("distribution", {})
        if dist:
            dominant = max(dist, key=dist.get)
            pct = dist[dominant]
            session_dominant.append({
                "emotion": dominant,
                "pct": round(pct, 1),
                "session_index": i,
                "date": s.get("date", "N/A"),
                "template_name": s.get("template_name", "N/A"),
            })

    # --- Overall dominant emotion frequency ---
    emotion_frequency: Dict[str, List[int]] = {}  # emotion -> [session_indices]
    for sd in session_dominant:
        emotion_frequency.setdefault(sd["emotion"], []).append(sd["session_index"])

    overall_dominant = max(emotion_frequency, key=lambda e: len(emotion_frequency[e])) if emotion_frequency else "Neutral"

    # --- Risk level tracking ---
    risk_levels = [s.get("risk_level", "Low") for s in sessions_data]
    high_risk_sessions = [i for i, r in enumerate(risk_levels) if r == "High"]

    # --- Indicator aggregation with frequency ---
    indicator_counts: Dict[str, int] = {}
    for s in sessions_data:
        for ind in s.get("indicators", []):
            indicator_counts[ind] = indicator_counts.get(ind, 0) + 1
    # Sort by frequency, most common first
    sorted_indicators = sorted(indicator_counts.items(), key=lambda x: x[1], reverse=True)

    # --- Spike aggregation ---
    all_spikes: List[Dict] = []
    for i, s in enumerate(sessions_data):
        for spike in s.get("spikes", []):
            all_spikes.append({**spike, "_session_index": i, "_date": s.get("date", "N/A")})

    # --- Modality availability per session ---
    modality_stats = {"fer": 0, "ser": 0, "ler": 0}
    sessions_with_modality_data = 0
    for s in sessions_data:
        ev = s.get("modality_availability", {})
        if ev:
            sessions_with_modality_data += 1
            for mod in ("fer", "ser", "ler"):
                if ev.get(mod):
                    modality_stats[mod] += 1

    # --- Emotional events across sessions ---
    all_events: List[Dict] = []
    for i, s in enumerate(sessions_data):
        for event in s.get("emotional_events", []):
            all_events.append({**event, "_session_index": i, "_date": s.get("date", "N/A")})

    # --- Build emotional patterns with supporting sessions ---
    emotional_patterns = []
    for emotion, indices in sorted(emotion_frequency.items(), key=lambda x: len(x[1]), reverse=True):
        count = len(indices)
        supporting = [f"Session {i + 1}" for i in indices]
        emotional_patterns.append({
            "pattern": f"{'Predominantly ' if count > n / 2 else 'Recurring '} {emotion.lower()} emotional indicators",
            "frequency": f"{count} of {n} sessions",
            "supporting_sessions": supporting,
            "session_indices": indices,
        })

    # --- Build session changes (early vs recent) ---
    session_changes = []
    if n >= 2:
        # Compare first half vs second half distributions
        mid = n // 2
        early_sessions = sessions_data[:mid]
        recent_sessions = sessions_data[mid:]

        early_dist = _average_distribution(early_sessions)
        recent_dist = _average_distribution(recent_sessions)

        dist_changes = []
        all_emotions = set(list(early_dist.keys()) + list(recent_dist.keys()))
        for emotion in all_emotions:
            early_pct = early_dist.get(emotion, 0)
            recent_pct = recent_dist.get(emotion, 0)
            diff = recent_pct - early_pct
            if abs(diff) >= 3:  # Only show meaningful changes
                direction = "increased" if diff > 0 else "decreased"
                arrow = "↑" if diff > 0 else "↓"
                dist_changes.append({
                    "emotion": emotion,
                    "early": round(early_pct, 1),
                    "recent": round(recent_pct, 1),
                    "change": round(diff, 1),
                    "direction": direction,
                    "arrow": arrow,
                })

        if dist_changes:
            session_changes.append({
                "type": "distribution",
                "label": "Emotional distribution shift",
                "details": dist_changes,
            })

        # Risk level change
        first_risk = risk_levels[-1]  # oldest (ASC order)
        last_risk = risk_levels[0]    # newest
        if first_risk != last_risk:
            session_changes.append({
                "type": "risk",
                "label": "Risk level change",
                "detail": f"{first_risk} → {last_risk}",
                "from": first_risk,
                "to": last_risk,
            })

        # Spike frequency change
        early_spikes = sum(len(s.get("spikes", [])) for s in early_sessions)
        recent_spikes = sum(len(s.get("spikes", [])) for s in recent_sessions)
        if early_spikes != recent_spikes:
            direction = "increased" if recent_spikes > early_spikes else "decreased"
            session_changes.append({
                "type": "spikes",
                "label": "Emotional spike frequency",
                "detail": f"{early_spikes} → {recent_spikes} ({direction})",
                "early_count": early_spikes,
                "recent_count": recent_spikes,
            })
    elif n == 1:
        session_changes.append({
            "type": "insufficient_data",
            "label": "Longitudinal change",
            "detail": "Only one completed session is available — longitudinal change cannot yet be established",
        })

    # --- Build recurring indicators with supporting sessions ---
    recurring_indicators = []
    for indicator, count in sorted_indicators[:5]:
        # Find which sessions have this indicator
        supporting = []
        for i, s in enumerate(sessions_data):
            if indicator in s.get("indicators", []):
                supporting.append(f"Session {i + 1}")
        recurring_indicators.append({
            "indicator": indicator,
            "frequency": count,
            "supporting_sessions": supporting,
        })

    # --- Build areas for attention ---
    areas_for_attention = []
    if high_risk_sessions:
        session_names = [f"Session {i + 1}" for i in high_risk_sessions]
        areas_for_attention.append({
            "area": f"High risk level detected in {len(high_risk_sessions)} session(s)",
            "sessions": session_names,
            "severity": "high",
        })

    negative_indicators = [
        ind for ind, _ in sorted_indicators
        if any(word in ind.lower() for word in ["sad", "anger", "angry", "fear", "negative", "distress"])
    ]
    if negative_indicators:
        areas_for_attention.append({
            "area": f"Recurring negative emotional indicators: {', '.join(negative_indicators[:3])}",
            "sessions": [],
            "severity": "moderate",
        })

    if len(all_spikes) > 2:
        areas_for_attention.append({
            "area": f"Multiple emotional spikes detected across sessions ({len(all_spikes)} total)",
            "sessions": [f"Session {s['_session_index'] + 1}" for s in all_spikes[:4]],
            "severity": "moderate",
        })

    if not areas_for_attention:
        areas_for_attention.append({
            "area": "Review per-session breakdowns for clinical context",
            "sessions": [],
            "severity": "low",
        })

    # --- Session highlights ---
    session_highlights = []

    # Most significant emotional event (highest intensity spike or event)
    if all_spikes:
        most_significant = max(all_spikes, key=lambda s: s.get("intensity", 0))
        session_highlights.append({
            "type": "most_significant_event",
            "label": "Most Significant Emotional Event",
            "session": f"Session {most_significant['_session_index'] + 1}",
            "date": most_significant["_date"],
            "detail": f"{most_significant.get('label', 'Emotional spike')} — {most_significant.get('emotion', 'N/A')}",
            "intensity": most_significant.get("intensity", "N/A"),
        })
    elif all_events:
        most_significant = max(all_events, key=lambda e: e.get("emotion_confidence", 0))
        session_highlights.append({
            "type": "most_significant_event",
            "label": "Most Significant Emotional Event",
            "session": f"Session {most_significant['_session_index'] + 1}",
            "date": most_significant["_date"],
            "detail": f"{most_significant.get('dominant_emotion', 'N/A')} — {most_significant.get('intensity_level', 'N/A')} intensity",
            "confidence": most_significant.get("emotion_confidence", "N/A"),
        })

    # Most recent concern (negative indicator in latest session)
    if n > 0:
        latest = sessions_data[0]  # newest (DESC order from repo, but payload is ASC — check)
        # Actually sessions are ordered oldest-first in the payload
        latest = sessions_data[-1]
        latest_neg = [
            ind for ind in latest.get("indicators", [])
            if any(word in ind.lower() for word in ["sad", "anger", "angry", "fear", "negative", "distress"])
        ]
        if latest_neg:
            session_highlights.append({
                "type": "most_recent_concern",
                "label": "Most Recent Concern",
                "session": f"Session {n}",
                "date": latest.get("date", "N/A"),
                "detail": f"Indicator detected: {latest_neg[0]}",
            })

    # Most consistent pattern
    if emotional_patterns:
        most_consistent = emotional_patterns[0]
        session_highlights.append({
            "type": "most_consistent_pattern",
            "label": "Most Consistent Pattern",
            "detail": f"{most_consistent['pattern']} ({most_consistent['frequency']})",
            "supporting_sessions": most_consistent["supporting_sessions"],
        })

    # --- Therapist focus (evidence-driven) ---
    therapist_focus = []
    if emotional_patterns:
        top = emotional_patterns[0]
        therapist_focus.append(
            f"Explore the context surrounding {top['pattern'].lower()} observed in {top['frequency']} of sessions"
        )
    if high_risk_sessions:
        therapist_focus.append(
            f"Review circumstances associated with high risk assessments in Sessions {', '.join(str(i + 1) for i in high_risk_sessions)}"
        )
    if len(all_spikes) > 1:
        spike_sessions = list(set(f"Session {s['_session_index'] + 1}" for s in all_spikes))
        therapist_focus.append(
            f"Follow up on emotional spikes observed across {', '.join(spike_sessions[:3])}"
        )
    if negative_indicators:
        therapist_focus.append(
            f"Consider exploring circumstances associated with recurring {negative_indicators[0].lower()} indicators"
        )
    if not therapist_focus:
        therapist_focus.append("Review emotional transitions across sessions for patterns")

    # --- Suggested follow-up questions (evidence-driven) ---
    follow_up_questions = _generate_longitudinal_follow_ups(
        sessions_data, emotional_patterns, negative_indicators, all_spikes
    )

    # --- Evidence quality (computed from actual data) ---
    fer_available = modality_stats["fer"]
    ser_available = modality_stats["ser"]
    ler_available = modality_stats["ler"]
    total_for_modality = max(sessions_with_modality_data, 1)

    # LER excluded from score — experimental, not part of fusion
    modality_score = (fer_available + ser_available) / (total_for_modality * 2) if total_for_modality > 0 else 0

    if n < 2:
        overall_quality = "limited"
    elif modality_score >= 0.8:
        overall_quality = "strong"
    elif modality_score >= 0.5:
        overall_quality = "moderate"
    else:
        overall_quality = "limited"

    evidence_quality = {
        "fer": f"available in {fer_available}/{n} sessions" if n > 0 else "unavailable",
        "ser": f"available in {ser_available}/{n} sessions" if n > 0 else "unavailable",
        "ler": f"available (experimental) in {ler_available}/{n} sessions" if n > 0 else "unavailable",
        "overall": overall_quality,
        "notes": f"Modality data available in {sessions_with_modality_data} of {n} sessions.",
    }

    # --- Limitations (based on actual data gaps) ---
    limitations = []
    if n < 3:
        limitations.append(f"Only {n} completed session(s) available — longitudinal trends are more reliable with additional sessions")
    if modality_score < 0.5:
        limitations.append("Limited modality data available across sessions — some emotional indicators may be incomplete")
    if fer_available < n:
        limitations.append(f"Facial emotion recognition (FER) was unavailable in {n - fer_available} session(s)")
    if ser_available < n:
        limitations.append(f"Speech emotion recognition (SER) was unavailable in {n - ser_available} session(s)")
    if ler_available < n:
        limitations.append(f"Language emotion recognition (LER) was unavailable in {n - ler_available} session(s)")
    limitations.append("Emotional indicators are automated pre-evaluation findings — therapist observation remains essential")

    # --- Overall summary (deterministic) ---
    summary_parts = [
        f"Across {n} completed session(s), {overall_dominant.lower()} emotional indicators were most frequently detected as the dominant emotion",
        f"({len(emotion_frequency.get(overall_dominant, []))} of {n} sessions).",
    ]
    if n == 1:
        summary_parts.append("Only one session is available, so longitudinal trends cannot yet be established.")
    if high_risk_sessions:
        summary_parts.append(f"{len(high_risk_sessions)} session(s) had a high risk level assessment.")
    if negative_indicators:
        summary_parts.append(f"Recurring negative indicators include: {', '.join(negative_indicators[:2])}.")
    overall_summary = " ".join(summary_parts)

    return {
        "overall_summary": overall_summary,
        "emotional_patterns": emotional_patterns,
        "session_changes": session_changes,
        "recurring_indicators": recurring_indicators,
        "areas_for_attention": areas_for_attention,
        "therapist_focus": therapist_focus,
        "suggested_follow_up_questions": follow_up_questions,
        "session_highlights": session_highlights,
        "evidence_quality": evidence_quality,
        "limitations": limitations,
        "modality_stats": modality_stats,
        "session_count": n,
        "overall_dominant_emotion": overall_dominant,
    }


def _average_distribution(sessions: List[Dict]) -> Dict[str, float]:
    """Average emotion distribution across a list of sessions."""
    totals: Dict[str, float] = {}
    count = 0
    for s in sessions:
        dist = s.get("distribution", {})
        if dist:
            count += 1
            for emotion, pct in dist.items():
                totals[emotion] = totals.get(emotion, 0) + pct
    if count == 0:
        return {}
    return {emotion: total / count for emotion, total in totals.items()}


def _generate_longitudinal_follow_ups(
    sessions_data: List[Dict],
    patterns: List[Dict],
    negative_indicators: List[str],
    spikes: List[Dict],
) -> List[str]:
    """Generate evidence-driven follow-up questions for longitudinal context."""
    questions = []

    # Ask about recurring negative patterns
    if negative_indicators:
        emotion = negative_indicators[0].split()[0].lower() if negative_indicators[0] else "these feelings"
        questions.append(
            f"The analysis detected recurring {emotion} indicators across several sessions. "
            f"Have you noticed anything that may be contributing to these feelings?"
        )

    # Ask about emotional spikes
    if spikes:
        spike_emotions = list(set(s.get("emotion", "emotional shifts") for s in spikes[:3]))
        questions.append(
            f"Emotional changes were observed during specific parts of your sessions. "
            f"Would you like to explore what may have been happening during those moments?"
        )

    # Ask about changes between sessions
    if len(sessions_data) >= 2:
        questions.append(
            "What has changed since your previous session?"
        )

    # Ask about the predominant pattern
    if patterns:
        top_pattern = patterns[0]
        if "supporting_sessions" in top_pattern and len(top_pattern["supporting_sessions"]) >= 2:
            questions.append(
                f"The analysis identified a recurring emotional pattern across multiple sessions. "
                f"Can you tell me more about what has been on your mind recently?"
            )

    # Ensure at least 3 questions
    if len(questions) < 3:
        questions.append(
            "How have you been coping with the feelings you have described in recent sessions?"
        )
    if len(questions) < 3:
        questions.append(
            "Is there anything specific you would like to discuss or explore further?"
        )

    return questions[:5]


def generate_longitudinal_report(
    sessions_data: List[Dict],
    max_retries: int = 2,
    retry_delay: float = 5.0,
) -> Dict:
    """
    Generate a longitudinal summary across multiple completed sessions.

    Architecture:
        1. Compute deterministic analysis (ALWAYS succeeds)
        2. Send pre-computed analysis to LLM for interpretation (OPTIONAL)
        3. If LLM succeeds → merge LLM narrative with deterministic findings
        4. If LLM fails → return deterministic findings directly

    The feature NEVER appears broken — deterministic findings are always available.

    Args:
        sessions_data: List of structured session data dicts.

    Returns:
        Longitudinal report dict with all findings + interpretation source.
    """
    logger.info("[LONGITUDINAL] Starting generation for %d sessions", len(sessions_data))
    start_time = time.time()

    # Step 1: ALWAYS compute deterministic analysis first
    analysis = _compute_longitudinal_analysis(sessions_data)
    logger.info("[LONGITUDINAL] Deterministic analysis complete (%d patterns, %d changes)",
                len(analysis["emotional_patterns"]), len(analysis["session_changes"]))

    # Step 2: Try LLM interpretation (optional enhancement)
    context = _build_longitudinal_context(sessions_data, analysis)
    logger.info("[LONGITUDINAL] Context prepared (%d chars)", len(context))

    timeout = OLLAMA_CONFIG.timeout

    for attempt in range(1 + max_retries):
        is_retry = attempt > 0
        if is_retry:
            logger.warning("[LONGITUDINAL] Retry %d/%d after %.1fs", attempt, max_retries, retry_delay)
            time.sleep(retry_delay)

        try:
            logger.info("[LONGITUDINAL] Model: %s", OLLAMA_MODEL)

            response = requests.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "system": LONGITUDINAL_SYSTEM_PROMPT,
                    "prompt": context,
                    "stream": False,
                    "options": {
                        "temperature": OLLAMA_CONFIG.temperature,
                        "num_predict": OLLAMA_CONFIG.num_predict,
                    },
                },
                timeout=timeout,
            )

            logger.info("[LONGITUDINAL] Ollama HTTP status: %d", response.status_code)

            if response.status_code != 200:
                logger.error("[LONGITUDINAL] Non-200: %s", response.status_code)
                return _as_deterministic_report(analysis)

            result = response.json()
            raw_output = result.get("response", "")

            if not raw_output or not raw_output.strip():
                logger.error("[LONGITUDINAL] Empty response")
                return _as_deterministic_report(analysis)

            cleaned_output = _strip_thinking_tags(raw_output)
            if not cleaned_output or not cleaned_output.strip():
                logger.warning("[LONGITUDINAL] Empty after stripping thinking tags")
                return _as_deterministic_report(analysis)

            parsed = _extract_json(cleaned_output)
            if parsed:
                elapsed = time.time() - start_time
                logger.info("[LONGITUDINAL] LLM interpretation successful (%.1fs)", elapsed)
                validated = _validate_longitudinal_schema(parsed)
                validated["report_source"] = "llm"
                # Merge: keep deterministic computed fields that LLM doesn't produce
                validated["_deterministic_analysis"] = analysis
                return validated

            logger.warning("[LONGITUDINAL] Parse failed")
            return _as_deterministic_report(analysis)

        except requests.ConnectionError:
            logger.warning("[LONGITUDINAL] Ollama unreachable (attempt %d/%d)", attempt + 1, 1 + max_retries)
            if attempt < max_retries:
                continue
            return _as_deterministic_report(analysis)

        except requests.Timeout:
            logger.error("[LONGITUDINAL] Timeout after %ds (attempt %d/%d)", timeout, attempt + 1, 1 + max_retries)
            if attempt < max_retries:
                continue
            return _as_deterministic_report(analysis)

        except Exception as e:
            logger.error("[LONGITUDINAL] Failed: %s", e, exc_info=True)
            return _as_deterministic_report(analysis)


def _as_deterministic_report(analysis: Dict) -> Dict:
    """
    Convert pre-computed analysis into the report schema format.
    Used when LLM is unavailable — the analysis is already complete,
    just needs to be shaped into the API response format.
    """
    # Convert structured patterns to string list for backward compatibility
    patterns_str = []
    for p in analysis["emotional_patterns"]:
        if isinstance(p, dict):
            patterns_str.append(f"{p['pattern']} ({p['frequency']})")
        else:
            patterns_str.append(str(p))

    # Convert structured changes to string list
    changes_str = []
    for c in analysis["session_changes"]:
        if isinstance(c, dict):
            changes_str.append(c.get("detail", c.get("label", str(c))))
        else:
            changes_str.append(str(c))

    # Convert structured indicators to string list
    indicators_str = []
    for ind in analysis["recurring_indicators"]:
        if isinstance(ind, dict):
            indicators_str.append(f"{ind['indicator']} (detected in {ind['frequency']} session(s))")
        else:
            indicators_str.append(str(ind))

    # Convert structured areas to string list
    areas_str = []
    for area in analysis["areas_for_attention"]:
        if isinstance(area, dict):
            areas_str.append(area["area"])
        else:
            areas_str.append(str(area))

    # Convert highlights to string list
    highlights_str = []
    for h in analysis["session_highlights"]:
        if isinstance(h, dict):
            parts = [h.get("label", "")]
            if h.get("session"):
                parts.append(h["session"])
            if h.get("detail"):
                parts.append(h["detail"])
            highlights_str.append(" — ".join(filter(None, parts)))
        else:
            highlights_str.append(str(h))

    return {
        "overall_summary": analysis["overall_summary"],
        "emotional_patterns": patterns_str,
        "session_changes": changes_str,
        "recurring_indicators": indicators_str,
        "areas_for_attention": areas_str,
        "therapist_focus": analysis["therapist_focus"],
        "suggested_follow_up_questions": analysis["suggested_follow_up_questions"],
        "session_highlights": highlights_str,
        "evidence_quality": analysis["evidence_quality"],
        "limitations": analysis["limitations"],
        "report_source": "deterministic",
        "_deterministic_analysis": analysis,
    }


def _build_longitudinal_context(sessions_data: List[Dict], analysis: Dict) -> str:
    """
    Build LLM prompt context from pre-computed analysis + raw session data.
    The LLM receives structured findings — it interprets, not recalculates.
    """
    lines = []
    lines.append(f"=== LONGITUDINAL ANALYSIS — {analysis['session_count']} SESSION(S) ===")
    lines.append(f"Overall dominant emotion: {analysis['overall_dominant_emotion']}")
    lines.append("")

    # Pre-computed findings
    lines.append("=== PRE-COMPUTED FINDINGS ===\n")

    lines.append("Emotional Patterns:")
    for p in analysis["emotional_patterns"]:
        if isinstance(p, dict):
            lines.append(f"  - {p['pattern']} ({p['frequency']}) — Supporting: {', '.join(p['supporting_sessions'])}")

    lines.append("\nSession Changes:")
    for c in analysis["session_changes"]:
        if isinstance(c, dict):
            lines.append(f"  - {c.get('label', '')}: {c.get('detail', '')}")

    lines.append("\nRecurring Indicators:")
    for ind in analysis["recurring_indicators"]:
        if isinstance(ind, dict):
            lines.append(f"  - {ind['indicator']} (frequency: {ind['frequency']})")

    lines.append("\nAreas for Attention:")
    for area in analysis["areas_for_attention"]:
        if isinstance(area, dict):
            lines.append(f"  - {area['area']} (severity: {area['severity']})")

    lines.append("\nSession Highlights:")
    for h in analysis["session_highlights"]:
        if isinstance(h, dict):
            lines.append(f"  - {h.get('label', '')}: {h.get('detail', '')}")

    lines.append(f"\nEvidence Quality: {analysis['evidence_quality']['overall']}")
    lines.append(f"Modality Stats: FER={analysis['modality_stats']['fer']}, SER={analysis['modality_stats']['ser']}, LER={analysis['modality_stats']['ler']}")

    # Per-session detail
    lines.append("\n=== PER-SESSION DATA ===\n")
    for i, s in enumerate(sessions_data):
        lines.append(f"--- Session {i + 1} ---")
        lines.append(f"Date: {s.get('date', 'N/A')}")
        lines.append(f"Template: {s.get('template_name', 'N/A')}")
        lines.append(f"Risk Level: {s.get('risk_level', 'N/A')}")
        lines.append(f"Distribution: {json.dumps(s.get('distribution', {}))}")
        lines.append(f"Indicators: {json.dumps(s.get('indicators', []))}")
        lines.append(f"Spikes: {json.dumps(s.get('spikes', []))}")

        if s.get("session_summary"):
            lines.append(f"Session Summary: {s['session_summary']}")
        if s.get("key_emotional_findings"):
            lines.append(f"Key Findings: {json.dumps(s['key_emotional_findings'])}")
        if s.get("areas_for_attention"):
            lines.append(f"Areas for Attention: {json.dumps(s['areas_for_attention'])}")
        if s.get("evidence_quality"):
            lines.append(f"Evidence Quality: {json.dumps(s['evidence_quality'])}")
        if s.get("limitations"):
            lines.append(f"Limitations: {json.dumps(s['limitations'])}")
        lines.append("")

    lines.append("Interpret the pre-computed findings above into a therapist-friendly longitudinal summary. Output JSON only.")
    return "\n".join(lines)


def _validate_longitudinal_schema(parsed: Dict) -> Dict:
    """Ensure the longitudinal report has all required fields."""
    required = [
        "overall_summary", "emotional_patterns", "session_changes",
        "recurring_indicators", "areas_for_attention", "therapist_focus",
        "suggested_follow_up_questions", "session_highlights",
        "evidence_quality", "limitations",
    ]
    for field in required:
        if field not in parsed:
            logger.warning("[LONGITUDINAL] Missing field '%s', adding default", field)
            if field == "evidence_quality":
                parsed[field] = {"overall": "limited", "notes": "Field was missing from LLM response"}
            elif field in ("emotional_patterns", "session_changes", "recurring_indicators",
                          "areas_for_attention", "therapist_focus",
                          "suggested_follow_up_questions", "session_highlights", "limitations"):
                parsed[field] = []
            else:
                parsed[field] = ""
    return parsed
