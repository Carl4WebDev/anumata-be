import { describe, test, expect, vi } from "vitest";
import LiveHub from "../LiveHub.js";
import { MAX_BODY, cleanBody, rateLimiter } from "../liveTalk.js";

function fakeSocket() {
  return { readyState: 1, sent: [], send(m) { this.sent.push(JSON.parse(m)); }, close: vi.fn() };
}
const last = (socket, type) => socket.sent.filter((m) => m.type === type).at(-1);
const flush = () => new Promise((r) => setTimeout(r, 0));

/** A room with a patient and one viewer, and a fake message store. */
function setup({ messages } = {}) {
  const store = messages ?? { save: vi.fn().mockResolvedValue(41), markSeen: vi.fn().mockResolvedValue() };
  const hub = new LiveHub({ messages: store });
  const link = { interview_link_id: 1, therapist_id: 3, patient_name: "Ana" };
  const patient = fakeSocket();
  const viewer = fakeSocket();
  hub.joinPatient(patient, link);
  hub.joinViewer(viewer, link);
  return { hub, store, link, patient, viewer };
}

describe("message rules", () => {
  test("text is trimmed and cleaned; empty, too long or not text is refused", () => {
    expect(cleanBody("  I'm here with you.\n Take your time. ")).toBe("I'm here with you.\n Take your time.");
    expect(cleanBody("hi\u0000\u0007 there")).toBe("hi there");
    expect(cleanBody("   ")).toBeNull();
    expect(cleanBody(42)).toBeNull();
    expect(cleanBody("a".repeat(MAX_BODY))).toHaveLength(MAX_BODY);
    expect(cleanBody("a".repeat(MAX_BODY + 1))).toBeNull();
  });

  test("at most 5 messages per 10 seconds per sender", () => {
    const allow = rateLimiter({ max: 5, perMs: 10_000 });
    const a = {};
    const b = {};
    for (let i = 0; i < 5; i += 1) expect(allow(a, 1000 + i)).toBe(true);
    expect(allow(a, 1010)).toBe(false);
    expect(allow(b, 1010)).toBe(true);
    expect(allow(a, 11_001)).toBe(true);
  });
});

