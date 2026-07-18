"""
LER (Language Emotion Recognition) service.

Uses XLM-RoBERTa-base backbone with MLP classifier.
Detects emotional cues from transcribed spoken words.
"""

import time
import logging
import re
from typing import Set

import numpy as np
import torch
import torch.nn as nn
from transformers import AutoModel, AutoTokenizer

from config import (
    EMOTIONS_TITLE,
    LER_MAX_LENGTH,
    LER_MODEL_PATH,
)

logger = logging.getLogger(__name__)

_model = None
_tokenizer = None

# =============================================================================
# LANGUAGE DETECTION LEXICONS
# =============================================================================

BISAYA_KEYWORDS: Set[str] = {
    "kaayo", "maayo", "gikalain", "lagot", "malipayon", "masulob-on",
    "gwapa", "gwapo", "nindot", "dako", "gamay", "taas", "mubo",
    "salamat", "palihug", "oo", "dili", "wala", "naa", "adto",
    "karon", "ugma", "gahapon", "buntag", "hapon", "gabii",
    "kaon", "inom", "tulog", "lakaw", "dagan", "lingkod",
    "bata", "tiguwang", "lalaki", "babaye", "pamilya",
    "sakit", "masakit", "kalipay", "kasubo", "kasuko",
    "gugma", "paghigugma", "pagdumot", "pagmahay",
    "buhat", "trabaho", "eskwela", "skul", "kwarta",
    "problema", "tabang", "tambag", "istorya",
    "maayong", "grabe", "kaayo", "jud", "gyud",
    "bitaw", "diay", "man", "pud",
    "unsa", "kinsa", "asa", "ngano", "kanus-a",
}

FILIPINO_KEYWORDS: Set[str] = {
    "masaya", "malungkot", "galit", "natatakot", "naiinis",
    "mabuti", "masama", "maganda", "pangit", "matalino",
    "salamat", "pasensya", "opo", "hindi", "wala", "meron",
    "ngayon", "bukas", "kahapon", "umaga", "hapon", "gabi",
    "kain", "inom", "tulog", "lakad", "takbo", "upo",
    "bata", "matanda", "lalaki", "babae", "pamilya",
    "sakit", "masakit", "kaligayahan", "kalungkutan", "galit",
    "takot", "inip", "pagod", "hirap", "dusa",
    "pamilya", "kaibigan", "trabaho", "pera", "buhay",
    "mahal", "ayaw", "gusto", "kailangan", "puwede",
}


def detect_language(text: str) -> str:
    """Detect language of text using keyword heuristics."""
    words = set(re.findall(r"\b[a-z']+\b", text.lower()))
    bisaya_matches = len(words & BISAYA_KEYWORDS)
    filipino_matches = len(words & FILIPINO_KEYWORDS)

    total = bisaya_matches + filipino_matches
    if total == 0:
        return "English"
    if bisaya_matches > filipino_matches:
        return "Bisaya"
    if filipino_matches > bisaya_matches:
        return "Filipino"
    return "Mixed"


class EmotionClassifier(nn.Module):
    """LER model matching the training architecture in language/model.py."""

    def __init__(self, num_classes=4):
        super().__init__()
        self.backbone = AutoModel.from_pretrained(
            "FacebookAI/xlm-roberta-base", low_cpu_mem_usage=True
        )
        hidden_size = self.backbone.config.hidden_size  # 768
        self.classifier = nn.Sequential(
            nn.Linear(hidden_size, 256),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(256, num_classes),
        )

    def forward(self, input_ids, attention_mask):
        outputs = self.backbone(input_ids=input_ids, attention_mask=attention_mask)
        cls_output = outputs.last_hidden_state[:, 0, :]  # [CLS] token
        logits = self.classifier(cls_output)
        return logits


def _get_model():
    global _model
    if _model is None:
        logger.info("Loading LER model from %s", LER_MODEL_PATH)
        model = EmotionClassifier(num_classes=4)
        checkpoint = torch.load(str(LER_MODEL_PATH), map_location="cpu")
        model.load_state_dict(checkpoint["model_state_dict"])
        model.eval()
        _model = model
        logger.info("LER model loaded (epoch %s, val_acc %.2f%%)",
                     checkpoint.get("epoch"), checkpoint.get("best_val_acc", 0) * 100)
    return _model


def _get_tokenizer():
    global _tokenizer
    if _tokenizer is None:
        _tokenizer = AutoTokenizer.from_pretrained("FacebookAI/xlm-roberta-base")
        logger.info("XLM-RoBERTa tokenizer loaded")
    return _tokenizer


def predict_emotion(text: str) -> dict:
    """
    Predict emotion from text.

    Returns:
        {
            "emotion": str,
            "confidence": float,
            "probabilities": dict,
            "processing_time": float,
            "language_detected": str
        }
    """
    start = time.time()

    if not text or not text.strip():
        return _empty_result(start)

    model = _get_model()
    tokenizer = _get_tokenizer()
    language = detect_language(text)

    # Tokenize
    inputs = tokenizer(
        text, return_tensors="pt", padding=True, truncation=True,
        max_length=LER_MAX_LENGTH
    )

    # Inference
    with torch.no_grad():
        outputs = model(inputs["input_ids"], inputs["attention_mask"])
        probs = torch.softmax(outputs, dim=1)[0].cpu().numpy()

    # Get result
    sorted_indices = np.argsort(probs)[::-1]
    top_idx = sorted_indices[0]
    emotion = EMOTIONS_TITLE[top_idx]
    confidence = float(probs[top_idx])
    probabilities = {EMOTIONS_TITLE[i]: float(probs[i]) for i in range(len(EMOTIONS_TITLE))}

    return {
        "emotion": emotion,
        "confidence": round(confidence, 4),
        "probabilities": probabilities,
        "processing_time": round(time.time() - start, 4),
        "language_detected": language,
    }


def _empty_result(start: float) -> dict:
    probs = {e: 0.0 for e in EMOTIONS_TITLE}
    probs["Neutral"] = 1.0
    return {
        "emotion": "Neutral",
        "confidence": 1.0,
        "probabilities": probs,
        "processing_time": round(time.time() - start, 4),
        "language_detected": "Unknown",
    }
