# Model evaluation results

Test-set evaluation of the three emotion models Amumata runs. Each model was
trained in its own project (outside this repository) and evaluated on a
held-out test split it never saw during training. The files here are copied
unchanged from those projects' `outputs/` folders (SER/LER evaluation run
2026-07-17; FER retrained and evaluated 2026-11-13 — the previous FER model's
files are in `fer/previous_61pct/`).

The model files themselves are not stored here (25 MB – 1.3 GB each); the
deployed files in `src/ai/models/` are the same checkpoints that were evaluated
(`fer_best_model.pth` = FER `best_model.pth`, `ser_best_model.pt` = SER
`best_model_phase2.pt`, `ler_best_model.pt` = LER `best_model_phase2.pt`).

All three classify the same 4 emotions: **Angry, Happy, Neutral, Sad**.

## Summary

| Model | Input | Backbone | Training data | Test samples | Accuracy | Macro F1 | Weighted F1 |
|---|---|---|---|---|---|---|---|
| **SER** | Voice (16 kHz audio) | Wav2Vec2-base | CREMA-D, RAVDESS, SAVEE, TESS | 1,121 | **90.54%** | 0.905 | 0.906 |
| **LER** | Transcribed words | XLM-RoBERTa-base | GoEmotions, DAIR-AI Emotion | 6,987 | **74.97%** | 0.731 | 0.755 |
| **FER** | Grayscale face (224×224) | EfficientNet-B0 | FER2013, RAF-DB, CK+, Davao photos (cleaned) | 7,640 | **77.15%** | 0.746 | 0.774 |

The session result shown to therapists fuses **FER + SER only** (50/50
weights, `src/ai/config.py`). LER is shown as an experimental reading and is
not part of the fusion.

### F1 per emotion

| Model | Angry | Happy | Neutral | Sad |
|---|---|---|---|---|
| SER | 0.924 | 0.896 | 0.892 | 0.909 |
| LER | 0.640 | 0.831 | 0.637 | 0.814 |
| FER | 0.693 | 0.897 | 0.709 | 0.686 |

### Precision / recall per emotion

| Model | Angry P / R | Happy P / R | Neutral P / R | Sad P / R |
|---|---|---|---|---|
| SER | 0.924 / 0.924 | 0.908 / 0.885 | 0.854 / 0.934 | 0.937 / 0.882 |
| LER | 0.593 / 0.695 | 0.903 / 0.770 | 0.597 / 0.683 | 0.797 / 0.832 |
| FER | 0.679 / 0.708 | 0.934 / 0.863 | 0.672 / 0.750 | 0.694 / 0.678 |

## Data splits

| Model | Train | Validation | Test | Split |
|---|---|---|---|---|
| SER | 5,230 | 1,121 | 1,121 | Stratified 70 / 15 / 15, seed 42 |
| LER | 55,894 | 6,987 | 6,987 | 80 / 10 / 10 after cleaning (69,868 texts) |
| FER | 25,234 | 4,287 | 7,640 | Official train/test portions, cleaned; Davao photos split by person ~70/15/15 |

