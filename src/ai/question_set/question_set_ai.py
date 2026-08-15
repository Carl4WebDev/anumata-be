"""
AI Question Set Assistant — Local LLM via Ollama.

Helps therapists create, review, and refine interview question sets.
The AI is an ASSISTANT — therapists always review and approve before use.

NEVER autonomously approve or publish questions.
NEVER diagnose or make clinical conclusions.
"""

import json
import logging
import re
import time
from typing import Dict, List, Optional

import requests

from config import OLLAMA_BASE_URL, OLLAMA_MODEL, OLLAMA_CONFIG

logger = logging.getLogger(__name__)

# =============================================================================
# Question Categories — used to organize generated questions
# =============================================================================

QUESTION_CATEGORIES = [
    "Opening",
    "Emotional Exploration",
    "Context",
    "Impact",
    "Coping",
    "Closing",
]

# =============================================================================
# System Prompts
# =============================================================================

GENERATE_SYSTEM_PROMPT = """You are a question-set development assistant for therapists conducting pre-evaluation interviews. Your role is to generate draft interview questions based on the therapist's requirements.

IMPORTANT RULES:
- Generate clear, open-ended, neutral, non-leading questions.
- Questions must be suitable for a pre-evaluation interview.
- Do NOT assume the patient has a specific disorder.
- Do NOT presume an emotional state.
- Do NOT use leading language.
- Do NOT make diagnoses or clinical conclusions.
- Do NOT tell the patient what they are feeling.
- Questions should be ordered logically (opening → exploration → closing).
- Each question must have a short purpose explanation.
- Each question must have a category.

POOR: "Are you depressed because of your family?"
GOOD: "How have your experiences with your family recently affected how you have been feeling?"

POOR: "Don't you think your anger is a problem?"
GOOD: "Can you describe situations where you notice changes in how you feel?"

Your output MUST be valid JSON with these exact fields:
- "title": The question set title (use the therapist's title or improve it slightly).
- "description": A brief description of the question set's purpose.
- "language": The language of the questions.
- "questions": An array of question objects, each with:
  - "order": Integer starting from 1.
  - "text": The question text.
  - "purpose": A short explanation of why this question is asked.
  - "category": One of "Opening", "Emotional Exploration", "Context", "Impact", "Coping", "Closing".

Output ONLY the JSON object. No markdown fences, no explanatory text."""

REVIEW_SYSTEM_PROMPT = """You are a question-quality reviewer for therapist interview questions. Your role is to identify potential problems in draft interview questions.

Check each question for:
- Leading language (suggests a desired answer)
- Assumptions (presumes a condition or state)
- Ambiguous wording (could be interpreted multiple ways)
- Duplicate/repetitive questions (asks the same thing differently)
- Poor ordering (breaks logical interview flow)
- Unclear wording (confusing or vague)
- Irrelevant question (doesn't fit the stated focus)
- Potentially inappropriate wording (could upset or mislead)

Your output MUST be valid JSON:
{
  "overall_quality": "good" | "fair" | "needs_improvement",
  "issues": [
    {
      "question_order": 2,
      "issue_type": "leading" | "assumption" | "ambiguous" | "duplicate" | "ordering" | "unclear" | "irrelevant" | "inappropriate",
      "explanation": "Why this is a problem",
      "suggested_revision": "A better version of the question"
    }
  ]
}

If no issues are found, return an empty issues array.
Output ONLY the JSON object. No markdown fences, no explanatory text."""

REFINE_SYSTEM_PROMPT = """You are a question-refinement assistant for therapists. Your role is to improve a single interview question while preserving its intent.

Rules:
- Keep the question open-ended and neutral.
- Remove leading language.
- Remove assumptions.
- Improve clarity.
- Keep it suitable for a pre-evaluation interview.
- Do NOT change the fundamental topic of the question.

Your output MUST be valid JSON:
{
  "original": "The original question text",
  "revised": "The improved question text",
  "reason": "Brief explanation of what was improved and why"
}

Output ONLY the JSON object. No markdown fences, no explanatory text."""


# =============================================================================
# Main Functions — called by FastAPI endpoints
# =============================================================================


