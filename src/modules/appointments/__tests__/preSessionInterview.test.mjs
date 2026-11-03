import { describe, test, expect } from "vitest";
import { withInterview } from "../application/preSessionInterview.js";

const appointmentRow = {
  appointment_id: 4,
  patient_id: 9,
  patient_name: "MARIA SANTOS",
  status: "scheduled",
  start_at: "2026-11-05T02:00:00.000Z",
};

describe("withInterview — the pre-session interview on an appointment", () => {
  test("no interview sent: interview is null and no stray columns remain", () => {
    const row = { ...appointmentRow, pi_link_id: null, pi_token: null, pi_status: null, pi_created_at: null, pi_session_id: null, pi_risk_level: null, pi_spike_count: null, pi_crisis: null };
    const appt = withInterview(row);
    expect(appt.interview).toBeNull();
    expect(Object.keys(appt).some((k) => k.startsWith("pi_"))).toBe(false);
    expect(appt.patient_name).toBe("MARIA SANTOS");
  });

  test("sent but not done yet", () => {
    const appt = withInterview({
      ...appointmentRow,
      pi_link_id: 12, pi_token: "abc", pi_status: "pending", pi_created_at: "2026-11-01T01:00:00.000Z",
      pi_session_id: null, pi_risk_level: null, pi_spike_count: null, pi_crisis: false,
    });
    expect(appt.interview).toEqual({
      interview_link_id: 12,
      token: "abc",
      status: "pending",
      created_at: "2026-11-01T01:00:00.000Z",
      session_id: null,
      risk_level: null,
      spike_count: 0,
      crisis: false,
    });
  });

  test("done: results summary for the therapist", () => {
    const appt = withInterview({
      ...appointmentRow,
      pi_link_id: 12, pi_token: "abc", pi_status: "completed", pi_created_at: "2026-11-01T01:00:00.000Z",
      pi_session_id: 31, pi_risk_level: "Moderate", pi_spike_count: 2, pi_crisis: true,
    });
    expect(appt.interview).toMatchObject({ status: "completed", session_id: 31, risk_level: "Moderate", spike_count: 2, crisis: true });
  });
});
