from pathlib import Path

# ==========================================================
# PATHS
# ==========================================================

ROOT = Path(__file__).parent

DATASET_DIR = ROOT / "dataset" / "fer2013-rafdb-ckplus"

TRAIN_DIR = DATASET_DIR / "train"
VAL_DIR = DATASET_DIR / "validation"
TEST_DIR = DATASET_DIR / "test"

OUTPUT_DIR = ROOT / "outputs"

CHECKPOINT_DIR = OUTPUT_DIR / "checkpoints"
HISTORY_DIR = OUTPUT_DIR / "history"
PLOT_DIR = OUTPUT_DIR / "plots"
CONFUSION_DIR = OUTPUT_DIR / "confusion_matrix"

# ==========================================================
# MODEL
# ==========================================================

MODEL_NAME = "efficientnet_b0"

NUM_CLASSES = 4

IMAGE_SIZE = 224

# ==========================================================
# TRAINING
# ==========================================================

BATCH_SIZE = 16

NUM_WORKERS = 0

HEAD_EPOCHS = 10
FINETUNE_EPOCHS = 15

# Current training stage
EPOCHS = FINETUNE_EPOCHS

LEARNING_RATE = 1e-3 


FINETUNE_LR = 1e-5

WEIGHT_DECAY = 1e-4

DROPOUT = 0.4

SEED = 42

EARLY_STOPPING = 5


PIN_MEMORY = True