def generate_questions(
    title: str,
    focus: str,
    description: str,
    num_questions: int,
    language: str,
    additional_instructions: str,
    max_retries: int = 2,
    retry_delay: float = 5.0,
) -> Dict:
    """
    Generate a draft question set based on therapist requirements.

    Flow:
        Frontend → Node.js API → Python AI service → Ollama → validated JSON → Frontend draft

    Returns:
        {title, description, language, questions: [{order, text, purpose, category}]}
    """
    logger.info("[QS-AI] Generating questions: title=%s, focus=%s, num=%d", title, focus, num_questions)
    start_time = time.time()

    # Build the generation prompt from therapist input
    prompt_parts = [
        f"Title: {title}",
        f"Focus/Topic: {focus}",
        f"Description: {description}" if description else "",
        f"Number of questions: {num_questions}",
        f"Language: {language}",
        f"Additional instructions: {additional_instructions}" if additional_instructions else "",
        "",
        f"Generate {num_questions} interview questions in JSON format.",
    ]
    prompt = "\n".join(p for p in prompt_parts if p)

    result = _call_ollama(GENERATE_SYSTEM_PROMPT, prompt, max_retries, retry_delay)
    if result is None:
        logger.error("[QS-AI] Generation failed — Ollama unavailable or returned invalid JSON")
        return None

    elapsed = time.time() - start_time
    logger.info("[QS-AI] Generation complete (%.1fs, %d questions)", elapsed, len(result.get("questions", [])))

    # Validate and normalize the response
    validated = _validate_generation_schema(result, title, description, language, num_questions)
    return validated


def review_questions(
    questions: List[Dict],
    focus: str = "",
    max_retries: int = 2,
    retry_delay: float = 5.0,
) -> Dict:
    """
    Review draft questions for quality issues.

    Flow:
        Frontend → Node.js API → Python AI service → Ollama → issues JSON → Frontend

    Returns:
        {overall_quality, issues: [{question_order, issue_type, explanation, suggested_revision}]}
    """
    logger.info("[QS-AI] Reviewing %d questions", len(questions))
    start_time = time.time()

    # Build review prompt
    lines = [f"Focus/Topic: {focus}" if focus else "Focus: General emotional well-being", ""]
    for q in questions:
        order = q.get("order", "?")
        text = q.get("text", "")
        category = q.get("category", "")
        lines.append(f"Question {order} [{category}]: {text}")
    lines.append("\nReview these questions for quality issues. Output JSON only.")
    prompt = "\n".join(lines)

    result = _call_ollama(REVIEW_SYSTEM_PROMPT, prompt, max_retries, retry_delay)
    if result is None:
        logger.error("[QS-AI] Review failed — Ollama unavailable")
        return None

    elapsed = time.time() - start_time
    logger.info("[QS-AI] Review complete (%.1fs, %d issues)", elapsed, len(result.get("issues", [])))

    validated = _validate_review_schema(result)
    return validated


def refine_question(
    question_text: str,
    max_retries: int = 2,
    retry_delay: float = 5.0,
) -> Dict:
    """
    Refine/improve a single question.

    Flow:
        Frontend → Node.js API → Python AI service → Ollama → refinement JSON → Frontend

    Returns:
        {original, revised, reason}
    """
    logger.info("[QS-AI] Refining question: %s...", question_text[:50])
    start_time = time.time()

    prompt = f"Improve this interview question:\n\n\"{question_text}\"\n\nOutput JSON only."

    result = _call_ollama(REFINE_SYSTEM_PROMPT, prompt, max_retries, retry_delay)
    if result is None:
        logger.error("[QS-AI] Refinement failed — Ollama unavailable")
        return None

    elapsed = time.time() - start_time
    logger.info("[QS-AI] Refinement complete (%.1fs)", elapsed)

    validated = _validate_refinement_schema(result, question_text)
    return validated


# =============================================================================
# Ollama Integration — reuses existing config and patterns
# =============================================================================


def _call_ollama(system_prompt: str, user_prompt: str, max_retries: int, retry_delay: float) -> Optional[Dict]:
    """
    Call Ollama and parse JSON response.
    Returns parsed dict or None on failure.
    """
    timeout = OLLAMA_CONFIG.timeout

    for attempt in range(1 + max_retries):
        is_retry = attempt > 0
        if is_retry:
            logger.warning("[QS-AI] Retry %d/%d after %.1fs", attempt, max_retries, retry_delay)
            time.sleep(retry_delay)

        try:
            logger.info("[QS-AI] Model: %s, endpoint: %s", OLLAMA_MODEL, OLLAMA_BASE_URL)

            response = requests.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "system": system_prompt,
                    "prompt": user_prompt,
                    "stream": False,
                    "options": {
                        "temperature": OLLAMA_CONFIG.temperature,
                        "num_predict": OLLAMA_CONFIG.num_predict,
                    },
                },
                timeout=timeout,
            )

            if response.status_code != 200:
                logger.error("[QS-AI] Non-200: %d", response.status_code)
                continue

            result = response.json()
            raw_output = result.get("response", "")

            if not raw_output or not raw_output.strip():
                logger.error("[QS-AI] Empty response")
                continue

            cleaned = _strip_thinking_tags(raw_output)
            if not cleaned or not cleaned.strip():
                logger.warning("[QS-AI] Empty after stripping thinking tags")
                continue

            parsed = _extract_json(cleaned)
            if parsed:
                return parsed

            logger.warning("[QS-AI] JSON parse failed. Raw (first 300): %s", raw_output[:300])
            continue

        except requests.ConnectionError:
            logger.warning("[QS-AI] Ollama unreachable (attempt %d/%d)", attempt + 1, 1 + max_retries)
            if attempt < max_retries:
                continue
            return None

        except requests.Timeout:
            logger.error("[QS-AI] Timeout after %ds (attempt %d/%d)", timeout, attempt + 1, 1 + max_retries)
            if attempt < max_retries:
                continue
            return None

        except Exception as e:
            logger.error("[QS-AI] Failed: %s", e, exc_info=True)
            return None

    return None


