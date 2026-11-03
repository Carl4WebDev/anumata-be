# Language Analysis (LA) Module

Text emotion classification using XLM-RoBERTa with transfer learning. Part of the Anumata thesis project.

## Overview

This module classifies text into 4 emotions: **Angry**, **Happy**, **Neutral**, **Sad**. It uses:

- **Backbone:** FacebookAI/xlm-roberta-base (multilingual, 278M params)
- **Transfer learning:** Phase 1 (frozen backbone) → Phase 2 (full fine-tuning)
- **Datasets:** GoEmotions, DAIR-AI Emotion, SemEval-2018 Task 1
- **Language detection:** English, Filipino, Bisaya, Mixed

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Prepare Datasets

```bash
python prepare_datasets.py
```

Downloads, cleans, merges, and splits the 3 public datasets into `datasets/processed/`.

### 3. Train

**Phase 1** (frozen backbone):
```bash
python train.py --phase 1
```

**Phase 2** (full fine-tuning):
```bash
python train.py --phase 2
```

**Phase 2 with Davao transcripts:**
```bash
python train.py --phase 2 --dataset davao
```

### 4. Evaluate

```bash
python evaluate.py
python evaluate.py --model outputs/checkpoints/final_model_phase2.pt
```

### 5. Predict

```bash
python predict.py --text "I feel happy today"
python predict.py  # Interactive mode
```

## Project Structure

```
language/
├── datasets/
│   ├── raw/                    # Downloaded by prepare_datasets.py
│   ├── processed/              # Merged train/val/test CSVs
│   └── davao/                  # Future: Davao interview transcripts
├── inference/
│   ├── predictor.py            # Emotion prediction from text
│   ├── preprocess.py           # Language detection
│   └── utils.py                # Shared utilities
├── outputs/
│   ├── checkpoints/            # Model checkpoints + tokenizer
│   ├── history/                # Training history
│   ├── plots/                  # Training curves
│   ├── confusion_matrix/       # Confusion matrix outputs
│   ├── logs/                   # Classification reports
│   └── label_mapping.json      # Label mapping for inference
├── config.py                   # All configuration
├── mapping.py                  # Dataset label mappings
├── dataset.py                  # PyTorch Dataset class
├── model.py                    # XLM-RoBERTa model with classifier
├── train.py                    # 2-phase training loop
├── evaluate.py                 # Test set evaluation
├── predict.py                  # Single-text inference
├── prepare_datasets.py         # Dataset download pipeline
└── plot_history.py             # Training visualization
```

## Label Mapping

Each dataset maps to 4 canonical emotions:

| Dataset | Labels Mapped |
|---------|---------------|
| GoEmotions | 28 → 4 (anger, joy, neutral, sadness, ...) |
| DAIR-AI | 6 → 4 (anger, joy, love, sadness, fear, surprise) |
| SemEval-2018 | 11 → 4 (anger, joy, optimism, sadness, fear, ...) |

See `mapping.py` for complete mappings.

## Future Davao Fine-Tuning

1. Create `datasets/davao/` directory
2. Add `train.csv`, `validation.csv`, `test.csv` (format: `text,label,dataset_source`)
3. Run: `python train.py --phase 2 --dataset davao`

## Architecture

```
Input text
    ↓
XLM-RoBERTa tokenizer (128 tokens max)
    ↓
XLM-RoBERTa backbone (768-dim)
    ↓
[CLS] token pooling
    ↓
MLP classifier (768 → 256 → 4)
    ↓
Softmax → Emotion probabilities
```

## Training Features

- Mixed precision (AMP) for CUDA
- WeightedRandomSampler for class balancing
- OneCycleLR scheduler with warmup
- Early stopping (patience=5)
- Best model checkpointing
- Training history saved as .pt

## Integration with Anumata

The predictor returns a structured result:

```python
{
    "language": "Bisaya",
    "emotion": "sad",
    "confidence": 0.94,
    "probabilities": {"angry": 0.02, "happy": 0.03, "neutral": 0.01, "sad": 0.94}
}
```

Import and use:
```python
from inference.predictor import TextEmotionPredictor

predictor = TextEmotionPredictor()
result = predictor.predict("Gikalain ko kaayo")
```
