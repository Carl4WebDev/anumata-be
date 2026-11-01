import { Router } from "express";
import db from "../database/db.js";
import { AI_SERVICE_URL, aiServiceHeaders } from "./aiService.js";

const router = Router();

// How long the Settings page waits for the AI's answer. Modal needs minutes
// to wake a sleeping AI, so a slow answer means "starting", not "down".
const AI_CHECK_MS = 5000;

/**
 * Basic health check (DB only)
 */
router.get("/health", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: "error", message: "Service unavailable" });
  }
});

let wakeInFlight = null;

/**
 * The AI didn't answer in time: Modal is starting it. Let one request run to
 * the end (no time limit), so the AI really wakes up instead of the check
 * cancelling it every time.
 */
function wakeAiService() {
  wakeInFlight ??= fetch(`${AI_SERVICE_URL}/health`, { headers: aiServiceHeaders() })
    .catch(() => {})
    .finally(() => {
      wakeInFlight = null;
    });
}

/**
 * Aggregated system health — DB, the AI service, and Ollama (which runs inside
 * the AI service on Modal, so the AI service reports its status).
 */
router.get("/api/system/health", async (req, res) => {
  const result = {
    express: { status: "ok" },
    database: { status: "unknown" },
    ai_service: { status: "unknown", models: { fer: false, ser: false, ler: false, stt: false } },
    ollama: { status: "unknown", model: null },
    timestamp: new Date().toISOString(),
  };

  try {
    await db.query("SELECT 1");
    result.database.status = "ok";
  } catch {
    result.database.status = "error";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_CHECK_MS);
  try {
    const aiRes = await fetch(`${AI_SERVICE_URL}/health`, { headers: aiServiceHeaders(), signal: controller.signal });
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      const loaded = aiData.models_loaded || {};
      result.ai_service = {
        status: aiData.status || "ok",
        models: { fer: !!loaded.fer, ser: !!loaded.ser, ler: !!loaded.ler, stt: !!loaded.stt },
      };
      if (aiData.ollama) result.ollama = { status: aiData.ollama.status, model: aiData.ollama.model ?? null };
    } else {
      result.ai_service.status = "error"; // e.g. 401: wrong AI_SERVICE_KEY / AI_SERVICE_SECRET
      result.ollama.status = "error";
    }
  } catch (err) {
    if (err?.name === "AbortError") {
      result.ai_service.status = "starting";
      result.ollama.status = "starting";
      wakeAiService();
    } else {
      result.ai_service.status = "unreachable";
      result.ollama.status = "unreachable";
    }
  } finally {
    clearTimeout(timeout);
  }

  const allOk = result.database.status === "ok" && result.ai_service.status === "ok" && result.ollama.status === "ok";
  const status = allOk ? "ok" : result.ai_service.status === "starting" ? "starting" : "degraded";
  res.status(allOk ? 200 : 207).json({ status, ...result });
});

export default router;
