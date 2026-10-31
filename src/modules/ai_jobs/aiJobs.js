/**
 * Slow AI requests (session report, longitudinal summary, question-set AI)
 * run as background jobs, like the interview analysis. The request answers
 * 202 with a job id at once, so no host or proxy timeout can cut it off;
 * the page polls GET /api/ai-jobs/:id for the result.
 */
import { randomUUID } from "node:crypto";
import { createJobRegistry } from "../../core/jobs/jobRegistry.js";
import { sendSuccess } from "../../core/http/apiResponse.js";
import AppError from "../../core/errors/AppError.js";
import NotFoundError from "../../core/errors/NotFoundError.js";

/**
 * Longest the backend waits for one AI reply (report, summary, question-set AI).
 * Same as the page's wait (MAX_WAIT_MS in the frontend's aiJobs.ts). Longer than
 * this, the AI service is stuck or overloaded and waiting more won't help.
 */
export const AI_REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

export function createAiJobs(options = {}) {
  const registry = createJobRegistry({ label: "AI", ...options });

  return {
    /**
     * Run `run` in the background for this therapist and answer 202 { job_id }.
     * Same `key` while it's still running → the same job (no duplicate AI work).
     */
    start(res, { userId, key = randomUUID(), run }) {
      const { job, started } = registry.start(`${userId}:${key}`, () => run().catch(toSafeError), { owner: userId });
      return sendSuccess(res, {
        statusCode: 202,
        message: started ? "AI request started" : "AI request already in progress",
        data: { job_id: job.id, status: job.status },
      });
    },

    /** The job's state, for its owner only. */
    status(jobId, userId) {
      const job = registry.getById(jobId);
      if (!job || job.owner !== userId) {
        throw new NotFoundError("AI request not found. The server may have restarted. Please try again.");
      }
      return { job_id: job.id, status: job.status, result: job.result, error: job.error };
    },
  };
}

/** Keep our own error messages; hide internals (addresses, stack details) of anything else. */
function toSafeError(err) {
  if (err instanceof AppError) throw err;
  console.error("[AI] Unexpected error:", err?.message);
  throw new AppError("The AI service didn't respond. Check that it is running, then try again.", 502, "AI_JOB_FAILED");
}

export const aiJobs = createAiJobs();
