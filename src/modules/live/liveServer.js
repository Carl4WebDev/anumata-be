import { WebSocketServer } from "ws";
import db from "../../core/database/db.js";
import AuthTokenService from "../../core/middleware/AuthTokenService.js";
import InterviewLinkRepo from "../interview_links/infrastructure/InterviewLinkRepo.js";
import { notificationService } from "../notifications/notificationServiceInstance.js";
import LiveHub from "./LiveHub.js";

export const LIVE_PATH = "/ws/live";
const HEARTBEAT_MS = 25 * 1000; // keeps connections open through proxies (Render)
const HELLO_TIMEOUT_MS = 10 * 1000;
const MAX_MESSAGE_BYTES = 64 * 1024;

/** STUN always; TURN when configured (needed on some mobile and strict Wi-Fi networks). */
export function iceServersFromEnv(env = process.env) {
  const servers = [{ urls: (env.STUN_URLS || "stun:stun.l.google.com:19302").split(",").map((u) => u.trim()) }];
  if (env.TURN_URLS && env.TURN_USERNAME && env.TURN_CREDENTIAL) {
    servers.push({
      urls: env.TURN_URLS.split(",").map((u) => u.trim()),
      username: env.TURN_USERNAME,
      credential: env.TURN_CREDENTIAL,
    });
  }
  return servers;
}

const links = new InterviewLinkRepo();
const tokens = new AuthTokenService();

export const liveHub = new LiveHub({
  iceServers: iceServersFromEnv(),
  // "Maria started the interview — Watch live". Sent once per interview link.
  onPatientLive: (link) => {
    notificationService.notifyInterview(link, "interview_started").catch(() => {});
  },
});

/** The patient's interview link, if its token is valid and the interview isn't over. */
export async function patientLink(token) {
  if (typeof token !== "string" || token.length > 64) return null;
  const link = await links.findByToken(token);
  if (!link || link.status === "expired" || link.status === "completed") return null;
  return link;
}

/** The link, if the login token belongs to an active therapist who owns it. */
export async function viewerLink(authToken, linkId) {
  const decoded = typeof authToken === "string" ? tokens.verifyToken(authToken) : null;
  const userId = decoded?.userId;
  if (!userId || !Number.isInteger(Number(linkId))) return null;
  const { rows } = await db.query(`SELECT role, is_active FROM users WHERE user_id = $1`, [userId]);
  if (rows[0]?.role !== "THERAPIST" || !rows[0]?.is_active) return null;
  const link = await links.findById(Number(linkId));
  return link && Number(link.therapist_id) === Number(userId) ? link : null;
}

/**
 * Live viewing over WebSocket at /ws/live, on the same server as the API.
 * The first message must be a "hello":
 *   patient: { type: "hello", role: "patient", token }            — the interview link token
 *   viewer:  { type: "hello", role: "viewer", authToken, linkId }  — the therapist's login token
 */
export function startLiveServer(httpServer, { allowedOrigins = [] } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  httpServer.on("upgrade", (req, socket, head) => {
    if (!req.url || !req.url.startsWith(LIVE_PATH)) return;
    // Only our own frontend may connect (same list as the API's CORS).
    const origin = req.headers.origin;
    if (allowedOrigins.length > 0 && origin && !allowedOrigins.includes(origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
  });

  wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    let joined = false;
    const helloTimer = setTimeout(() => !joined && ws.close(4401, "hello expected"), HELLO_TIMEOUT_MS);

    ws.on("message", async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (joined) {
        liveHub.message(ws, msg);
        return;
      }
      if (msg?.type !== "hello") return;
      try {
        if (msg.role === "patient") {
          const link = await patientLink(msg.token);
          if (!link) return ws.close(4403, "invalid interview link");
          joined = true;
          liveHub.joinPatient(ws, link);
        } else if (msg.role === "viewer") {
          const link = await viewerLink(msg.authToken, msg.linkId);
          if (!link) return ws.close(4403, "not allowed");
          joined = true;
          liveHub.joinViewer(ws, link);
        }
      } catch (err) {
        console.error("[LIVE] Join failed:", err.message);
        ws.close(1011, "server error");
      } finally {
        if (joined) clearTimeout(helloTimer);
      }
    });

    ws.on("close", () => {
      clearTimeout(helloTimer);
      liveHub.leave(ws);
    });
    ws.on("error", () => {});
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  wss.on("close", () => clearInterval(heartbeat));

  console.log(`[LIVE] Live viewing ready at ${LIVE_PATH}`);
  return wss;
}
