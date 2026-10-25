/**
 * Follow-up Appointment Tracker — Unit Tests
 *
 * Tests: validation + status transition rules (pure functions).
 * FollowUpService ownership/create paths need a live DB — not covered here.
 */

import { describe, it, expect } from "vitest";
import {
  validateCreateFollowUp,
  validateUpdateFollowUp,
  validateStatusTransition,
} from "../application/validators/followUpValidator.js";

// ─── Validation Tests ───

describe("validateCreateFollowUp", () => {
  it("accepts valid input", () => {
    const result = validateCreateFollowUp({
      patient_id: 1,
      recommended_date: "2026-11-01",
      appointment_time: "14:30",
      reason: "Follow up on progress",
    });
    expect(result.ok).toBe(true);
    expect(result.data.patient_id).toBe(1);
    expect(result.data.recommended_date).toBe("2026-11-01");
    expect(result.data.appointment_time).toBe("14:30");
    expect(result.data.reason).toBe("Follow up on progress");
  });

  it("requires patient_id", () => {
    const result = validateCreateFollowUp({ recommended_date: "2026-11-01" });
    expect(result.ok).toBe(false);
    expect(result.errors.patient_id).toBeDefined();
  });

  it("requires recommended_date", () => {
    const result = validateCreateFollowUp({});
    expect(result.ok).toBe(false);
    expect(result.errors.recommended_date).toBeDefined();
  });

  it("rejects invalid date", () => {
    const result = validateCreateFollowUp({ recommended_date: "not-a-date" });
    expect(result.ok).toBe(false);
    expect(result.errors.recommended_date).toBeDefined();
  });

  it("rejects invalid time format", () => {
    const result = validateCreateFollowUp({
      recommended_date: "2026-11-01",
      appointment_time: "25:00",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.appointment_time).toBeDefined();
  });

  it("accepts HH:MM:SS time format", () => {
    const result = validateCreateFollowUp({
      patient_id: 1,
      recommended_date: "2026-11-01",
      appointment_time: "14:30:00",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts null/empty optional fields", () => {
    const result = validateCreateFollowUp({
      patient_id: 1,
      recommended_date: "2026-11-01",
      appointment_time: null,
      reason: null,
    });
    expect(result.ok).toBe(true);
    expect(result.data.appointment_time).toBeNull();
    expect(result.data.reason).toBeNull();
    expect(result.data.session_id).toBeNull();
  });

  it("rejects reason over 1000 chars", () => {
    const result = validateCreateFollowUp({
      recommended_date: "2026-11-01",
      reason: "x".repeat(1001),
    });
    expect(result.ok).toBe(false);
    expect(result.errors.reason).toBeDefined();
  });

  it("trims reason whitespace", () => {
    const result = validateCreateFollowUp({
      patient_id: 1,
      recommended_date: "2026-11-01",
      reason: "  follow up  ",
    });
    expect(result.ok).toBe(true);
    expect(result.data.reason).toBe("follow up");
  });

  it("rejects non-numeric session_id", () => {
    const result = validateCreateFollowUp({
      patient_id: 1,
      recommended_date: "2026-11-01",
      session_id: "abc",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.session_id).toBeDefined();
  });

  it("coerces numeric session_id string to number", () => {
    const result = validateCreateFollowUp({
      patient_id: "1",
      recommended_date: "2026-11-01",
      session_id: "5",
    });
    expect(result.ok).toBe(true);
    expect(result.data.patient_id).toBe(1);
    expect(result.data.session_id).toBe(5);
  });
});

// ─── Status Transition Tests ───

describe("validateStatusTransition", () => {
  it("allows recommended → scheduled", () => {
    expect(validateStatusTransition("recommended", "scheduled").ok).toBe(true);
  });

  it("allows recommended → completed", () => {
    expect(validateStatusTransition("recommended", "completed").ok).toBe(true);
  });

  it("allows recommended → cancelled", () => {
    expect(validateStatusTransition("recommended", "cancelled").ok).toBe(true);
  });

  it("allows scheduled → completed", () => {
    expect(validateStatusTransition("scheduled", "completed").ok).toBe(true);
  });

  it("allows scheduled → cancelled", () => {
    expect(validateStatusTransition("scheduled", "cancelled").ok).toBe(true);
  });

  it("allows scheduled → missed", () => {
    expect(validateStatusTransition("scheduled", "missed").ok).toBe(true);
  });

  it("allows missed → scheduled (reschedule)", () => {
    expect(validateStatusTransition("missed", "scheduled").ok).toBe(true);
  });

  it("blocks completed → anything", () => {
    expect(validateStatusTransition("completed", "scheduled").ok).toBe(false);
    expect(validateStatusTransition("completed", "recommended").ok).toBe(false);
  });

  it("blocks cancelled → anything", () => {
    expect(validateStatusTransition("cancelled", "scheduled").ok).toBe(false);
  });

  it("blocks recommended → missed directly", () => {
    expect(validateStatusTransition("recommended", "missed").ok).toBe(false);
  });

  it("blocks same-status transition", () => {
    expect(validateStatusTransition("recommended", "recommended").ok).toBe(false);
  });
});

// ─── Update Validation Tests ───

describe("validateUpdateFollowUp", () => {
  it("accepts valid status update", () => {
    const result = validateUpdateFollowUp({ status: "scheduled" });
    expect(result.ok).toBe(true);
    expect(result.data.status).toBe("scheduled");
  });

  it("rejects invalid status", () => {
    const result = validateUpdateFollowUp({ status: "bogus" });
    expect(result.ok).toBe(false);
    expect(result.errors.status).toBeDefined();
  });

  it("accepts date reschedule", () => {
    const result = validateUpdateFollowUp({ recommended_date: "2026-12-01" });
    expect(result.ok).toBe(true);
    expect(result.data.recommended_date).toBe("2026-12-01");
  });

  it("accepts partial updates", () => {
    const result = validateUpdateFollowUp({ reason: "Updated reason" });
    expect(result.ok).toBe(true);
    expect(result.data.reason).toBe("Updated reason");
  });

  it("returns empty data for no fields", () => {
    const result = validateUpdateFollowUp({});
    expect(result.ok).toBe(true);
    expect(Object.keys(result.data)).toHaveLength(0);
  });
});

// ─── Overdue Status Logic Tests ───

describe("overdue status calculation", () => {
  // The overdue logic lives in the SQL query (countByStatus) and the frontend.
  // Here we test the frontend logic pattern:
  // - recommended/scheduled + date < today → overdue
  // - completed/cancelled → never overdue

  function isOverdue(status, recommendedDate, today) {
    if (status !== "recommended" && status !== "scheduled") return false;
    return new Date(recommendedDate) < new Date(today);
  }

  it("marks recommended past-date as overdue", () => {
    expect(isOverdue("recommended", "2026-10-01", "2026-10-20")).toBe(true);
  });

  it("marks scheduled past-date as overdue", () => {
    expect(isOverdue("scheduled", "2026-10-01", "2026-10-20")).toBe(true);
  });

  it("does not mark future-date as overdue", () => {
    expect(isOverdue("recommended", "2026-11-01", "2026-10-20")).toBe(false);
  });

  it("does not mark today as overdue", () => {
    expect(isOverdue("scheduled", "2026-10-20", "2026-10-20")).toBe(false);
  });

  it("does not mark completed as overdue", () => {
    expect(isOverdue("completed", "2026-10-01", "2026-10-20")).toBe(false);
  });

  it("does not mark cancelled as overdue", () => {
    expect(isOverdue("cancelled", "2026-10-01", "2026-10-20")).toBe(false);
  });

  it("does not mark missed as overdue", () => {
    expect(isOverdue("missed", "2026-10-01", "2026-10-20")).toBe(false);
  });
});