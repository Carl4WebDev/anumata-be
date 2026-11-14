import { describe, test, expect, vi, beforeAll, afterAll } from "vitest";
import http from "node:http";
import jwt from "jsonwebtoken";
import WebSocket from "ws";
import LiveHub from "../LiveHub.js";

// ── Fake data for the real-socket test ─────────────────────────────────────
const LINK = { interview_link_id: 7, therapist_id: 3, patient_id: 9, patient_name: "MARIA SANTOS ", status: "pending", token: "tok-7" };
vi.mock("../../interview_links/infrastructure/InterviewLinkRepo.js", () => ({
  default: class {
    async findByToken(t) {
      return t === LINK.token ? LINK : t === "done" ? { ...LINK, status: "completed" } : null;
    }
    async findById(id) {
      return id === LINK.interview_link_id ? LINK : null;
    }
  },
}));
vi.mock("../../../core/database/db.js", () => ({
  default: {
    query: vi.fn(async (_sql, [userId]) => ({
      rows: userId === 3 ? [{ role: "THERAPIST", is_active: true }] : userId === 4 ? [{ role: "THERAPIST", is_active: true }] : [],
    })),
  },
}));
const notify = vi.hoisted(() => vi.fn().mockResolvedValue(null));
vi.mock("../../notifications/notificationServiceInstance.js", () => ({ notificationService: { notifyInterview: notify } }));

function fakeSocket() {
  return { readyState: 1, sent: [], send(m) { this.sent.push(JSON.parse(m)); }, close: vi.fn() };
}

describe("LiveHub (room logic)", () => {
  const link = { interview_link_id: 1, therapist_id: 3, patient_name: "Ana" };

  test("a viewer who joins first is introduced to the patient when the patient arrives", () => {
    const onPatientLive = vi.fn();
    const hub = new LiveHub({ iceServers: [{ urls: ["stun:x"] }], onPatientLive });
    const viewer = fakeSocket();
    hub.joinViewer(viewer, link);
    expect(viewer.sent[0]).toMatchObject({ type: "welcome", patientOnline: false, iceServers: [{ urls: ["stun:x"] }] });

    const patient = fakeSocket();
    hub.joinPatient(patient, link);
    const viewerId = viewer.sent[0].viewerId;
    expect(patient.sent).toContainEqual({ type: "viewer-joined", viewerId });
    expect(viewer.sent.at(-1)).toMatchObject({ type: "patient-online" });
    expect(onPatientLive).toHaveBeenCalledWith(link);
  });

  test("signals are relayed between patient and the right viewer; only the patient reports progress", () => {
    const hub = new LiveHub();
    const patient = fakeSocket();
    const a = fakeSocket();
    const b = fakeSocket();
    hub.joinPatient(patient, link);
    hub.joinViewer(a, link);
    hub.joinViewer(b, link);
    const aId = a.sent[0].viewerId;

    hub.message(patient, { type: "signal", to: aId, data: { sdp: "offer" } });
    expect(a.sent.at(-1)).toEqual({ type: "signal", from: "patient", data: { sdp: "offer" } });
    expect(b.sent.some((m) => m.type === "signal")).toBe(false);

    hub.message(a, { type: "signal", data: { sdp: "answer" } });
    expect(patient.sent.at(-1)).toEqual({ type: "signal", from: aId, data: { sdp: "answer" } });

    hub.message(patient, { type: "state", state: { questionIndex: 2, questionTotal: 10 } });
    expect(b.sent.at(-1)).toMatchObject({ type: "state", state: { questionIndex: 2, questionTotal: 10 } });
    hub.message(a, { type: "state", state: { questionIndex: 9 } });
    expect(b.sent.at(-1).state.questionIndex).toBe(2);
  });

  test("live list is per therapist; leaving cleans up", () => {
    const hub = new LiveHub();
    const patient = fakeSocket();
    const viewer = fakeSocket();
    hub.joinPatient(patient, link);
    hub.joinViewer(viewer, link);
    expect(hub.liveFor(3)).toEqual([expect.objectContaining({ interview_link_id: 1, patient_name: "Ana" })]);
    expect(hub.liveFor(99)).toEqual([]);

    hub.leave(patient);
    expect(viewer.sent.at(-1)).toMatchObject({ type: "patient-offline" });
    expect(hub.liveFor(3)).toEqual([]);
    hub.leave(viewer);
    expect(hub.rooms.size).toBe(0);
  });

  test("the same link opened twice: the newest tab is the live one", () => {
    const hub = new LiveHub();
    const first = fakeSocket();
    const second = fakeSocket();
    hub.joinPatient(first, link);
    hub.joinPatient(second, link);
    expect(first.close).toHaveBeenCalled();
    expect(hub.rooms.get(1).patient).toBe(second);
  });
});