describe("the therapist steps in", () => {
  test("a therapist message reaches the patient and is saved with the current question", async () => {
    const { hub, store, patient, viewer } = setup();
    hub.message(patient, { type: "state", state: { questionIndex: 2 } });
    hub.message(viewer, { type: "talk", body: " I'm here with you. " });

    const toPatient = last(patient, "talk").item;
    expect(toPatient).toMatchObject({ sender: "therapist", kind: "message", body: "I'm here with you.", seenAt: null });
    expect(last(viewer, "talk").item.ref).toBe(toPatient.ref);
    await flush();
    expect(store.save).toHaveBeenCalledWith({ linkId: 1, sender: "therapist", kind: "message", body: "I'm here with you.", questionIndex: 2 });
  });

  test("the patient's screen confirms it was shown: the therapist sees it and it is saved", async () => {
    const { hub, store, patient, viewer } = setup();
    hub.message(viewer, { type: "talk", body: "Take your time." });
    const { ref } = last(patient, "talk").item;

    hub.message(patient, { type: "seen", ref });
    expect(last(viewer, "seen")).toMatchObject({ ref, seenAt: expect.any(String) });
    await flush();
    await flush();
    expect(store.markSeen).toHaveBeenCalledWith(41);

    // Only once, and only for real therapist messages.
    hub.message(patient, { type: "seen", ref });
    hub.message(patient, { type: "seen", ref: "made-up" });
    expect(viewer.sent.filter((m) => m.type === "seen")).toHaveLength(1);
  });

  test("the patient's reply reaches the therapist", () => {
    const { hub, patient, viewer } = setup();
    hub.message(patient, { type: "talk", body: "Salamat po." });
    expect(last(viewer, "talk").item).toMatchObject({ sender: "patient", kind: "message", body: "Salamat po." });
  });

  test("pause and resume reach the patient; repeating the same one does nothing", async () => {
    const { hub, store, patient, viewer } = setup();
    hub.message(viewer, { type: "pause" });
    hub.message(viewer, { type: "pause" });
    expect(patient.sent.filter((m) => m.type === "talk").map((m) => m.item.kind)).toEqual(["pause"]);
    expect(hub.rooms.get(1).paused).toBe(true);

    hub.message(viewer, { type: "resume" });
    expect(last(patient, "talk").item.kind).toBe("resume");
    expect(hub.rooms.get(1).paused).toBe(false);
    await flush();
    expect(store.save).toHaveBeenCalledTimes(2);
  });

  test("the patient can't pause, and can't send as the therapist", () => {
    const { hub, patient } = setup();
    hub.message(patient, { type: "pause" });
    expect(hub.rooms.get(1).paused).toBe(false);
    hub.message(patient, { type: "talk", body: "hi", sender: "therapist" });
    expect(last(patient, "talk").item.sender).toBe("patient");
  });

  test("empty, too long, or too many messages are dropped", () => {
    const { hub, patient, viewer } = setup();
    hub.message(viewer, { type: "talk", body: "" });
    hub.message(viewer, { type: "talk", body: "x".repeat(MAX_BODY + 1) });
    expect(patient.sent.some((m) => m.type === "talk")).toBe(false);
    for (let i = 0; i < 8; i += 1) hub.message(viewer, { type: "talk", body: `m${i}` });
    expect(patient.sent.filter((m) => m.type === "talk")).toHaveLength(5);
  });

  test("a reloaded patient page or a newly opened live view gets the conversation and the pause", () => {
    const { hub, link, viewer } = setup();
    hub.message(viewer, { type: "pause" });
    hub.message(viewer, { type: "talk", body: "I'm here." });

    const reloaded = fakeSocket();
    hub.joinPatient(reloaded, link);
    expect(reloaded.sent[0]).toMatchObject({ type: "welcome", paused: true });
    expect(reloaded.sent[0].talk.map((t) => t.kind)).toEqual(["pause", "message"]);

    const secondTab = fakeSocket();
    hub.joinViewer(secondTab, link);
    expect(secondTab.sent[0]).toMatchObject({ type: "welcome", paused: true, talk: expect.any(Array) });
  });

  test("if the therapist closes the live view while paused, the questions resume", async () => {
    const { hub, store, patient, viewer } = setup();
    hub.message(viewer, { type: "pause" });
    hub.leave(viewer);
    expect(last(patient, "talk").item).toMatchObject({ kind: "resume", auto: true });
    expect(hub.rooms.get(1).paused).toBe(false);
    await flush();
    expect(store.save).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "resume" }));
  });

  test("the patient says they're ready: the therapist is told, and the questions resume after a minute", async () => {
    vi.useFakeTimers();
    try {
      const { hub, store, patient, viewer } = setup();
      hub.message(patient, { type: "ready" }); // not paused: nothing to do
      expect(viewer.sent.some((m) => m.type === "talk")).toBe(false);

      hub.message(viewer, { type: "pause" });
      hub.message(patient, { type: "ready" });
      hub.message(patient, { type: "ready" }); // once until the therapist responds
      const ready = viewer.sent.filter((m) => m.type === "talk" && m.item.ready);
      expect(ready).toHaveLength(1);
      expect(ready[0].item).toMatchObject({ sender: "patient", kind: "message", body: "I'm ready to continue.", resumeAt: expect.any(String) });

      vi.advanceTimersByTime(59_000);
      expect(hub.rooms.get(1).paused).toBe(true);
      vi.advanceTimersByTime(1_000);
      expect(hub.rooms.get(1).paused).toBe(false);
      expect(last(patient, "talk").item).toMatchObject({ sender: "patient", kind: "resume", auto: true });
      await vi.advanceTimersByTimeAsync(0);
      expect(store.save).toHaveBeenLastCalledWith(expect.objectContaining({ sender: "patient", kind: "resume" }));
    } finally {
      vi.useRealTimers();
    }
  });

  test("the therapist replying or resuming in time cancels the automatic resume", () => {
    vi.useFakeTimers();
    try {
      const { hub, patient, viewer } = setup();
      hub.message(viewer, { type: "pause" });
      hub.message(patient, { type: "ready" });
      hub.message(viewer, { type: "talk", body: "One more thing before we go on." });
      vi.advanceTimersByTime(120_000);
      expect(hub.rooms.get(1).paused).toBe(true);

      // Ready again, then the therapist resumes: only one resume.
      hub.message(patient, { type: "ready" });
      hub.message(viewer, { type: "resume" });
      vi.advanceTimersByTime(120_000);
      expect(patient.sent.filter((m) => m.type === "talk" && m.item.kind === "resume")).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("the message still reaches the patient when saving fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { hub, patient, viewer } = setup({ messages: { save: vi.fn().mockRejectedValue(new Error("db down")), markSeen: vi.fn() } });
    hub.message(viewer, { type: "talk", body: "I'm here." });
    expect(last(patient, "talk").item.body).toBe("I'm here.");
    await flush();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
