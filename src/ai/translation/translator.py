"""
Interview question translation via local Ollama.

Translates therapist-authored interview questions into Tagalog or Cebuano
(Bisaya) at read time so patients can hear the question in their own language.

Translation is an ENHANCEMENT: on any failure this returns None and the
caller shows the English original. The interview must keep working when
Ollama is down.
"""

import logging
from typing import Optional

import requests

from config import OLLAMA_BASE_URL, OLLAMA_MODEL

logger = logging.getLogger(__name__)

TARGET_LANGUAGE_NAMES = {
    "tl": "Tagalog",
    "ceb": "Cebuano (Bisaya)",
}

# Questions are short — keep the budget small and the wait short so a hung
# or busy Ollama can never stall the interview.
TRANSLATE_TIMEOUT_SECONDS = 10
TRANSLATE_MAX_TOKENS = 220

SYSTEM_PROMPT = """You translate interview questions for a mental health pre-evaluation interview.

RULES:
- Translate the question into {target_language}.
- Use natural, conversational phrasing a patient would understand.
- Keep the original meaning exactly. Do not add, remove, or answer anything.
- Keep it a question.
- Do NOT add any diagnosis, emotion claim, or clinical term.
- Output ONLY the translated question. No quotes, no explanations, no notes."""


def translate_text(text: str, target: str) -> Optional[str]:
    """Return the translated question, or None on any failure."""
    target_language = TARGET_LANGUAGE_NAMES.get(target)
    if not target_language or not text or not text.strip():
        return None

    try:
        response = requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "system": SYSTEM_PROMPT.format(target_language=target_language),
                "prompt": text.strip(),
                "stream": False,
                "options": {
                    "temperature": 0.2,
                    "num_predict": TRANSLATE_MAX_TOKENS,
                    # Tiny context: questions are short and the GPU VRAM is
                    # mostly held by FER/SER/LER/Whisper — the default kv cache
                    # (hundreds of MB) fails to allocate (CUDA OOM).
                    "num_ctx": 512,
                },
            },
            timeout=TRANSLATE_TIMEOUT_SECONDS,
        )
        if response.status_code != 200:
            logger.warning("[Translate] Ollama non-200: %d", response.status_code)
            return None

        translated = response.json().get("response", "").strip()
        if not translated:
            return None

        # Guard against the model echoing the prompt or wrapping in quotes.
        translated = translated.strip('"\'')
        if translated.lower() == text.strip().lower():
            return None

        return translated
    except Exception as e:
        logger.warning("[Translate] Failed (%s): %s", target, e)
        return None
