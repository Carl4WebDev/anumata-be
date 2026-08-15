/**
 * EMOTION ANALYSIS SERVICE
 *
 * Purpose:
 * Orchestrates the complete AI analysis pipeline. This is the bridge between
 * the Node.js backend and the Python AI service (port 8001).
 *
 * Data flow:
 * Frontend (multipart files) → Controller → THIS SERVICE → Python AI → PostgreSQL
 *
 * Key responsibilities:
 * 1. Receives uploaded files (frames + audio) from the patient interview
 * 2. Forwards them to the Python AI service for ML processing
 * 3. Transforms the Python response into database-ready transcript records
 * 4. Generates emotional event reports
 * 5. Persists everything to the sessions table
 *
 * External calls:
 * - Python AI service: POST http://localhost:8001/api/analyze
 * - PostgreSQL: sessions table, interview_links table
 *
 * Related:
 * - Python side: src/ai/ai_service.py (the pipeline orchestrator)
 * - Frontend side: emotionApi.analyze() → this service
 * - Database: sessions table (transcript, emotion_summary, report, etc.)
 */
import AppError from "../../../core/errors/AppError.js";
import NotFoundError from "../../../core/errors/NotFoundError.js";
import { generateEmotionalEventReport } from "./EmotionEventReportGenerator.js";

