import ValidationError from "../../../../core/errors/ValidationError.js";

export function validateCreateSession({ interview_link_id, transcript, emotion_summary, risk_level }) {
  const errors = {};

  if (!interview_link_id) {
    errors.interview_link_id = "Interview link ID is required";
  }

  if (!transcript || !Array.isArray(transcript)) {
    errors.transcript = "Transcript must be an array";
  } else if (transcript.length === 0) {
    errors.transcript = "Transcript cannot be empty";
  } else {
    const entryErrors = [];
    transcript.forEach((entry, i) => {
      if (!entry || typeof entry !== "object") {
        entryErrors.push(`Entry ${i + 1}: must be an object`);
      } else {
        if (!entry.question) entryErrors.push(`Entry ${i + 1}: question is required`);
      }
    });
    if (entryErrors.length > 0) {
      errors.transcript = entryErrors;
    }
  }

  if (!emotion_summary || typeof emotion_summary !== "object") {
    errors.emotion_summary = "Emotion summary is required";
  } else {
    const { happy, sad, angry, neutral } = emotion_summary;
    if (happy === undefined && sad === undefined && angry === undefined && neutral === undefined) {
      errors.emotion_summary = "At least one emotion percentage is required";
    }
  }

  if (!risk_level) {
    errors.risk_level = "Risk level is required";
  } else if (!["low", "moderate", "high"].includes(risk_level)) {
    errors.risk_level = "Risk level must be low, moderate, or high";
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError("Validation failed", errors);
  }

  return {
    interview_link_id,
    transcript,
    emotion_summary: {
      happy: Number(emotion_summary.happy || 0),
      sad: Number(emotion_summary.sad || 0),
      angry: Number(emotion_summary.angry || 0),
      neutral: Number(emotion_summary.neutral || 0),
    },
    risk_level,
    emotional_spikes: emotion_summary.spikes || [],
  };
}

export function validateUpdateNotes({ notes }) {
  if (!notes?.trim()) {
    throw new ValidationError("Validation failed", { notes: "Notes cannot be empty" });
  }

  return { notes: notes.trim() };
}
