/**
 * Background jobs for slow work (interview analysis, AI reports, question-set AI).
 *
 * Some requests take minutes. Instead of holding the request open (and hitting
 * HTTP timeouts at a host or proxy), the request starts a job and returns at
 * once; the page then polls the job's status.
 *
 * In memory: if the server restarts mid-job the job is lost, and the page
 * offers "Try again".
 */
import { randomUUID } from "node:crypto";

const FINISHED_TTL_MS = 60 * 60 * 1000; // keep finished jobs for an hour

export function createJobRegistry({ now = () => Date.now(), label = "ANALYSIS" } = {}) {
  const jobs = new Map();

  const prune = () => {
    for (const [key, job] of jobs) {
      if (job.status !== "processing" && now() - job.finishedAt > FINISHED_TTL_MS) jobs.delete(key);
    }
  };

  return {
    get(key) {
      prune();
      return jobs.get(key) ?? null;
    },

    /** Look a job up by the id handed to the client. */
    getById(id) {
      prune();
      for (const job of jobs.values()) if (job.id === id) return job;
      return null;
    },

    /**
     * Start `run` for the key unless it's already running.
     * Returns the job and whether this call started it.
     */
    start(key, run, { owner = null } = {}) {
      prune();
      const existing = jobs.get(key);
      if (existing?.status === "processing") return { job: existing, started: false };

      const job = { id: randomUUID(), owner, status: "processing", startedAt: now(), finishedAt: null, result: null, error: null };
      jobs.set(key, job);
      Promise.resolve()
        .then(run)
        .then((result) => {
          Object.assign(job, { status: "completed", result, finishedAt: now() });
        })
        .catch((err) => {
          Object.assign(job, {
            status: "failed",
            error: { message: err?.message || "Job failed", code: err?.code || `${label}_FAILED` },
            finishedAt: now(),
          });
          console.error(`[${label}] Job for ${key.slice(0, 8)}… failed:`, err?.message);
        });
      return { job, started: true };
    },
  };
}
