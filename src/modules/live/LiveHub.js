import { randomUUID } from "node:crypto";

const OPEN = 1; // WebSocket.OPEN

/**
 * Live viewing of interviews: one room per interview link, with the patient's
 * browser and any number of the therapist's viewers. The hub only relays
 * WebRTC signals (offers, answers, ICE candidates) and the interview's live
 * state — the video itself goes directly between the browsers (or via TURN).
 *
 * Sockets are anything with send(string), close() and readyState.
 */
export default class LiveHub {
  /**
   * @param iceServers STUN/TURN servers both browsers use
   * @param onPatientLive called when a patient comes online (e.g. to notify the therapist)
   */
  constructor({ iceServers = [], onPatientLive = () => {} } = {}) {
    this.iceServers = iceServers;
    this.onPatientLive = onPatientLive;
    this.rooms = new Map(); // interview_link_id → room
    this.meta = new WeakMap(); // socket → { role, linkId, viewerId }
  }

  send(socket, message) {
    if (socket && socket.readyState === OPEN) socket.send(JSON.stringify(message));
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
    this.send(socket, { type: "welcome", role: "patient", iceServers: this.iceServers });
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
    }
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
