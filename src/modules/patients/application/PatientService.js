import AppError from "../../../core/errors/AppError.js";
import NotFoundError from "../../../core/errors/NotFoundError.js";
import { validateCreatePatient, validateUpdatePatient } from "./validators/patientValidator.js";
import SessionRepo from "../../sessions/infrastructure/SessionRepo.js";

const sessionRepo = new SessionRepo();

export default class PatientService {
  constructor(patientRepository) {
    this.patientRepository = patientRepository;
  }

  async create(therapistId, data) {
    const validated = validateCreatePatient(data);

    const duplicate = await this.patientRepository.findDuplicate(
      therapistId,
      validated.full_name,
      validated.age,
      validated.gender,
    );

    if (duplicate) {
      throw new AppError("This patient already exists.", 409, "DUPLICATE_PATIENT");
    }

    return this.patientRepository.create({
      ...validated,
      therapist_id: therapistId,
    });
  }

  async getById(therapistId, patientId) {
    const patient = await this.patientRepository.findById(patientId);

    if (!patient) {
      throw new NotFoundError("Patient not found");
    }

    if (patient.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    return patient;
  }

  async getAll(therapistId, { search, page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    return this.patientRepository.findByTherapistId(therapistId, {
      search,
      limit,
      offset,
    });
  }

  async update(therapistId, patientId, data) {
    const validated = validateUpdatePatient(data);

    if (Object.keys(validated).length === 0) {
      throw new AppError("No fields to update", 400, "NO_FIELDS");
    }

    const patient = await this.patientRepository.findById(patientId);

    if (!patient) {
      throw new NotFoundError("Patient not found");
    }

    if (patient.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    return this.patientRepository.update(patientId, validated);
  }

  async remove(therapistId, patientId) {
    const patient = await this.patientRepository.findById(patientId);

    if (!patient) {
      throw new NotFoundError("Patient not found");
    }

    if (patient.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    return this.patientRepository.remove(patientId);
  }

  async count(therapistId) {
    return this.patientRepository.countByTherapistId(therapistId);
  }

  /**
   * Generate a longitudinal AI summary across all completed sessions for a patient.
   *
   * Flow:
   *   1. Verify patient exists and therapist owns it
   *   2. Fetch completed sessions with reports (chronological order)
   *   3. Build structured payload for Python AI service
   *   4. POST to /api/longitudinal-report (Ollama Llama 3.2:3B)
   *   5. Save result to patients.longitudinal_report
   */
  async generateLongitudinalReport(therapistId, patientId) {
    const patient = await this.patientRepository.findById(patientId);
    if (!patient) {
      throw new NotFoundError("Patient not found");
    }
    if (patient.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    // Fetch completed sessions with report data, ordered oldest-first
    const sessions = await sessionRepo.findCompletedWithReportsByPatientId(patientId, therapistId);
    if (!sessions || sessions.length === 0) {
      throw new AppError("No completed sessions found for this patient", 404, "NO_SESSIONS");
    }

    // Build structured payload — only send data Llama needs (no patient name, no raw video/audio)
    // Includes modality availability, emotional events, session highlights, and transcript
    // summary so the deterministic analysis engine can compute rich findings.
    const sessionsPayload = sessions.map((s) => {
      // Determine modality availability from transcript data
      const transcript = s.transcript || [];
      const modalityAvailability = {
        fer: transcript.some((t) => t.fer_emotion != null),
        ser: transcript.some((t) => t.ser_emotion != null),
        ler: transcript.some((t) => t.ler_emotion != null),
      };

      // Build transcript summary for follow-up question generation (no raw video/audio)
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

    // Call Python AI service
    const aiUrl = process.env.AI_SERVICE_URL || "http://localhost:8001";
    const response = await fetch(`${aiUrl}/api/longitudinal-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions: sessionsPayload }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new AppError(`AI service error: ${response.status} — ${text}`, 502, "AI_SERVICE_ERROR");
    }

    const report = await response.json();

    // Add timestamp
    report.generated_at = new Date().toISOString();

    // Persist to patients.longitudinal_report
    await this.patientRepository.updateLongitudinalReport(patientId, report);

    return report;
  }
}
