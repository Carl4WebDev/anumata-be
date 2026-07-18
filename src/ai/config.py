"""
Anumata AI Configuration.

All model paths, fusion weights, emotion labels, thresholds.
Dataclasses for structured config to avoid hardcoded values.
"""

from dataclasses import dataclass
from pathlib import Path

# =============================================================================
# PATHS
# =============================================================================

AI_ROOT = Path(__file__).parent.resolve()
MODELS_DIR = AI_ROOT / "models"

FER_MODEL_PATH = MODELS_DIR / "fer_best_model.pth"
SER_MODEL_PATH = MODELS_DIR / "ser_best_model.pt"
LER_MODEL_PATH = MODELS_DIR / "ler_best_model.pt"
CASCADE_PATH = MODELS_DIR / "haarcascade_frontalface_default.xml"

# =============================================================================
# EMOTION LABELS
# =============================================================================

EMOTIONS = ["angry", "happy", "neutral", "sad"]
EMOTIONS_TITLE = [e.title() for e in EMOTIONS]  # ["Angry", "Happy", "Neutral", "Sad"]
ALL_EMOTIONS = ["Angry", "Happy", "Neutral", "Sad"]

# =============================================================================
# FUSION WEIGHTS (configurable dataclass — never hardcoded in fusion logic)
# =============================================================================


@dataclass
class FusionConfig:
    """Configurable fusion weights. Change without modifying fusion logic."""
    ser_weight: float = 0.40
    fer_weight: float = 0.40
    ler_weight: float = 0.20


DEFAULT_FUSION_CONFIG = FusionConfig()
DEFAULT_FUSION_WEIGHTS = {
    "ser": DEFAULT_FUSION_CONFIG.ser_weight,
    "fer": DEFAULT_FUSION_CONFIG.fer_weight,
    "ler": DEFAULT_FUSION_CONFIG.ler_weight,
}

# =============================================================================
# RISK ASSESSMENT (configurable dataclass)
# =============================================================================


@dataclass
class RiskConfig:
    """Configurable risk thresholds."""
    high_threshold: float = 0.60       # Sad% + Angry% > 60%
    moderate_threshold: float = 0.30   # Sad% + Angry% > 30%


RISK_CONFIG = RiskConfig()
RISK_HIGH_THRESHOLD = 60    # legacy constant
RISK_MODERATE_THRESHOLD = 30

# =============================================================================
# FER CONFIGURATION
# =============================================================================


@dataclass(frozen=True)
class FERConfig:
    img_size: int = 224
    neutral_threshold: float = 0.40
    margin_threshold: float = 0.15
    input_channels: int = 3


FER_CONFIG = FERConfig()
FER_IMAGE_SIZE = FER_CONFIG.img_size
FER_CONFIDENCE_THRESHOLD = FER_CONFIG.neutral_threshold
FER_MARGIN_THRESHOLD = FER_CONFIG.margin_threshold

# =============================================================================
# SER CONFIGURATION
# =============================================================================


@dataclass(frozen=True)
class SERConfig:
    backbone_name: str = "facebook/wav2vec2-base"
    classifier_hidden_size: int = 256
    classifier_dropout: float = 0.3
    num_classes: int = 4
    sample_rate: int = 16000
    max_duration: float = 3.0
    offset: float = 0.5
    neutral_threshold: float = 0.50
    margin_threshold: float = 0.20
    silence_rms_threshold: float = 0.005
    n_mfcc: int = 40


SER_CONFIG = SERConfig()
SER_SAMPLE_RATE = SER_CONFIG.sample_rate
SER_MAX_DURATION = SER_CONFIG.max_duration
SER_OFFSET = SER_CONFIG.offset
SER_CONFIDENCE_THRESHOLD = SER_CONFIG.neutral_threshold
SER_MARGIN_THRESHOLD = SER_CONFIG.margin_threshold
SILENCE_RMS_THRESHOLD = SER_CONFIG.silence_rms_threshold

# =============================================================================
# LER CONFIGURATION
# =============================================================================


@dataclass(frozen=True)
class LERConfig:
    backbone_name: str = "FacebookAI/xlm-roberta-base"
    classifier_hidden_size: int = 256
    classifier_dropout: float = 0.3
    num_classes: int = 4
    max_length: int = 128


LER_CONFIG = LERConfig()
LER_MAX_LENGTH = LER_CONFIG.max_length

# =============================================================================
# STT CONFIGURATION
# =============================================================================


@dataclass(frozen=True)
class STTConfig:
    model_size: str = "large-v3"
    device: str = "cuda"
    compute_type: str = "float16"
    language: str = "tl"
    beam_size: int = 5
    vad_filter: bool = True


STT_CONFIG = STTConfig()
WHISPER_MODEL_SIZE = STT_CONFIG.model_size
WHISPER_DEVICE = STT_CONFIG.device
WHISPER_COMPUTE_TYPE = STT_CONFIG.compute_type
WHISPER_LANGUAGE = STT_CONFIG.language

# =============================================================================
# OLLAMA CONFIGURATION
# =============================================================================


@dataclass(frozen=True)
class OllamaConfig:
    base_url: str = "http://localhost:11434"
    model: str = "qwen3:4b"
    timeout: int = 120


OLLAMA_CONFIG = OllamaConfig()
OLLAMA_BASE_URL = OLLAMA_CONFIG.base_url
OLLAMA_MODEL = OLLAMA_CONFIG.model

# =============================================================================
# SPIKE DETECTION
# =============================================================================


@dataclass(frozen=True)
class SpikeConfig:
    transition_confidence: float = 0.50
    high_confidence_threshold: float = 0.70
    flip_confidence: float = 0.50
    intensification_delta: float = 0.10


SPIKE_CONFIG = SpikeConfig()

# =============================================================================
# SERVER
# =============================================================================

AI_SERVICE_HOST = "0.0.0.0"
AI_SERVICE_PORT = 8001