Where the data comes from (verified by counting the training projects' files, 2026-11-02):

- **SER** — 7,472 clips: CREMA-D 4,900 · TESS 1,600 · RAVDESS 672 · SAVEE 300 (from `metadata.csv`
  and the file prefixes in each split). 121 speakers.
- **LER** — 69,868 texts: GoEmotions 50,634 · DAIR-AI 19,234 (from the `dataset_source` column of
  `train/validation/test.csv`). The training README also lists SemEval-2018, but no SemEval rows are in
  the final data.
- **FER** — 37,161 images after cleaning (from 39,131 + 155 Davao photos): FER2013 24,573 · RAF-DB 12,295 ·
  CK+ 142 · Davao 151. Cleaning removed duplicates (983), training copies of test images (700), images
  with conflicting labels (138), blank images (16), extra frames of the same CK+ clip (284) and 4 Davao
  photos with no detectable face. All faces are grayscale 112×112; Davao faces are cropped like the app
  (Haar cascade). The test set is the **official test images** (FER2013 PublicTest + PrivateTest, RAF-DB
  test, duplicates removed) plus 23 Davao photos. Details: `fer/dataset_cleaning_report.txt`.

Per-class counts:

- **SER** — train: angry 1,346 · happy 1,346 · neutral 1,192 · sad 1,346; test: 289 · 288 · 256 · 288
- **LER** — all data: angry 10,148 · happy 31,576 · neutral 15,972 · sad 12,172 (see `ler/dataset_statistics.txt`)
- **FER** — train: angry 3,690 · happy 10,014 · neutral 6,098 · sad 5,432; test: 1,095 · 2,949 · 1,888 · 1,708

## Training settings

| | SER | LER | FER |
|---|---|---|---|
| Strategy | 2 phases: frozen backbone, then fine-tune | 2 phases: frozen backbone, then top 4 layers | 3 stages: head; last block; last 3 blocks |
| Batch size | 16 | 16 | 16 |
| Learning rate | 1e-3 head, 1e-5 backbone | 1e-3 head; phase 2: 1e-4 head, 1e-5 backbone | 1e-3 head; 1e-5 last block; 1e-4 last 3 blocks |
| Epochs (max) | 20 (early stopping, patience 5) | 20 (early stopping, patience 5) | 10 + 15 + 20 (early stopping 5); best: stage 3, epoch 6 |
| Regularisation | Dropout 0.3, weight decay 1e-2 | Dropout 0.3, weight decay 1e-2, class-balanced sampling | Dropout 0.4, weight decay 1e-4 |
| Seed | 42 | 42 | 42 |

Full settings: `*/training_config.py`. Dataset notes: `ser/training_README.md`,
`ler/training_README.md`, `ler/label_mapping_decisions.txt` (how GoEmotions'
28 labels were mapped to 4, and what was removed).

## Notes for interpretation

- **FER was retrained (2026-11-13): 77.15%, up from 61.15%.** The test sets
  differ: the new one is cleaned (duplicates removed) and adds Davao photos.
  On this same cleaned test set the previous model scores **54.27%**, so the
  gain is real, not just an easier test. Remaining errors are mostly sad faces
  read as neutral (328) and neutral read as sad (284).
- **FER on Davao (Filipino) faces: 65.22%** on 23 test photos — an early sign
  only. Sad is the weak spot (0 of 4 Davao sad photos). The Davao photos had no
  participant IDs, so people were kept in one split by face similarity (an
  estimate).
- **SER's split is not speaker-independent.** `split_dataset.py` splits by
  file (stratified by emotion only). Checked against `metadata.csv`: all 121
  speakers appear in both training and test, so **every one of the 1,121 test
  clips is from a voice the model trained on**. The 90.5% therefore measures
  recognising emotions in familiar voices; on a new speaker it is likely
  lower. A speaker-independent split (holding out whole actors) would give a
  stricter figure.
- **SER was trained on acted English speech.** Accuracy on real Filipino
  patients may be lower; this is a known limitation.
- **LER removed duplicate texts before splitting** (319 within and across
  datasets). Checked: only 7 of the 6,987 test texts (0.1%) also appear in
  training (ignoring capitalisation).
- **FER's test set has no overlap with training:** it is the official test
  portion of FER2013 and RAF-DB (plus Davao test photos), and copies of test
  images found in the training portions were removed (checked by comparing
  every image pair).
- **LER test data is English** (Reddit and Twitter text); patients may speak
  Tagalog or Bisaya, which XLM-RoBERTa supports but was not trained on for
  emotion. It is therefore kept out of the fusion.
- The confidence shown per answer in Amumata is the model's probability, not
  its accuracy.

## Files

```
fer/  classification_report.txt (with the Davao-only result)  confusion_matrix.csv/.png
      training_history_{head,finetune,deep}.json  training_config.py  dataset_cleaning_report.txt
      previous_61pct/  the previous FER model's files
ser/  classification_report.txt  confusion_matrix.csv/.png  class_distribution.png  training_config.py  training_README.md
ler/  classification_report.txt  confusion_matrix.csv/.png  class_distribution.png  dataset_statistics.txt
      label_mapping_decisions.txt  training_config.py  training_README.md
self-report/  agreement between the AI and patients' own report (see below)
```

## Agreement with patients' self-report

Separate from the test sets above: `npm run eval:self-report` compares what
the AI read in real interviews with what patients said about themselves (the
mood check and the feeling words they tapped). See
`scripts/evaluate-self-report.mjs`; results are written to
`docs/evaluation/self-report/`.
