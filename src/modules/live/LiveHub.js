import { randomUUID } from "node:crypto";
import { KEEP_IN_ROOM, cleanBody, rateLimiter } from "./liveTalk.js";

const OPEN = 1; // WebSocket.OPEN

/**
 * Live viewing of interviews: one room per interview link, with the patient's
 * browser and any number of the therapist's viewers. The hub relays WebRTC
 * signals (offers, answers, ICE candidates), the interview's live state, and
 * the conversation when the therapist steps in — the video itself goes directly
 * between the browsers (or via TURN).
 *
 * Stepping in: the therapist sends messages ("talk") and can pause or resume
 * the questions; the patient replies and confirms each message was shown
 * ("seen"). Everything is relayed to both sides and saved (when a store is given).
 *
 * Sockets are anything with send(string), close() and readyState.
 */
export default class LiveHub {
  /**
   * @param iceServers STUN/TURN servers both browsers use
   * @param onPatientLive called when a patient comes online (e.g. to notify the therapist)
   * @param messages where the conversation is saved: { save(), markSeen() } (optional)
   */
  constructor({ iceServers = [], onPatientLive = () => {}, messages = null } = {}) {
    this.iceServers = iceServers;
    this.onPatientLive = onPatientLive;
    this.messages = messages;
    this.allow = rateLimiter();
    this.rooms = new Map(); // interview_link_id → room
    this.meta = new WeakMap(); // socket → { role, linkId, viewerId }
  }

  send(socket, message) {
    if (socket && socket.readyState === OPEN) socket.send(JSON.stringify(message));
  }

  /** To the patient and every viewer of the room. */
  sendAll(room, message) {
    this.send(room.patient, message);
    for (const viewer of room.viewers.values()) this.send(viewer, message);
  }

  room(link) {
    let room = this.rooms.get(link.interview_link_id);
    if (!room) {
      room = {
        linkId: link.interview_link_id,
        therapistId: link.therapist_id,
        patientName: (link.patient_name || "").trim(),
        patient: null,
        viewers: new Map(), // viewerId → socket
        state: {},
        since: null,
        talk: [], // recent messages, pauses and resumes, oldest first
        paused: false, // the therapist paused the questions
        saved: new Map(), // talk ref → Promise of its message_id
      };
      this.rooms.set(room.linkId, room);
    }
    return room;
  }

  /** The patient's browser joined (its interview token was already checked). */
  joinPatient(socket, link) {
    const room = this.room(link);
    if (room.patient && room.patient !== socket) {
      // Same link opened again (e.g. a reload): the newest tab is the live one.
      this.meta.delete(room.patient);
      room.patient.close();
    }
    room.patient = socket;
    room.since = new Date().toISOString();
    this.meta.set(socket, { role: "patient", linkId: room.linkId });
    this.send(socket, { type: "welcome", role: "patient", iceServers: this.iceServers, paused: room.paused, talk: room.talk });
    for (const [viewerId, viewer] of room.viewers) {
      this.send(viewer, { type: "patient-online", state: room.state });
      this.send(socket, { type: "viewer-joined", viewerId });
    }
    this.onPatientLive(link);
  }

  /** The therapist's browser joined (owner of the link, already checked). */
  joinViewer(socket, link) {
    const room = this.room(link);
    const viewerId = randomUUID();
    room.viewers.set(viewerId, socket);
    this.meta.set(socket, { role: "viewer", linkId: room.linkId, viewerId });
    this.send(socket, {
      type: "welcome",
      role: "viewer",
      viewerId,
      iceServers: this.iceServers,
      patientOnline: Boolean(room.patient),
      patientName: room.patientName,
      state: room.state,
      paused: room.paused,
      talk: room.talk,
    });
    if (room.patient) this.send(room.patient, { type: "viewer-joined", viewerId });
  }

  /** A message from a joined socket. */
  message(socket, msg) {
    const who = this.meta.get(socket);
    const room = who && this.rooms.get(who.linkId);
    if (!room || !msg || typeof msg !== "object") return;

    if (msg.type === "signal") {
      if (who.role === "patient") {
        this.send(room.viewers.get(msg.to), { type: "signal", from: "patient", data: msg.data });
      } else {
        this.send(room.patient, { type: "signal", from: who.viewerId, data: msg.data });
      }
      return;
    }

    // Only the patient reports the interview's progress.
    if (msg.type === "state" && who.role === "patient" && msg.state && typeof msg.state === "object") {
      room.state = { ...room.state, ...msg.state, updatedAt: new Date().toISOString() };
      for (const viewer of room.viewers.values()) this.send(viewer, { type: "state", state: room.state });
      return;
    }

    if (who.role === "viewer") this.fromTherapist(socket, room, msg);
    else this.fromPatient(socket, room, msg);
  }

