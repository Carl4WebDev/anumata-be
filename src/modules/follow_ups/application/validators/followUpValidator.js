const VALID_STATUSES = ["recommended", "scheduled", "completed", "cancelled", "missed"];
const STATUS_TRANSITIONS = {
  recommended: ["scheduled", "completed", "cancelled"],
  scheduled: ["completed", "cancelled", "missed"],
  completed: [],
  cancelled: [],
  missed: ["scheduled"],
};

export function validateCreateFollowUp({ patient_id, recommended_date, appointment_time, reason, session_id }) {
  const errors = {};

  if (!patient_id) {
    errors.patient_id = "Patient ID is required";
  } else if (isNaN(Number(patient_id))) {
    errors.patient_id = "Invalid patient ID";
  }

  if (!recommended_date) {
    errors.recommended_date = "Recommended date is required";
  } else {
    const date = new Date(recommended_date);
    if (isNaN(date.getTime())) {
      errors.recommended_date = "Invalid date format";
    }
  }

  if (appointment_time !== undefined && appointment_time !== null && appointment_time !== "") {
    const timeMatch = appointment_time.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!timeMatch || parseInt(timeMatch[1]) > 23 || parseInt(timeMatch[2]) > 59 || (timeMatch[3] && parseInt(timeMatch[3]) > 59)) {
      errors.appointment_time = "Invalid time format (expected HH:MM or HH:MM:SS)";
    }
  }

  if (session_id !== undefined && session_id !== null && session_id !== "") {
    if (isNaN(Number(session_id))) {
      errors.session_id = "Invalid session ID";
    }
  }

  if (reason && reason.length > 1000) {
    errors.reason = "Reason must not exceed 1000 characters";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      patient_id: Number(patient_id),
      recommended_date,
      appointment_time: appointment_time || null,
      reason: reason?.trim() || null,
      session_id: session_id ? Number(session_id) : null,
    },
  };
}

export function validateUpdateFollowUp({ status, recommended_date, appointment_time, reason }) {
  const errors = {};
  const data = {};

  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) {
      errors.status = `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`;
    } else {
      data.status = status;
    }
  }

  if (recommended_date !== undefined) {
    const date = new Date(recommended_date);
    if (isNaN(date.getTime())) {
      errors.recommended_date = "Invalid date format";
    } else {
      data.recommended_date = recommended_date;
    }
  }

  if (appointment_time !== undefined) {
    const timeMatch = appointment_time?.match?.(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (appointment_time && (!timeMatch || parseInt(timeMatch[1]) > 23 || parseInt(timeMatch[2]) > 59 || (timeMatch[3] && parseInt(timeMatch[3]) > 59))) {
      errors.appointment_time = "Invalid time format";
    } else {
      data.appointment_time = appointment_time || null;
    }
  }

  if (reason !== undefined) {
    if (reason && reason.length > 1000) {
      errors.reason = "Reason must not exceed 1000 characters";
    } else {
      data.reason = reason?.trim() || null;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, data };
}

export function validateStatusTransition(currentStatus, newStatus) {
  const allowed = STATUS_TRANSITIONS[currentStatus];
  if (!allowed) {
    return { ok: false, error: `Unknown status: ${currentStatus}` };
  }
  if (!allowed.includes(newStatus)) {
    return { ok: false, error: `Cannot transition from ${currentStatus} to ${newStatus}` };
  }
  return { ok: true };
}