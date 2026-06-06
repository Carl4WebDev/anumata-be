import { Router } from "express";
import db from "../database/db.js";

const router = Router();

/**
 * Basic health check
 */
router.get("/health", async (req, res) => {
  try {
    // Optional: Check DB connectivity
    await db.query("SELECT 1");

    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      message: "Service unavailable",
    });
  }
});

export default router;