  /** The therapist steps in: a message, or pausing / resuming the questions. */
  fromTherapist(socket, room, msg) {
    if (msg.type === "talk") {
      const body = cleanBody(msg.body);
      if (body && this.allow(socket)) this.addTalk(room, { sender: "therapist", kind: "message", body });
    } else if ((msg.type === "pause" || msg.type === "resume") && room.paused !== (msg.type === "pause")) {
      if (!this.allow(socket)) return;
      room.paused = msg.type === "pause";
      this.addTalk(room, { sender: "therapist", kind: msg.type });
    }
  }

  /** The patient replies, or confirms a therapist message was shown. */
  fromPatient(socket, room, msg) {
    if (msg.type === "talk") {
      const body = cleanBody(msg.body);
      if (body && this.allow(socket)) this.addTalk(room, { sender: "patient", kind: "message", body });
    } else if (msg.type === "seen" && typeof msg.ref === "string") {
      const item = room.talk.find((t) => t.ref === msg.ref && t.sender === "therapist" && t.kind === "message");
      if (!item || item.seenAt) return;
      const seenAt = new Date().toISOString();
      room.talk = room.talk.map((t) => (t === item ? { ...t, seenAt } : t));
      for (const viewer of room.viewers.values()) this.send(viewer, { type: "seen", ref: item.ref, seenAt });
      const saved = room.saved.get(item.ref);
      if (saved && this.messages) {
        saved.then((id) => id && this.messages.markSeen(id)).catch((err) => console.error("[LIVE] Mark seen failed:", err.message));
      }
    }
  }

  /** Keep, relay and save one message / pause / resume. */
  addTalk(room, { sender, kind, body = null, auto = false }) {
    const item = { ref: randomUUID(), sender, kind, body, at: new Date().toISOString(), seenAt: null, ...(auto ? { auto } : {}) };
    room.talk = [...room.talk, item].slice(-KEEP_IN_ROOM);
    this.sendAll(room, { type: "talk", item });
    if (!this.messages) return;
    // Relaying comes first: the patient gets the message even if saving fails.
    const questionIndex = Number.isInteger(room.state.questionIndex) ? room.state.questionIndex : null;
    const saved = Promise.resolve()
      .then(() => this.messages.save({ linkId: room.linkId, sender, kind, body, questionIndex }))
      .catch((err) => {
        console.error("[LIVE] Saving a message failed:", err.message);
        return null;
      });
    room.saved.set(item.ref, saved);
    // Only the recent ones can still be marked seen.
    if (room.saved.size > KEEP_IN_ROOM) room.saved.delete(room.saved.keys().next().value);
  }

  /** A socket closed. */
  leave(socket) {
    const who = this.meta.get(socket);
    if (!who) return;
    this.meta.delete(socket);
    const room = this.rooms.get(who.linkId);
    if (!room) return;

    if (who.role === "patient" && room.patient === socket) {
      room.patient = null;
      room.since = null;
      for (const viewer of room.viewers.values()) this.send(viewer, { type: "patient-offline", state: room.state });
    } else if (who.role === "viewer") {
      room.viewers.delete(who.viewerId);
      this.send(room.patient, { type: "viewer-left", viewerId: who.viewerId });
      // The therapist closed the live view while the questions were paused:
      // don't leave the patient waiting for someone who is gone.
      if (room.viewers.size === 0 && room.paused) {
        room.paused = false;
        this.addTalk(room, {
          sender: "therapist",
          kind: "resume",
          body: "Resumed automatically: the therapist closed the live view.",
          auto: true,
        });
      }
    }
    if (!room.patient && room.viewers.size === 0) this.rooms.delete(room.linkId);
  }

  /** Interviews of this therapist with the patient in the room right now. */
  liveFor(therapistId) {
    return [...this.rooms.values()]
      .filter((r) => r.patient && Number(r.therapistId) === Number(therapistId))
      .map((r) => ({
        interview_link_id: r.linkId,
        patient_name: r.patientName,
        since: r.since,
        question_index: r.state.questionIndex ?? null,
        question_total: r.state.questionTotal ?? null,
      }));
  }
}
