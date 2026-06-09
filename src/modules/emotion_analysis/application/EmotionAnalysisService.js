import AppError from "../../../core/errors/AppError.js";
import NotFoundError from "../../../core/errors/NotFoundError.js";
import { generateEmotionalEventReport } from "./EmotionEventReportGenerator.js";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

export default class EmotionAnalysisService {
  constructor(interviewLinkRepo, sessionRepo) {
    this.interviewLinkRepo = interviewLinkRepo;
    this.sessionRepo = sessionRepo;
  }

  async analyzeByToken(token, files) {
    // Find interview link by token
    const link = await this.interviewLinkRepo.findByToken(token);
    if (!link) {
      throw new NotFoundError("Interview link not found");
    }

    // Build FormData for anumata-ml
    const formData = new FormData();
    for (const file of files) {
      const blob = new Blob([file.buffer], { type: file.mimetype || "application/octet-stream" });
      formData.append("files", blob, file.originalname);
    }

    // Call anumata-ml /api/analyze
    let mlResult;
    try {
      const response = await fetch(`${ML_SERVICE_URL}/api/analyze`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new AppError(`ML service error: ${errText}`, 502, "ML_SERVICE_ERROR");
      }

      mlResult = await response.json();
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError("ML service unavailable", 503, "ML_SERVICE_UNAVAILABLE");
    }

    // Check if session already exists for this interview link (prevent duplicates)
    const existingSession = await this.sessionRepo.findByInterviewLinkId(link.interview_link_id);
    if (existingSession) {
      return {
        session_id: existingSession.session_id,
        risk_level: existingSession.risk_level,
        distribution: existingSession.emotion_summary?.distribution || {},
        indicators: existingSession.emotion_summary?.indicators || [],
        spikes: existingSession.emotional_spikes || [],
        per_question: (existingSession.transcript || []).map((t, i) => ({
          question_index: i,
          fer: { emotion: t.fer_emotion, confidence: t.fer_confidence || 0, probabilities: t.fer_probabilities || {} },
          ser: { emotion: t.ser_emotion, confidence: t.ser_confidence || 0, probabilities: t.ser_probabilities || {} },
          combined_emotion: t.combined_emotion,
          facial_details: t.facial_details || null,
          audio_details: t.audio_details || null,
          text_analysis: t.text_analysis || null,
          frame_image: t.frame_image || null,
        })),
        emotional_events: existingSession.emotional_events || [],
        session_highlights: existingSession.session_highlights || null,
      };
    }

    // Build a map of question_index → base64 frame image
    const frameMap = {};
    for (const file of files) {
      if (file.originalname.startsWith("frame_")) {
        try {
          const idx = parseInt(file.originalname.replace("frame_", "").split(".")[0]);
          frameMap[idx] = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
        } catch {
          // Skip malformed filenames
        }
      }
    }

    // Build transcript from per-question results (including STT transcript text)
    const questions = link.questions || [];
    const transcript = (mlResult.per_question || []).map((q, i) => ({
      question: (typeof questions[i] === "object" ? questions[i]?.text : questions[i]) || `Question ${i + 1}`,
      answer: q.transcript_text || "[Audio response recorded]",
      fer_emotion: q.fer?.emotion || null,
      fer_confidence: q.fer?.confidence || 0,
      fer_probabilities: q.fer?.probabilities || {},
      ser_emotion: q.ser?.emotion || null,
      ser_confidence: q.ser?.confidence || 0,
      ser_probabilities: q.ser?.probabilities || {},
      combined_emotion: q.combined_emotion,
      facial_details: q.fer?.facial_details || null,
      audio_details: q.ser?.audio_details || null,
      text_analysis: q.text_analysis || null,
      frame_image: frameMap[i] || null,
    }));

    // Build emotion_summary (distribution)
    const emotionSummary = {
      distribution: mlResult.overall_distribution || {},
      indicators: mlResult.indicators || [],
    };

    // Build emotional_spikes
    const emotionalSpikes = mlResult.spikes || [];

    // Generate emotional event report
    const questionTexts = questions.map((q) => (typeof q === "object" ? q?.text : q) || "");
    const emotionalEventReport = generateEmotionalEventReport(mlResult, questionTexts, 0);

    // Create session record
    const session = await this.sessionRepo.create({
      interview_link_id: link.interview_link_id,
      patient_id: link.patient_id,
      therapist_id: link.therapist_id,
      transcript,
      emotion_summary: emotionSummary,
      risk_level: mlResult.risk_level || "Low",
      emotional_spikes: emotionalSpikes,
      emotional_events: emotionalEventReport.emotional_events,
      session_highlights: emotionalEventReport.session_highlights,
    });

    // Mark interview link as completed
    await this.interviewLinkRepo.updateStatus(link.interview_link_id, "completed");

    return {
      session_id: session.session_id,
      risk_level: mlResult.risk_level,
      distribution: mlResult.overall_distribution,
      indicators: mlResult.indicators,
      spikes: emotionalSpikes,
      per_question: mlResult.per_question,
      emotional_events: emotionalEventReport.emotional_events,
      session_highlights: emotionalEventReport.session_highlights,
    };
  }

  async getResultsByToken(token) {
    const link = await this.interviewLinkRepo.findByToken(token);
    if (!link) {
      throw new NotFoundError("Interview link not found");
    }

    const session = await this.sessionRepo.findByInterviewLinkId(link.interview_link_id);
    if (!session) {
      throw new NotFoundError("No analysis results found for this interview");
    }

    return {
      session_id: session.session_id,
      risk_level: session.risk_level,
      distribution: session.emotion_summary?.distribution || {},
      indicators: session.emotion_summary?.indicators || [],
      spikes: session.emotional_spikes || [],
      transcript: session.transcript || [],
      emotional_events: session.emotional_events || [],
      session_highlights: session.session_highlights || null,
      created_at: session.created_at,
    };
  }
}
