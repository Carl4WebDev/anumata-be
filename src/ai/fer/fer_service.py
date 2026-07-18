"""
FER (Facial Emotion Recognition) service.

Uses EfficientNet-B0 via timm for inference.
Detects faces with OpenCV Haar Cascade, classifies the largest face.
"""

import time
import logging

import cv2
import numpy as np
import timm
import torch
import torch.nn as nn
from PIL import Image
from torchvision import transforms

from config import (
    CASCADE_PATH,
    EMOTIONS_TITLE,
    FER_CONFIDENCE_THRESHOLD,
    FER_IMAGE_SIZE,
    FER_MARGIN_THRESHOLD,
    FER_MODEL_PATH,
)

logger = logging.getLogger(__name__)

_model = None
_face_cascade = None


def _get_model():
    global _model
    if _model is None:
        logger.info("Loading FER model from %s", FER_MODEL_PATH)
        model = timm.create_model("efficientnet_b0", pretrained=False)
        in_features = model.classifier.in_features
        model.classifier = nn.Sequential(
            nn.BatchNorm1d(in_features),
            nn.Dropout(0.4),
            nn.Linear(in_features, 256),
            nn.ReLU(inplace=True),
            nn.Dropout(0.4),
            nn.Linear(256, 4),
        )
        checkpoint = torch.load(str(FER_MODEL_PATH), map_location="cpu")
        model.load_state_dict(checkpoint["model_state_dict"])
        model.eval()
        _model = model
        logger.info("FER model loaded (epoch %s, val_acc %.2f%%)",
                     checkpoint.get("epoch"), checkpoint.get("best_val_acc", 0))
    return _model


def _get_face_cascade():
    global _face_cascade
    if _face_cascade is None:
        _face_cascade = cv2.CascadeClassifier(str(CASCADE_PATH))
        logger.info("Face cascade loaded from %s", CASCADE_PATH)
    return _face_cascade


_transform = transforms.Compose([
    transforms.Resize((FER_IMAGE_SIZE, FER_IMAGE_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])


def predict_emotion(image_bytes: bytes) -> dict:
    """
    Predict emotion from a single image.

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
    cascade = _get_face_cascade()

    # Decode image
    np_arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if img is None:
        return _error_result("Failed to decode image", start)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)

    # Detect faces
    faces = cascade.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=3, minSize=(40, 40)
    )

    if len(faces) == 0:
        return _no_face_result(start)

    # Use largest face
    faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
    x, y, w, h = faces[0]

    # Crop and preprocess face
    face_roi = img[y:y + h, x:x + w]
    face_rgb = cv2.cvtColor(face_roi, cv2.COLOR_BGR2RGB)
    pil_image = Image.fromarray(face_rgb)
    tensor = _transform(pil_image).unsqueeze(0)

    # Inference
    with torch.no_grad():
        outputs = model(tensor)
        probs = torch.softmax(outputs, dim=1)[0].cpu().numpy()

    # Apply confidence guard
    sorted_indices = np.argsort(probs)[::-1]
    top_idx = sorted_indices[0]
    second_idx = sorted_indices[1]
    top_prob = float(probs[top_idx])
    second_prob = float(probs[second_idx])
    margin = top_prob - second_prob

    if top_prob < FER_CONFIDENCE_THRESHOLD and margin < FER_MARGIN_THRESHOLD:
        emotion = "Neutral"
        confidence = float(probs[EMOTIONS_TITLE.index("Neutral")])
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


def _no_face_result(start: float) -> dict:
    return {
        "emotion": "NoFace",
        "confidence": 0.0,
        "probabilities": {e: 0.0 for e in EMOTIONS_TITLE},
        "processing_time": round(time.time() - start, 4),
    }


def _error_result(message: str, start: float) -> dict:
    return {
        "emotion": "Unknown",
        "confidence": 0.0,
        "probabilities": {e: 0.0 for e in EMOTIONS_TITLE},
        "processing_time": round(time.time() - start, 4),
    }