// Local Python AI service (FastAPI on port 8001)
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8001";

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

    // Build FormData for AI service
    const formData = new FormData();
    for (const file of files) {
      const blob = new Blob([file.buffer], { type: file.mimetype || "application/octet-stream" });
      formData.append("files", blob, file.originalname);
    }

    // Send question texts so AI service can include them in analysis
    const questions = link.questions || [];
    const questionTexts = questions.map((q) => (typeof q === "object" ? q?.text : q) || "");
    formData.append("questions", JSON.stringify(questionTexts));

    // Call AI service /api/analyze
    let mlResult;
    try {
      const response = await fetch(`${AI_SERVICE_URL}/api/analyze`, {
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
          ler: { emotion: t.ler_emotion, confidence: t.ler_confidence || 0, probabilities: t.ler_probabilities || {}, language_detected: t.language_detected || null },
          combined_emotion: t.combined_emotion,
          confidence: t.fusion_confidence || 0,
          agreement: t.fusion_agreement || 0,
          facial_details: t.facial_details || null,
          audio_details: t.audio_details || null,
          text_analysis: t.text_analysis || null,
          frame_image: t.frame_image || null,
        })),
        emotional_events: existingSession.emotional_events || [],
        session_highlights: existingSession.session_highlights || null,
        report: existingSession.report || null,
      };
    }

    // Build a map of question_index → array of base64 frame images
    // Supports: frame_N.jpg (single) and frame_N_M.jpg (multi-frame)
    const frameMap = {};
    for (const file of files) {
      if (file.originalname.startsWith("frame_")) {
        try {
          const nameWithoutExt = file.originalname.replace(/\.[^.]+$/, "");
          const parts = nameWithoutExt.replace("frame_", "").split("_");
          const qIdx = parseInt(parts[0]);
          if (!frameMap[qIdx]) frameMap[qIdx] = [];
          frameMap[qIdx].push(`data:${file.mimetype};base64,${file.buffer.toString("base64")}`);
        } catch {
          // Skip malformed filenames
        }
      }
    }

    // Build transcript from per-question results (including STT transcript text)
    const transcript = (mlResult.per_question || []).map((q, i) => {
      const questionFrames = frameMap[i] || [];
      const bestIdx = q.best_frame_index || 0;

      // Build evidence_frames array (all frames with their FER results)
      const evidenceFrames = questionFrames.map((frameBase64, fIdx) => {
        const ferForFrame = (q.all_fer_results || []).find((r) => r.frame_index === fIdx);
        return {
          frame_image: frameBase64,
          fer_emotion: ferForFrame?.emotion || null,
          fer_confidence: ferForFrame?.confidence || 0,
        };
      });

      return {
        question: (typeof questions[i] === "object" ? questions[i]?.text : questions[i]) || `Question ${i + 1}`,
        answer: q.transcript_text || "[Audio response recorded]",
        fer_emotion: q.fer?.emotion || null,
        fer_confidence: q.fer?.confidence || 0,
        fer_probabilities: q.fer?.probabilities || {},
        ser_emotion: q.ser?.emotion || null,
        ser_confidence: q.ser?.confidence || 0,
        ser_probabilities: q.ser?.probabilities || {},
        ler_emotion: q.ler?.emotion || null,
        ler_confidence: q.ler?.confidence || 0,
        ler_probabilities: q.ler?.probabilities || {},
        language_detected: q.ler?.language_detected || null,
        combined_emotion: q.combined_emotion,
        // ============================================================
        // FIX NEEDED: Add fusion_confidence to transcript entry
        // ============================================================
        // PROBLEM: `q.confidence` is the actual fusion confidence from
        // the Python AI service (e.g., 0.485 for Happy), but it's NOT
        // stored in the transcript. The frontend then falls back to
        // computing max(fer, ser, ler) confidence which is wrong.
        //
        // ADD THIS LINE:
        //   fusion_confidence: q.confidence || 0,
        //
        // Then in SessionsProvider.tsx, change emotionPct to:
        //   emotionPct: Math.round((t.fusion_confidence ?? Math.max(...)) * 100),
        // ============================================================
        fusion_confidence: q.confidence || 0,
        fusion_agreement: q.agreement || 0,
        facial_details: q.fer?.facial_details || null,
        audio_details: q.ser?.audio_details || null,
        text_analysis: q.text_analysis || null,
        frame_image: questionFrames[bestIdx] || questionFrames[0] || null,
        evidence_frames: evidenceFrames.length > 0 ? evidenceFrames : null,
      };
    });

    // Build emotion_summary (distribution)
    const emotionSummary = {
      distribution: mlResult.overall_distribution || {},
      indicators: mlResult.indicators || [],
    };

    // Build emotional_spikes
    const emotionalSpikes = mlResult.spikes || [];

    // Generate emotional event report
    const emotionalEventReport = generateEmotionalEventReport(mlResult, questionTexts, 0);

    // Log report status
    const reportData = mlResult.report || null;
    console.log("[REPORT] Received from AI service:", reportData ? "present" : "null");
    if (reportData) {
      console.log("[REPORT] Report fields:", Object.keys(reportData).join(", "));
      console.log("[REPORT] session_summary length:", (reportData.session_summary || "").length);
    }

    // ============================================================
    // REPORT PERSISTENCE: mlResult.report should always be non-null
    // because the Python fallback_report() always returns a dict.
    //
    // If the frontend shows "AI Session Summary is not available",
    // check these:
    // 1. Is Ollama running? (fallback report is generated when it's not)
    // 2. Did the migration 20260801120000_add_report_column run?
    //    (The `report` column must exist in the `sessions` table)
    // 3. Is the report being JSON.stringified correctly?
    //
    // Add logging here to verify:
    //   console.log("[REPORT] From AI service:", mlResult.report ? "present" : "NULL");
    //   console.log("[REPORT] Report keys:", mlResult.report ? Object.keys(mlResult.report) : "N/A");
    // ============================================================

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
      report: mlResult.report || null,
    });

    console.log("[REPORT] Session created (ID: %d), report in DB:", session.session_id, session.report ? "present" : "null");

    // Mark interview link as completed
    await this.interviewLinkRepo.updateStatus(link.interview_link_id, "completed");

    // Fire-and-forget: regenerate longitudinal AI summary for this patient
    // Does NOT block the analysis response. Failure is logged but not propagated.
    this._triggerLongitudinalReport(link.patient_id, link.therapist_id).catch((err) => {
      console.error("[LONGITUDINAL] Failed to generate after session completion:", err.message);
    });

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
      report: session.report || null,
      created_at: session.created_at,
    };
  }

  /**
   * Fire-and-forget: call Python AI service to generate longitudinal report.
   * Aggregates all completed sessions for the patient and sends to Llama.
   * Failures are logged but never propagated to the caller.
   */
  async _triggerLongitudinalReport(patientId, therapistId) {
    const sessions = await this.sessionRepo.findCompletedWithReportsByPatientId(patientId, therapistId);
    if (!sessions || sessions.length === 0) return;

    // Build structured payload (same as PatientService.generateLongitudinalReport)
    // Includes modality availability, emotional events, session highlights, and transcript
    // summary so the deterministic analysis engine can compute rich findings.
    const sessionsPayload = sessions.map((s) => {
      const transcript = s.transcript || [];
      const modalityAvailability = {
        fer: transcript.some((t) => t.fer_emotion != null),
        ser: transcript.some((t) => t.ser_emotion != null),
        ler: transcript.some((t) => t.ler_emotion != null),
      };

      const transcriptSummary = transcript.map((t) => ({
        question: t.question || "",
        answer: t.answer || "",
        emotion: t.combined_emotion || t.fer_emotion || null,
        confidence: t.fusion_confidence || 0,
      }));

      return {
        date: s.created_at,
        template_name: s.template_name || "N/A",
        risk_level: s.risk_level || "Low",
        distribution: s.emotion_summary?.distribution || {},
        indicators: s.emotion_summary?.indicators || [],
        spikes: s.emotional_spikes || [],
        emotional_events: s.emotional_events || [],
        session_highlights: s.session_highlights || null,
        session_summary: s.report?.session_summary || null,
        key_emotional_findings: s.report?.key_emotional_findings || [],
        areas_for_attention: s.report?.areas_for_attention || [],
        evidence_quality: s.report?.evidence_quality || null,
        limitations: s.report?.limitations || [],
        modality_availability: modalityAvailability,
        transcript_summary: transcriptSummary,
      };
    });

    const aiUrl = process.env.AI_SERVICE_URL || "http://localhost:8001";
    const response = await fetch(`${aiUrl}/api/longitudinal-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions: sessionsPayload }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI service returned ${response.status}: ${text}`);
    }

    const report = await response.json();
    report.generated_at = new Date().toISOString();

    // Persist to patients.longitudinal_report via PatientRepo
    const PatientRepo = (await import("../../patients/infrastructure/PatientRepo.js")).default;
    const patientRepo = new PatientRepo();
    await patientRepo.updateLongitudinalReport(patientId, report);

    console.log("[LONGITUDINAL] Report generated and saved for patient %d", patientId);
  }
}
