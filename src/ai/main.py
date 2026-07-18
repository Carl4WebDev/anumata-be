"""
Anumata AI Service — FastAPI application.

Runs on port 8001. Provides emotion recognition endpoints
for the Express backend to call.
Models are preloaded once at startup.
"""

import logging
import re
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Add AI root to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from config import AI_SERVICE_HOST, AI_SERVICE_PORT

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Preload all models at startup."""
    logger.info("=== Anumata AI Service Starting ===")
    logger.info("Preloading models...")

    try:
        from fer.fer_service import _get_model as load_fer
        load_fer()
        logger.info("FER model ready")
    except Exception as e:
        logger.error("FER model failed: %s", e)

    try:
        from ser.ser_service import _get_model as load_ser
        load_ser()
        logger.info("SER model ready")
    except Exception as e:
        logger.error("SER model failed: %s", e)

    try:
        from ler.ler_service import _get_model as load_ler
        load_ler()
        logger.info("LER model ready")
    except Exception as e:
        logger.error("LER model failed: %s", e)

    try:
        from stt.stt_service import _get_model as load_stt
        load_stt()
        logger.info("STT model ready")
    except Exception as e:
        logger.error("STT model failed: %s", e)

    logger.info("=== All models loaded. Service ready on port %d ===", AI_SERVICE_PORT)
    yield
    logger.info("=== Shutting down ===")


app = FastAPI(title="Anumata AI Service", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Health
# =============================================================================

@app.get("/health")
async def health():
    """Health check with model status."""
    status = {"fer": False, "ser": False, "ler": False, "stt": False}

    try:
        from fer.fer_service import _model
        status["fer"] = _model is not None
    except Exception as e:
        logger.warning("Health check: FER model not loaded: %s", e)

    try:
        from ser.ser_service import _model
        status["ser"] = _model is not None
    except Exception as e:
        logger.warning("Health check: SER model not loaded: %s", e)

    try:
        from ler.ler_service import _model
        status["ler"] = _model is not None
    except Exception as e:
        logger.warning("Health check: LER model not loaded: %s", e)

    try:
        from stt.stt_service import _model
        status["stt"] = _model is not None
    except Exception as e:
        logger.warning("Health check: STT model not loaded: %s", e)

    return {
        "status": "ok" if all(status.values()) else "degraded",
        "models_loaded": status,
    }


# =============================================================================
# Full Interview Analysis
# =============================================================================

@app.post("/api/analyze")
async def analyze(files: list[UploadFile] = File(...), questions: str = Form("[]")):
    """
    Full interview analysis.

    Accepts multipart files: frame_N.jpg (images) + audio_N.webm (audio).
    Accepts optional 'questions' form field with JSON array of question texts.
    Returns per-question analysis with fusion, spikes, and report.
    """
    import json

    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    # Parse question texts from form field
    try:
        question_texts = json.loads(questions) if questions and questions != "[]" else []
    except (json.JSONDecodeError, TypeError):
        question_texts = []

    # Parse files by type and question index
    frames = {}
    audios = {}
    audio_filenames = {}

    for f in files:
        name = f.filename
        content = await f.read()

        match = re.match(r"(frame|audio)_(\d+)\.", name)
        if not match:
            continue

        file_type, idx = match.group(1), int(match.group(2))
        if file_type == "frame":
            frames[idx] = content
        elif file_type == "audio":
            audios[idx] = content
            audio_filenames[idx] = name

    if not frames and not audios:
        raise HTTPException(status_code=400, detail="No valid files found")

    # Use actual question texts if provided, otherwise generate defaults
    all_indices = sorted(set(list(frames.keys()) + list(audios.keys())))
    num_questions = max(all_indices) + 1
    if question_texts and len(question_texts) >= num_questions:
        final_questions = question_texts[:num_questions]
    else:
        final_questions = question_texts + [f"Question {i + 1}" for i in range(len(question_texts), num_questions)]

    try:
        from ai_service import analyze_interview
        result = analyze_interview(final_questions, frames, audios, audio_filenames)
        return result
    except Exception as e:
        logger.error("Analysis failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


# =============================================================================
# Individual Model Endpoints
# =============================================================================

class TextRequest(BaseModel):
    text: str


@app.post("/api/fer/predict")
async def fer_predict_endpoint(file: UploadFile = File(...)):
    """Single image FER prediction."""
    try:
        content = await file.read()
        from fer.fer_service import predict_emotion
        return predict_emotion(content)
    except Exception as e:
        logger.error("FER prediction failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"FER prediction failed: {str(e)}")


@app.post("/api/ser/predict")
async def ser_predict_endpoint(file: UploadFile = File(...)):
    """Single audio SER prediction."""
    try:
        content = await file.read()
        from ser.ser_service import predict_emotion
        return predict_emotion(content, file.filename)
    except Exception as e:
        logger.error("SER prediction failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"SER prediction failed: {str(e)}")


@app.post("/api/ler/predict")
async def ler_predict_endpoint(req: TextRequest):
    """Single text LER prediction."""
    try:
        from ler.ler_service import predict_emotion
        return predict_emotion(req.text)
    except Exception as e:
        logger.error("LER prediction failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"LER prediction failed: {str(e)}")


# =============================================================================
# Entry point
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=AI_SERVICE_HOST, port=AI_SERVICE_PORT)
