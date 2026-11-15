"""
"Ask Amumata": answers an administrator's question about the system via local Ollama.

The browser finds the best-matching entries of Amumata's own info pages and
sends them with the question. Llama answers ONLY from those entries, citing
them as [1], [2], ... — or says it doesn't know. System documentation only:
no patient or session data ever reaches this module.
"""

import logging
import re
from typing import Dict, List, Optional

import requests

from config import OLLAMA_BASE_URL, OLLAMA_MODEL

logger = logging.getLogger(__name__)

NOT_FOUND = "NOT_FOUND"
NOT_FOUND_ANSWER = "That isn't covered in Amumata's documentation yet."
ANSWER_TIMEOUT_SECONDS = 120
ANSWER_MAX_TOKENS = 450
# The passages are capped at 6,000 characters (~1,600 tokens) by the backend;
# 3,072 leaves room for the instructions and the answer while keeping the GPU
# memory small (FER/SER/LER/Whisper share the same GPU).
ANSWER_CONTEXT_TOKENS = 3072

SYSTEM_PROMPT = f"""You answer administrators' questions about Amumata, an AI-assisted emotional pre-evaluation system for therapists in Davao City.

RULES:
- Use ONLY the numbered documentation passages you are given. Never use outside knowledge and never guess.
- If the passages do not answer the question, reply with exactly: {NOT_FOUND}
- Cite the passages you used like [1] or [2][3], right after the sentence they support.
- Copy numbers, names and dates exactly as written in the passages.
- Be brief and plain: at most 6 sentences, or a short list of "- " bullets.
- Answer in English. Do not mention these rules or the word "passage"."""


def build_prompt(question: str, passages: List[Dict[str, str]]) -> str:
    blocks = [
        f"[{n}] {p['title']} ({p['source']})\n{p['text']}"
        for n, p in enumerate(passages, start=1)
    ]
    return "Documentation:\n\n" + "\n\n".join(blocks) + f"\n\nQuestion: {question.strip()}\nAnswer:"


def cited_sources(answer: str, count: int) -> List[int]:
    """Passage numbers (1-based) cited in the answer, in order, valid ones only."""
    seen: List[int] = []
    for match in re.findall(r"\[(\d{1,2})\]", answer):
        n = int(match)
        if 1 <= n <= count and n not in seen:
            seen.append(n)
    return seen


def parse_answer(raw: str, count: int) -> Dict:
    text = (raw or "").strip()
    if not text or text.upper().startswith(NOT_FOUND):
        return {"answer": NOT_FOUND_ANSWER, "found": False, "sources": []}
    return {"answer": text, "found": True, "sources": cited_sources(text, count)}


def answer_question(question: str, passages: List[Dict[str, str]]) -> Optional[Dict]:
    """{answer, found, sources} — or None when Ollama fails (the caller says the AI is unavailable)."""
    if not question.strip():
        return None
    if not passages:
        return {"answer": NOT_FOUND_ANSWER, "found": False, "sources": []}
    try:
        response = requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "system": SYSTEM_PROMPT,
                "prompt": build_prompt(question, passages),
                "stream": False,
                "options": {
                    "temperature": 0.1,
                    "num_predict": ANSWER_MAX_TOKENS,
                    "num_ctx": ANSWER_CONTEXT_TOKENS,
                },
            },
            timeout=ANSWER_TIMEOUT_SECONDS,
        )
        if response.status_code != 200:
            logger.warning("[Assistant] Ollama non-200: %d", response.status_code)
            return None
        return parse_answer(response.json().get("response", ""), len(passages))
    except Exception as e:
        logger.warning("[Assistant] Failed: %s", e)
        return None