describe("Live server over real WebSockets", () => {
  let server;
  let url;
  const authFor = (userId) => jwt.sign({ userId, role: "THERAPIST" }, process.env.JWT_SECRET);

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
    const { startLiveServer } = await import("../liveServer.js");
    server = http.createServer();
    startLiveServer(server, { allowedOrigins: ["https://amumata.netlify.app"] });
    await new Promise((resolve) => server.listen(0, resolve));
    url = `ws://127.0.0.1:${server.address().port}/ws/live`;
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));

  /** Open a socket that collects messages; resolves when open. */
  function connect(headers = {}) {
    const ws = new WebSocket(url, { headers });
    ws.messages = [];
    ws.closeCode = new Promise((resolve) => ws.on("close", (code) => resolve(code)));
    ws.on("message", (m) => ws.messages.push(JSON.parse(m.toString())));
    return new Promise((resolve, reject) => {
      ws.on("open", () => resolve(ws));
      ws.on("error", reject);
    });
  }
  const waitFor = async (ws, type) => {
    for (let i = 0; i < 100; i += 1) {
      const found = ws.messages.find((m) => m.type === type);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`no ${type} message`);
  };

  test("patient and owner therapist connect, signals and progress flow, the therapist is notified", async () => {
    const patient = await connect({ origin: "https://amumata.netlify.app" });
    patient.send(JSON.stringify({ type: "hello", role: "patient", token: "tok-7" }));
    await waitFor(patient, "welcome");
    expect(notify).toHaveBeenCalledWith(LINK, "interview_started");

    const viewer = await connect({ origin: "https://amumata.netlify.app" });
    viewer.send(JSON.stringify({ type: "hello", role: "viewer", authToken: authFor(3), linkId: 7 }));
    const welcome = await waitFor(viewer, "welcome");
    expect(welcome.patientOnline).toBe(true);
    const joined = await waitFor(patient, "viewer-joined");

    patient.send(JSON.stringify({ type: "signal", to: joined.viewerId, data: { sdp: { type: "offer" } } }));
    expect((await waitFor(viewer, "signal")).data).toEqual({ sdp: { type: "offer" } });

    patient.send(JSON.stringify({ type: "state", state: { questionIndex: 1, questionTotal: 5, question: "How are you?" } }));
    expect((await waitFor(viewer, "state")).state).toMatchObject({ questionIndex: 1, question: "How are you?" });

    patient.close();
    expect((await waitFor(viewer, "patient-offline")).type).toBe("patient-offline");
    viewer.close();
  });

  test("another therapist can't watch, and a finished or unknown link can't go live", async () => {
    const stranger = await connect();
    stranger.send(JSON.stringify({ type: "hello", role: "viewer", authToken: authFor(4), linkId: 7 }));
    expect(await stranger.closeCode).toBe(4403);

    const forged = await connect();
    forged.send(JSON.stringify({ type: "hello", role: "viewer", authToken: "not-a-token", linkId: 7 }));
    expect(await forged.closeCode).toBe(4403);

    const finished = await connect();
    finished.send(JSON.stringify({ type: "hello", role: "patient", token: "done" }));
    expect(await finished.closeCode).toBe(4403);
  });

  test("other websites are refused", async () => {
    await expect(connect({ origin: "https://evil.example" })).rejects.toThrow(/403/);
  });
});
