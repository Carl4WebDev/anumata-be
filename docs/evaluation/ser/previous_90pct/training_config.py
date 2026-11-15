"""
Configuration for the Speech Emotion Recognition (SER) project.

All paths are relative to the project root. No hardcoded absolute paths.
Every tunable parameter is defined here for single-source-of-truth configuration.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Dict


# =============================================================================
# PATHS
# =============================================================================

PROJECT_ROOT: Path = Path(__file__).parent.resolve()

# Where raw datasets live (user downloads)
RAW_DATASETS_DIR: Path = PROJECT_ROOT / "datasets" / "raw"

# Where merged (cleaned) audio goes
MERGED_DIR: Path = PROJECT_ROOT / "datasets" / "merged"

# Train / validation / test splits
TRAIN_DIR: Path = PROJECT_ROOT / "datasets" / "train"
VALIDATION_DIR: Path = PROJECT_ROOT / "datasets" / "validation"
TEST_DIR: Path = PROJECT_ROOT / "datasets" / "test"

# Metadata
METADATA_PATH: Path = PROJECT_ROOT / "metadata.csv"

# Outputs (models, plots, logs)
OUTPUTS_DIR: Path = PROJECT_ROOT / "outputs"

# Inference directory
INFERENCE_DIR: Path = PROJECT_ROOT / "inference"


# =============================================================================
# DATASET CONFIGURATION
# =============================================================================

# The 4 target emotions (canonical lowercase names)
TARGET_EMOTIONS: List[str] = ["angry", "happy", "neutral", "sad"]

# Mapping from canonical emotion to integer label
EMOTION_TO_LABEL: Dict[str, int] = {
    "angry": 0,
    "happy": 1,
    "neutral": 2,
    "sad": 3,
}

LABEL_TO_EMOTION: Dict[int, str] = {v: k for k, v in EMOTION_TO_LABEL.items()}

NUM_CLASSES: int = len(TARGET_EMOTIONS)


# =============================================================================
# CREMA-D EMOTION CODES
# =============================================================================

# Filename format: {ActorID}_{Sentence}_{Emotion}_{Level}.{ext}
# Example: 1001_IEO_ANG_HI.wav
CREMAD_EMOTION_MAP: Dict[str, str] = {
    "ANG": "angry",
    "HAP": "happy",
    "NEU": "neutral",
    "SAD": "sad",
    # Ignored: DIS (disgust), FEA (fear)
}

CREMAD_GENDER_MAP: Dict[int, str] = {}  # Built at runtime from actor IDs
# CREMA-D: actors 1001-1091. Male: 1001-1048, Female: 1049-1091
CREMAD_MALE_ACTORS: range = range(1001, 1049)
CREMAD_FEMALE_ACTORS: range = range(1049, 1092)


# =============================================================================
# RAVDESS EMOTION CODES
# =============================================================================

# Filename format: {Modality}-{VocalChannel}-{Emotion}-{Intensity}-{Statement}-{Repetition}-{Actor}.wav
# Example: 03-01-01-01-01-01-01.wav
# Actor: odd = male, even = female
RAVDESS_EMOTION_MAP: Dict[str, str] = {
    "01": "neutral",
    "03": "happy",
    "04": "sad",
    "05": "angry",
    # Ignored: 02 (calm), 06 (fearful), 07 (disgust), 08 (surprised)
}


# =============================================================================
# SAVEE EMOTION CODES
# =============================================================================

# Filename format: {Speaker}{EmotionCode}{Number}.wav
# Example: DC_a01.wav
# Speakers: DC, JE, JK, KL (all male)
SAVEE_EMOTION_MAP: Dict[str, str] = {
    "a": "angry",
    "h": "happy",
    "n": "neutral",
    "sa": "sad",
    # Ignored: d (disgust), f (fear), su (surprise)
}

SAVEE_SPEAKERS: List[str] = ["DC", "JE", "JK", "KL"]


# =============================================================================
# TESS EMOTION CODES
# =============================================================================

# Folder format: {SpeakerPrefix}_{emotion}/
# Filename format: {SpeakerPrefix}_{word}_{emotion}.wav
# Speakers: OAF (Old Adult Female), YAF (Young Adult Female)
# IMPORTANT: Folder names have INCONSISTENT CASING in the Kaggle release:
#   OAF_angry, OAF_disgust, OAF_Fear, OAF_happy, OAF_neutral, OAF_Pleasant_surprise, OAF_Sad
#   YAF_angry, YAF_disgust, YAF_fear, YAF_happy, YAF_neutral, YAF_pleasant_surprised, YAF_sad
TESS_EMOTION_FOLDERS: Dict[str, str] = {
    # Lowercase variants
    "angry": "angry",
    "happy": "happy",
    "neutral": "neutral",
    "sad": "sad",
    # Capitalized variants (Kaggle inconsistency)
    "Sad": "sad",
    "Fear": None,  # Ignored
    "Pleasant_surprise": None,  # Ignored
    # Lowercase ignored
    "disgust": None,
    "fear": None,
    "pleasant_surprised": None,
}


# =============================================================================
# AUDIO PREPROCESSING
# =============================================================================

@dataclass(frozen=True)
class AudioConfig:
    """Audio preprocessing configuration."""
    target_sample_rate: int = 16000       # 16 kHz (standard for speech models)
    target_channels: int = 1              # Mono
    normalize: bool = True                # Peak normalization
    trim_silence: bool = True             # Trim leading/trailing silence
    trim_top_db: float = 25.0             # dB threshold for silence detection
    max_duration_seconds: float = 4.0    # Max clip duration (seconds)
    min_duration_seconds: float = 0.5     # Min clip duration (seconds)


AUDIO_CONFIG: AudioConfig = AudioConfig()


# =============================================================================
# MODEL CONFIGURATION
# =============================================================================

@dataclass(frozen=True)
class ModelConfig:
    """
    Model configuration.

    We use Wav2Vec2-base as the backbone because:
    1. It was pretrained on 960h of LibriSpeech — strong speech representations.
    2. Smaller than HuBERT-base (same parameter count but faster inference).
    3. Well-supported in Hugging Face Transformers.
    4. Proven track record in SER benchmarks.

    HuBERT-base is a valid alternative with comparable performance.
    Both use the same transformer architecture; the difference is in
    pretraining objective (contrastive vs. masked prediction).
    """
    backbone_name: str = "facebook/wav2vec2-base"
    freeze_backbone: bool = True          # Phase 1: freeze backbone, train classifier
    classifier_hidden_size: int = 256     # Hidden layer in classifier head
    classifier_dropout: float = 0.3       # Dropout for regularization
    num_classes: int = NUM_CLASSES


MODEL_CONFIG: ModelConfig = ModelConfig()


# =============================================================================
# TRAINING CONFIGURATION
# =============================================================================

@dataclass(frozen=True)
class TrainingConfig:
    """Training hyperparameters."""
    batch_size: int = 16
    num_epochs: int = 20
    learning_rate: float = 1e-3           # Classifier head LR
    backbone_learning_rate: float = 1e-5  # Lower LR for fine-tuning backbone
    weight_decay: float = 1e-2
    warmup_ratio: float = 0.1
    max_grad_norm: float = 1.0
    seed: int = 42
    num_workers: int = 0                  # 0 on Windows to avoid multiprocessing issues
    pin_memory: bool = True
    early_stopping_patience: int = 5      # Stop if no improvement for N epochs


TRAINING_CONFIG: TrainingConfig = TrainingConfig()


# =============================================================================
# SPLIT CONFIGURATION
# =============================================================================

@dataclass(frozen=True)
class SplitConfig:
    """Dataset split ratios."""
    train_ratio: float = 0.70
    validation_ratio: float = 0.15
    test_ratio: float = 0.15
    random_seed: int = 42


SPLIT_CONFIG: SplitConfig = SplitConfig()


# =============================================================================
# VOICE ACTIVITY DETECTION (VAD) CONFIGURATION
# =============================================================================

@dataclass(frozen=True)
class MicVADConfig:
    """Configuration for real-time microphone VAD pipeline."""
    # Silero VAD
    vad_threshold: float = 0.5          # Speech probability threshold (0.0–1.0)
    vad_window_samples: int = 512       # VAD analysis window in samples (512 = 32ms at 16kHz)

    # Recording bounds
    min_speech_duration: float = 1.0    # Minimum speech duration to accept (seconds)
    max_record_duration: float = 30.0   # Maximum recording duration (seconds)
    silence_timeout: float = 1.5        # Stop after this many seconds of silence (seconds)

    # SER window
    ser_window_seconds: float = 3.0     # Window size for SER classification (seconds)

    # Smoothing
    ema_alpha: float = 0.3              # EMA smoothing factor (0 = full smoothing, 1 = no smoothing)

    # Audio
    sample_rate: int = 16000            # Microphone sample rate (Hz)

    @property
    def vad_window_seconds(self) -> float:
        """VAD window duration in seconds."""
        return self.vad_window_samples / self.sample_rate

    @property
    def ser_window_samples(self) -> int:
        """SER window size in samples."""
        return int(self.ser_window_seconds * self.sample_rate)

    @property
    def min_speech_samples(self) -> int:
        """Minimum speech duration in samples."""
        return int(self.min_speech_duration * self.sample_rate)

    @property
    def max_record_samples(self) -> int:
        """Maximum recording duration in samples."""
        return int(self.max_record_duration * self.sample_rate)

    @property
    def silence_timeout_samples(self) -> int:
        """Silence timeout in samples."""
        return int(self.silence_timeout * self.sample_rate)


MIC_VAD_CONFIG: MicVADConfig = MicVADConfig()


# =============================================================================
# FILENAME PREFIXES (for renamed files)
# =============================================================================

DATASET_PREFIXES: Dict[str, str] = {
    "CREMAD": "cremad",
    "RAVDESS": "ravdess",
    "SAVEE": "savee",
    "TESS": "tess",
}
