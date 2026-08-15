import AppError from "../../../core/errors/AppError.js";
import NotFoundError from "../../../core/errors/NotFoundError.js";
import { validateCreateSession, validateUpdateNotes } from "./validators/sessionValidator.js";

export default class SessionService {
  constructor(sessionRepo, interviewLinkRepo) {
    this.sessionRepo = sessionRepo;
    this.interviewLinkRepo = interviewLinkRepo;
  }

  async create(therapistId, data) {
    const validated = validateCreateSession(data);

    const link = await this.interviewLinkRepo.findById(validated.interview_link_id);
    if (!link) {
      throw new NotFoundError("Interview link not found");
    }

    if (link.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    const session = await this.sessionRepo.create({
      ...validated,
      patient_id: link.patient_id,
      therapist_id: therapistId,
    });

    // Mark interview link as completed
    await this.interviewLinkRepo.updateStatus(validated.interview_link_id, "completed");

    return session;
  }

  async getById(therapistId, sessionId) {
    const session = await this.sessionRepo.findById(sessionId);

    if (!session) {
      throw new NotFoundError("Session not found");
    }

    if (session.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    return session;
  }

  async getByPatientId(therapistId, patientId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    return this.sessionRepo.findByPatientId(patientId, {
      therapistId,
      limit,
      offset,
    });
  }

  async getAll(therapistId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    return this.sessionRepo.findByTherapistId(therapistId, {
      limit,
      offset,
    });
  }

  async updateNotes(therapistId, sessionId, data) {
    const validated = validateUpdateNotes(data);

    const session = await this.sessionRepo.findById(sessionId);

    if (!session) {
      throw new NotFoundError("Session not found");
    }

    if (session.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    return this.sessionRepo.updateNotes(sessionId, validated.notes);
  }

  async remove(therapistId, sessionId) {
    const session = await this.sessionRepo.findById(sessionId);

    if (!session) {
      throw new NotFoundError("Session not found");
    }

    if (session.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    return this.sessionRepo.remove(sessionId);
  }

  async regenerateReport(therapistId, sessionId) {
    const session = await this.sessionRepo.findById(sessionId);

    if (!session) {
      throw new NotFoundError("Session not found");
    }

    if (session.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    // Reconstruct parameters from stored session data
    const transcript = (session.transcript || []).map((t) => ({
      question: typeof t.question === "object" ? t.question?.text : t.question,
      answer: t.answer || "",
      emotion: t.combined_emotion || "Neutral",
      confidence: parseFloat(t.fusion_confidence) || 0,
    }));

    const fusion_results = (session.transcript || []).map((t) => {
      const model_results = {};
      if (t.fer_emotion) {
        model_results.fer = { emotion: t.fer_emotion, confidence: t.fer_confidence || 0, probabilities: t.fer_probabilities || {} };
      }
      if (t.ser_emotion) {
        model_results.ser = { emotion: t.ser_emotion, confidence: t.ser_confidence || 0, probabilities: t.ser_probabilities || {} };
      }
      if (t.ler_emotion) {
        model_results.ler = { emotion: t.ler_emotion, confidence: t.ler_confidence || 0, probabilities: t.ler_probabilities || {} };
      }
      return {
        emotion: t.combined_emotion || "Neutral",
        confidence: parseFloat(t.fusion_confidence) || 0,
        model_results,
      };
    });

    const payload = {
      transcript,
      fusion_results,
      overall_distribution: session.emotion_summary?.distribution || {},
      risk_level: session.risk_level || "Low",
      indicators: session.emotion_summary?.indicators || [],
      spikes: session.emotional_spikes || [],
    };

    // Call Python AI service
    const aiUrl = process.env.AI_SERVICE_URL || "http://localhost:8001";
    const response = await fetch(`${aiUrl}/api/regenerate-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new AppError(`AI service error: ${response.status} — ${text}`, 502, "AI_SERVICE_ERROR");
    }

    const report = await response.json();

    // Update session report in DB
    await this.sessionRepo.updateReport(sessionId, report);

    return report;
  }
}
