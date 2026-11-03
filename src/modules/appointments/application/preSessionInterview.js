/**
 * The pre-session interview of an appointment: the patient's most recent
 * interview link created before the appointment and after their previous
 * (non-cancelled) appointment. Derived, so it needs no extra column and also
 * works for interviews sent before this feature existed.
 *
 * The SQL below is joined into the appointment query; withInterview() turns
 * its pi_* columns into one `interview` object (or null).
 */
export const PRE_SESSION_INTERVIEW_JOIN = `
  LEFT JOIN LATERAL (
    SELECT il.interview_link_id AS pi_link_id, il.token AS pi_token, il.status AS pi_status,
           il.created_at AS pi_created_at, s.session_id AS pi_session_id, s.risk_level AS pi_risk_level,
           CASE WHEN jsonb_typeof(s.emotional_spikes) = 'array' THEN jsonb_array_length(s.emotional_spikes) ELSE 0 END
             AS pi_spike_count,
           EXISTS (
             SELECT 1 FROM notifications n
             WHERE n.interview_link_id = il.interview_link_id AND n.type = 'crisis_flag'
           ) AS pi_crisis
    FROM interview_links il
    LEFT JOIN sessions s ON s.interview_link_id = il.interview_link_id
    WHERE il.patient_id = a.patient_id AND il.therapist_id = a.therapist_id
      AND il.created_at < a.start_at
      AND il.created_at > COALESCE(
        (SELECT MAX(prev.start_at) FROM appointments prev
         WHERE prev.patient_id = a.patient_id AND prev.therapist_id = a.therapist_id
           AND prev.status <> 'cancelled' AND prev.start_at < a.start_at),
        '-infinity'::timestamptz)
    ORDER BY il.created_at DESC
    LIMIT 1
  ) pi ON true`;

export const PRE_SESSION_INTERVIEW_COLUMNS =
  "pi.pi_link_id, pi.pi_token, pi.pi_status, pi.pi_created_at, pi.pi_session_id, pi.pi_risk_level, pi.pi_spike_count, pi.pi_crisis";

/** Appointment row with pi_* columns → appointment with an `interview` object (null if none). */
export function withInterview(row) {
  const {
    pi_link_id, pi_token, pi_status, pi_created_at, pi_session_id, pi_risk_level, pi_spike_count, pi_crisis,
    ...appointment
  } = row;
  return {
    ...appointment,
    interview: pi_link_id
      ? {
          interview_link_id: pi_link_id,
          token: pi_token,
          status: pi_status,
          created_at: pi_created_at,
          session_id: pi_session_id ?? null,
          risk_level: pi_risk_level ?? null,
          spike_count: Number(pi_spike_count) || 0,
          crisis: pi_crisis === true,
        }
      : null,
  };
}