def _strip_thinking_tags(text: str) -> str:
    """Remove ... tags if present."""
    cleaned = re.sub(r"<thinking>.*?</thinking>", "", text, flags=re.DOTALL)
    return cleaned.strip()


def _extract_json(text: str) -> Optional[Dict]:
    """
    Extract JSON from model response.
    Handles markdown fences and surrounding text.
    Same strategy as report_generator.py.
    """
    # Strategy 1: Direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Strategy 2: Extract from markdown code blocks
    json_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Strategy 3: Find first/last braces
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        try:
            return json.loads(text[first_brace:last_brace + 1])
        except json.JSONDecodeError:
            pass

    return None


# =============================================================================
# Schema Validation — ensure LLM output has required fields
# =============================================================================


def _validate_generation_schema(
    parsed: Dict, title: str, description: str, language: str, num_questions: int,
) -> Dict:
    """Validate and normalize the generation response."""
    # Ensure required top-level fields
    parsed.setdefault("title", title)
    parsed.setdefault("description", description)
    parsed.setdefault("language", language)

    questions = parsed.get("questions", [])
    if not isinstance(questions, list):
        questions = []

    # Validate each question
    validated_questions = []
    for i, q in enumerate(questions):
        if not isinstance(q, dict):
            continue
        text = q.get("text", "").strip()
        if not text:
            continue
        validated_questions.append({
            "order": q.get("order", i + 1),
            "text": text,
            "purpose": q.get("purpose", "").strip(),
            "category": _validate_category(q.get("category", "Exploration")),
        })

    # Re-number if needed
    for i, q in enumerate(validated_questions):
        q["order"] = i + 1

    parsed["questions"] = validated_questions
    return parsed


def _validate_review_schema(parsed: Dict) -> Dict:
    """Validate the review response."""
    parsed.setdefault("overall_quality", "fair")
    issues = parsed.get("issues", [])
    if not isinstance(issues, list):
        issues = []

    validated_issues = []
    for issue in issues:
        if not isinstance(issue, dict):
            continue
        validated_issues.append({
            "question_order": issue.get("question_order", 0),
            "issue_type": _validate_issue_type(issue.get("issue_type", "unclear")),
            "explanation": issue.get("explanation", ""),
            "suggested_revision": issue.get("suggested_revision", ""),
        })

    parsed["issues"] = validated_issues
    return parsed


def _validate_refinement_schema(parsed: Dict, original: str) -> Dict:
    """Validate the refinement response."""
    parsed.setdefault("original", original)
    parsed.setdefault("revised", original)
    parsed.setdefault("reason", "")
    return parsed


def _validate_category(category: str) -> str:
    """Normalize category to one of the allowed values."""
    # Case-insensitive match
    for allowed in QUESTION_CATEGORIES:
        if allowed.lower() == category.lower():
            return allowed
    # Fuzzy match for common variations
    category_lower = category.lower()
    if "open" in category_lower:
        return "Opening"
    if "emotion" in category_lower or "explor" in category_lower:
        return "Emotional Exploration"
    if "context" in category_lower:
        return "Context"
    if "impact" in category_lower:
        return "Impact"
    if "cop" in category_lower:
        return "Coping"
    if "close" in category_lower or "end" in category_lower:
        return "Closing"
    return "Emotional Exploration"  # default


def _validate_issue_type(issue_type: str) -> str:
    """Normalize issue type to one of the allowed values."""
    valid = {"leading", "assumption", "ambiguous", "duplicate", "ordering", "unclear", "irrelevant", "inappropriate"}
    if issue_type.lower() in valid:
        return issue_type.lower()
    return "unclear"
