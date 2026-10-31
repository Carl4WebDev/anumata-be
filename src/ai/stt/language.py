"""
Language handling for Filipino interview speech.

Whisper has Tagalog ("tl") and English ("en") but no Cebuano/Bisaya. Left on
full auto-detect, short Bisaya or Taglish clips often come back labelled as
Indonesian, Malay or Javanese, and are then transcribed in that language's
spelling. Patients here speak English, Tagalog, Bisaya, or a mix, so detection
is restricted to the two supported codes: Bisaya is transcribed with the
Tagalog decoder (shared Latin orthography), and the frontend tells Bisaya and
Tagalog apart from the words themselves.

Pure functions only — no model imports — so this module is cheap to test.
"""

ALLOWED_LANGUAGES = ("en", "tl")

# Short, natural code-switched lines. Passed as Whisper's initial_prompt so the
# decoder expects Taglish / Bisaya-English mixing and keeps local spelling.
CODE_SWITCH_PROMPT = (
    "Kumusta ka? Okay lang ako, medyo stressed lang sa work. "
    "Maayo man ko, pero gikapoy ko karon. Oo, sige. Hindi ko alam. "
    "I feel tired, pero kaya pa naman. Mao ra to."
)

# Whisper's well-known phantom outputs on near-silent audio.
_PHANTOM_PHRASES = {
    "thank you",
    "thank you.",
    "thanks for watching",
    "thanks for watching!",
    "thank you for watching",
    "please subscribe",
    "subscribe",
    "you",
    "bye",
    "bye.",
    "salamat po",
    "salamat po.",
    "salamat",
    "salamat.",
}


from collections.abc import Iterable


def pick_language(
    all_probs: Iterable[tuple[str, float]] | None,
    hint: str | None = None,
    hint_margin: float = 0.25,
) -> str:
    """
    Choose "en" or "tl" from Whisper's language probabilities.

    all_probs: iterable of (code, probability), e.g. from detect_language().
    hint: the patient's known language ("en", "tl" or "ceb"); used when the
          audio is ambiguous so captions don't flip language phrase to phrase.
    """
    probs = {code: float(p) for code, p in (all_probs or [])}
    en = probs.get("en", 0.0)
    tl = probs.get("tl", 0.0)
    # Unsupported Austronesian guesses (id, ms, jw, su, ...) are almost always
    # Bisaya/Tagalog here — count them toward the local language.
    local = tl + sum(p for code, p in probs.items() if code in ("id", "ms", "jw", "su", "ceb", "haw", "fil"))

    hinted = "tl" if hint in ("tl", "ceb") else "en" if hint == "en" else None
    if hinted and abs(en - local) < hint_margin:
        return hinted
    return "en" if en >= local else "tl"


def is_phantom(text: str | None, no_speech_prob: float = 0.0, avg_logprob: float = 0.0) -> bool:
    """
    True for segments that are likely invented from silence: Whisper is unsure
    there is speech AND the text is a known phantom phrase or decoded with low
    confidence. A clearly spoken "salamat po" is kept.
    """
    cleaned = (text or "").strip().lower()
    if not cleaned:
        return True
    if no_speech_prob > 0.6 and avg_logprob < -0.8:
        return True
    return no_speech_prob > 0.3 and cleaned in _PHANTOM_PHRASES
