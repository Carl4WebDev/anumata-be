import { Router } from "express";
import db from "../database/db.js";

const router = Router();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8001";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

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

/**
 * Aggregated system health — checks DB, AI service, and Ollama
 */
router.get("/api/system/health", async (req, res) => {
  const result = {
    express: { status: "ok" },
    database: { status: "unknown" },
    ai_service: { status: "unknown", models: { fer: false, ser: false, ler: false, stt: false } },
    ollama: { status: "unknown", model: null },
    timestamp: new Date().toISOString(),
  };

  // Database check
  try {
    await db.query("SELECT 1");
    result.database.status = "ok";
  } catch {
    result.database.status = "error";
  }

  // AI service check (port 8001)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const aiRes = await fetch(`${AI_SERVICE_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (aiRes.ok) {
      const aiData = await aiRes.json();
      result.ai_service.status = aiData.status || "ok";
      const loaded = aiData.models_loaded || {};
      result.ai_service.models = {
        fer: !!loaded.fer,
        ser: !!loaded.ser,
        ler: !!loaded.ler,
        stt: !!loaded.stt,
      };
    } else {
      result.ai_service.status = "error";
    }
  } catch {
    result.ai_service.status = "unreachable";
  }

  // Ollama check (port 11434)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const ollamaRes = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (ollamaRes.ok) {
      const ollamaData = await ollamaRes.json();
      const models = ollamaData.models || [];
      const reportModel = models.find((m) => m.name?.includes("llama") || m.name?.includes("qwen"));
      result.ollama.status = reportModel ? "ok" : "model_missing";
      result.ollama.model = reportModel?.name || null;
    } else {
      result.ollama.status = "error";
    }
  } catch {
    result.ollama.status = "unreachable";
  }

  const allOk =
    result.database.status === "ok" &&
    result.ai_service.status === "ok" &&
    result.ollama.status === "ok";

  res.status(allOk ? 200 : 207).json({
    status: allOk ? "ok" : "degraded",
    ...result,
  });
});

export default router;
