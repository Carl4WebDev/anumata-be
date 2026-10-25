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
    # Supports: frame_N.jpg (single frame, backward compat) and frame_N_M.jpg (multi-frame)
    frames = {}   # question_idx -> list of frame bytes
    audios = {}
    audio_filenames = {}

    for f in files:
        name = f.filename
        content = await f.read()

        # Match frame_N_M.jpg (multi-frame) or frame_N.jpg (single-frame)
        frame_match = re.match(r"frame_(\d+)(?:_(\d+))?\.", name)
        audio_match = re.match(r"audio_(\d+)\.", name)

        if frame_match:
            q_idx = int(frame_match.group(1))
            if q_idx not in frames:
                frames[q_idx] = []
            frames[q_idx].append(content)
        elif audio_match:
            idx = int(audio_match.group(1))
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
# Standalone STT — lightweight transcription for rapport phase
# =============================================================================

@app.post("/api/stt/transcribe")
async def stt_transcribe(file: UploadFile = File(...)):
    """Transcribe audio without running FER/SER/LER/fusion. Used for rapport voice input."""
    try:
        content = await file.read()
        from stt.stt_service import transcribe_audio
        result = transcribe_audio(content, file.filename)
        return result
    except Exception as e:
        logger.error("STT transcription failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


# =============================================================================
# Question Translation — interview questions spoken in the patient's language
# =============================================================================

class TranslateRequest(BaseModel):
    text: str
    target: str  # "tl" (Tagalog) or "ceb" (Cebuano/Bisaya)


@app.post("/api/ai/translate")
async def ai_translate(req: TranslateRequest) -> dict:
    """Translate an interview question. Never fails the interview: ok=false on
    any error and the caller falls back to the English original."""
    if req.target not in ("tl", "ceb"):
        raise HTTPException(status_code=400, detail="target must be 'tl' or 'ceb'")
    from translation.translator import translate_text
    translated = translate_text(req.text, req.target)
    return {"translated": translated or "", "ok": translated is not None}


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
# Report Regeneration
# =============================================================================

class RegenerateReportRequest(BaseModel):
    transcript: list[dict]
    fusion_results: list[dict]
    overall_distribution: dict
    risk_level: str
    indicators: list[str]
    spikes: list[dict]


@app.post("/api/regenerate-report")
async def regenerate_report(req: RegenerateReportRequest):
    """Regenerate AI session report from existing analysis data."""
    try:
        from report.report_generator import generate_report
        report = generate_report(
            transcript=req.transcript,
            fusion_results=req.fusion_results,
            overall_distribution=req.overall_distribution,
            risk_level=req.risk_level,
            indicators=req.indicators,
            spikes=req.spikes,
        )
        return report
    except Exception as e:
        logger.error("Report regeneration failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Report regeneration failed: {str(e)}")


# =============================================================================
# Longitudinal Report — Cross-session AI summary
# =============================================================================

class LongitudinalReportRequest(BaseModel):
    sessions: list[dict]


@app.post("/api/longitudinal-report")
async def longitudinal_report(req: LongitudinalReportRequest):
    """Generate a longitudinal AI summary across multiple completed sessions."""
    try:
        from report.report_generator import generate_longitudinal_report
        report = generate_longitudinal_report(sessions_data=req.sessions)
        return report
    except Exception as e:
        logger.error("Longitudinal report generation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Longitudinal report failed: {str(e)}")


# =============================================================================
# Question Set AI Assistant — draft generation, review, refinement
# =============================================================================

class GenerateQuestionsRequest(BaseModel):
    title: str
    focus: str
    description: str = ""
    num_questions: int = 5
    language: str = "English"
    additional_instructions: str = ""


class ReviewQuestionsRequest(BaseModel):
    questions: list[dict]
    focus: str = ""


class RefineQuestionRequest(BaseModel):
    question_text: str


@app.post("/api/question-sets/ai/generate")
async def ai_generate_questions(req: GenerateQuestionsRequest):
    """
    Generate draft questions for a question set.

    Flow: Frontend → Node.js API → THIS endpoint → Ollama → JSON → Frontend draft
    The returned questions are DRAFTS — therapist must review and approve.
    """
    try:
        from question_set.question_set_ai import generate_questions
        result = generate_questions(
            title=req.title,
            focus=req.focus,
            description=req.description,
            num_questions=req.num_questions,
            language=req.language,
            additional_instructions=req.additional_instructions,
        )
        if result is None:
            raise HTTPException(
                status_code=503,
                detail="AI question generation is currently unavailable. You may create the question set manually.",
            )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Question generation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Question generation failed: {str(e)}")


@app.post("/api/question-sets/ai/review")
async def ai_review_questions(req: ReviewQuestionsRequest):
    """
    Review draft questions for quality issues.

    Flow: Frontend → Node.js API → THIS endpoint → Ollama → issues JSON → Frontend
    Returns quality issues and suggested revisions.
    """
    try:
        from question_set.question_set_ai import review_questions
        result = review_questions(
            questions=req.questions,
            focus=req.focus,
        )
        if result is None:
            raise HTTPException(
                status_code=503,
                detail="AI question review is currently unavailable. Please review the questions manually.",
            )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Question review failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Question review failed: {str(e)}")


@app.post("/api/question-sets/ai/refine")
async def ai_refine_question(req: RefineQuestionRequest):
    """
    Refine/improve a single question.

    Flow: Frontend → Node.js API → THIS endpoint → Ollama → refinement JSON → Frontend
    Returns original + revised question with explanation.
    """
    try:
        from question_set.question_set_ai import refine_question
        result = refine_question(question_text=req.question_text)
        if result is None:
            raise HTTPException(
                status_code=503,
                detail="AI question refinement is currently unavailable. Please edit the question manually.",
            )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Question refinement failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Question refinement failed: {str(e)}")


# =============================================================================
# Entry point
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=AI_SERVICE_HOST, port=AI_SERVICE_PORT)
