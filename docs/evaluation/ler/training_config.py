"""
Configuration for the Language Analysis (LA) project.

All paths are relative to the project root. No hardcoded absolute paths.
Every tunable parameter is defined here for single-source-of-truth configuration.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List


# =============================================================================
# PATHS
# =============================================================================

PROJECT_ROOT: Path = Path(__file__).parent.resolve()

# Datasets
RAW_DATASETS_DIR: Path = PROJECT_ROOT / "datasets" / "raw"
PROCESSED_DIR: Path = PROJECT_ROOT / "datasets" / "processed"
DAVAO_DIR: Path = PROJECT_ROOT / "datasets" / "davao"

TRAIN_CSV: Path = PROCESSED_DIR / "train.csv"
VALIDATION_CSV: Path = PROCESSED_DIR / "validation.csv"
TEST_CSV: Path = PROCESSED_DIR / "test.csv"

# Outputs
OUTPUTS_DIR: Path = PROJECT_ROOT / "outputs"
CHECKPOINTS_DIR: Path = OUTPUTS_DIR / "checkpoints"
TOKENIZER_DIR: Path = CHECKPOINTS_DIR / "tokenizer"
HISTORY_DIR: Path = OUTPUTS_DIR / "history"
PLOTS_DIR: Path = OUTPUTS_DIR / "plots"
CONFUSION_DIR: Path = OUTPUTS_DIR / "confusion_matrix"
LOGS_DIR: Path = OUTPUTS_DIR / "logs"
LABEL_MAPPING_PATH: Path = OUTPUTS_DIR / "label_mapping.json"


# =============================================================================
# DATASET CONFIGURATION
# =============================================================================

TARGET_EMOTIONS: List[str] = ["angry", "happy", "neutral", "sad"]

LABEL_TO_ID: Dict[str, int] = {
    "angry": 0,
    "happy": 1,
    "neutral": 2,
    "sad": 3,
}

ID_TO_LABEL: Dict[int, str] = {v: k for k, v in LABEL_TO_ID.items()}

NUM_CLASSES: int = len(TARGET_EMOTIONS)


# =============================================================================
# MODEL CONFIGURATION
# =============================================================================

@dataclass(frozen=True)
class ModelConfig:
    """
    Model configuration.

    We use XLM-RoBERTa-base as the backbone because:
    1. Multilingual — supports English, Filipino, Bisaya, and 100+ languages.
    2. Pretrained on 2.5TB of CommonCrawl data — strong text representations.
    3. Well-supported in Hugging Face Transformers.
    4. Same hidden size (768) as Wav2Vec2-base — consistent architecture.
    """
    backbone_name: str = "FacebookAI/xlm-roberta-base"
    freeze_backbone: bool = True
    classifier_hidden_size: int = 256
    classifier_dropout: float = 0.3
    num_classes: int = NUM_CLASSES
    max_length: int = 128


MODEL_CONFIG: ModelConfig = ModelConfig()


# =============================================================================
# TRAINING CONFIGURATION
# =============================================================================

@dataclass(frozen=True)
class TrainingConfig:
    """Training hyperparameters."""
    batch_size: int = 16
    num_epochs: int = 20
    learning_rate: float = 1e-3
    backbone_learning_rate: float = 1e-5
    weight_decay: float = 1e-2
    warmup_ratio: float = 0.1
    max_grad_norm: float = 1.0
    seed: int = 42
    num_workers: int = 0
    pin_memory: bool = True
    early_stopping_patience: int = 5


TRAINING_CONFIG: TrainingConfig = TrainingConfig()


# =============================================================================
# FINE-TUNING CONFIGURATION (Phase 2)
# =============================================================================

@dataclass(frozen=True)
class FineTuningConfig:
    """
    Configurable partial fine-tuning settings for Phase 2.

    Adjust these values to experiment with different fine-tuning strategies
    without modifying model.py or train.py.

    Examples:
        UNFREEZE_LAST_N_LAYERS = 2  — only top 2 transformer layers
        UNFREEZE_LAST_N_LAYERS = 4  — top 4 layers (recommended for RTX 2050)
        UNFREEZE_LAST_N_LAYERS = 6  — top 6 layers
        UNFREEZE_LAST_N_LAYERS = 12 — all layers (full fine-tuning)
    """
    # Number of transformer layers to unfreeze from the end
    # XLM-RoBERTa-base has 12 layers (0-11)
    unfreeze_last_n_layers: int = 4

    # Whether to freeze the embedding layer (saves VRAM)
    freeze_embeddings: bool = True

    # Learning rates for Phase 2
    backbone_lr: float = 1e-5      # LR for unfrozen transformer layers
    classifier_lr: float = 1e-4    # LR for classifier head


FINETUNING_CONFIG: FineTuningConfig = FineTuningConfig()


# =============================================================================
# SPLIT CONFIGURATION
# =============================================================================

@dataclass(frozen=True)
class SplitConfig:
    """Dataset split ratios (only used when a dataset has no official split)."""
    train_ratio: float = 0.70
    validation_ratio: float = 0.15
    test_ratio: float = 0.15
    random_seed: int = 42


SPLIT_CONFIG: SplitConfig = SplitConfig()
