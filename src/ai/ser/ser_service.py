"""
SER (Speech Emotion Recognition) service.

Uses Wav2Vec2-base backbone with MLP classifier.
Detects emotional cues from speech audio.
"""

import time
import logging
import tempfile
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
import torch
import torch.nn as nn
from transformers import Wav2Vec2Model, AutoProcessor

from config import (
    EMOTIONS,
    EMOTIONS_TITLE,
    SER_CONFIDENCE_THRESHOLD,
    SER_MARGIN_THRESHOLD,
    SER_MAX_DURATION,
    SER_MODEL_PATH,
    SER_OFFSET,
    SER_SAMPLE_RATE,
    SILENCE_RMS_THRESHOLD,
)

logger = logging.getLogger(__name__)

_model = None
_processor = None


class SERModel(nn.Module):
    """SER model matching the training architecture in ser/model.py."""

    def __init__(self, num_classes=4):
        super().__init__()
        self.backbone = Wav2Vec2Model.from_pretrained(
            "facebook/wav2vec2-base", low_cpu_mem_usage=True
        )
        hidden_size = self.backbone.config.hidden_size  # 768
        self.classifier = nn.Sequential(
            nn.Linear(hidden_size, 256),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(256, num_classes),
        )

    def forward(self, input_values, attention_mask=None):
        outputs = self.backbone(input_values=input_values, attention_mask=attention_mask)
        hidden_states = outputs.last_hidden_state
        pooled = hidden_states.mean(dim=1)
        logits = self.classifier(pooled)
        return logits


def _get_model():
    global _model
    if _model is None:
        logger.info("Loading SER model from %s", SER_MODEL_PATH)
        model = SERModel(num_classes=4)
        checkpoint = torch.load(str(SER_MODEL_PATH), map_location="cpu")
        model.load_state_dict(checkpoint["model_state_dict"])
        model.eval()
        _model = model
        logger.info("SER model loaded (epoch %s, val_acc %.2f%%)",
                     checkpoint.get("epoch"), checkpoint.get("best_val_acc", 0) * 100)
    return _model


def _get_processor():
    global _processor
    if _processor is None:
        _processor = AutoProcessor.from_pretrained("facebook/wav2vec2-base")
        logger.info("Wav2Vec2 processor loaded")
    return _processor


def _convert_to_wav(audio_bytes: bytes, filename: str) -> str:
    """Convert audio bytes to WAV temp file. Returns path."""
    suffix = Path(filename).suffix.lower() if filename else ".webm"

    if suffix == ".wav":
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        tmp.write(audio_bytes)
        tmp.close()
        return tmp.name

    # Convert via pydub
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


def predict_emotion(audio_bytes: bytes, filename: str = "audio.webm") -> dict:
    """
    Predict emotion from audio.

    Returns:
        {
            "emotion": str,
            "confidence": float,
            "probabilities": dict,
            "processing_time": float
        }
    """
    start = time.time()

    model = _get_model()
    processor = _get_processor()

    wav_path = None
    try:
        wav_path = _convert_to_wav(audio_bytes, filename)

        # Check audio duration
        info = sf.info(wav_path)
        if info.duration < 1.0:
            return _neutral_result("Audio too short", start)

        # Load audio
        y, sr = librosa.load(wav_path, sr=SER_SAMPLE_RATE, duration=SER_MAX_DURATION,
                             offset=SER_OFFSET, mono=True)

        # Silence detection
        rms = np.sqrt(np.mean(y ** 2))
        if rms < SILENCE_RMS_THRESHOLD:
            return _neutral_result("Silence detected", start)

        # Process with Wav2Vec2
        inputs = processor(
            y, sampling_rate=SER_SAMPLE_RATE, return_tensors="pt",
            padding=True, truncation=True, max_length=int(SER_SAMPLE_RATE * SER_MAX_DURATION)
        )

        # Inference
        with torch.no_grad():
            outputs = model(inputs.input_values, attention_mask=inputs.attention_mask)
            probs = torch.softmax(outputs, dim=1)[0].cpu().numpy()

        # Confidence guard
        sorted_indices = np.argsort(probs)[::-1]
        top_idx = sorted_indices[0]
        second_idx = sorted_indices[1]
        top_prob = float(probs[top_idx])
        second_prob = float(probs[second_idx])
        margin = top_prob - second_prob

        if top_prob < SER_CONFIDENCE_THRESHOLD and margin < SER_MARGIN_THRESHOLD:
            emotion = "Neutral"
            confidence = float(probs[EMOTIONS.index("neutral")]) if "neutral" in EMOTIONS else 0.5
        else:
            emotion = EMOTIONS_TITLE[top_idx]
            confidence = top_prob

        probabilities = {EMOTIONS_TITLE[i]: float(probs[i]) for i in range(len(EMOTIONS_TITLE))}

        return {
            "emotion": emotion,
            "confidence": round(confidence, 4),
            "probabilities": probabilities,
            "processing_time": round(time.time() - start, 4),
        }

    finally:
        if wav_path:
            Path(wav_path).unlink(missing_ok=True)


def _neutral_result(reason: str, start: float) -> dict:
    logger.info("SER neutral override: %s", reason)
    probs = {e: 0.0 for e in EMOTIONS_TITLE}
    probs["Neutral"] = 1.0
    return {
        "emotion": "Neutral",
        "confidence": 1.0,
        "probabilities": probs,
        "processing_time": round(time.time() - start, 4),
    }
