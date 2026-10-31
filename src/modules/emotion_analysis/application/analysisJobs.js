/**
 * Background analysis jobs, one per interview token.
 *
 * Analysing a long interview takes minutes. Instead of holding the upload
 * request open (and hitting HTTP timeouts), the upload starts a job and
 * returns at once; the patient's page then polls the job's status.
 *
 * In memory: if the server restarts mid-analysis the job is lost, and the
 * patient's page offers "Try again" (their recordings stay in the browser
 * until the analysis succeeds).
 */

const FINISHED_TTL_MS = 60 * 60 * 1000; // keep finished jobs for an hour

export function createJobRegistry({ now = () => Date.now() } = {}) {
  const jobs = new Map();

  const prune = () => {
    for (const [token, job] of jobs) {
      if (job.status !== "processing" && now() - job.finishedAt > FINISHED_TTL_MS) jobs.delete(token);
    }
  };

  return {
    get(token) {
      prune();
      return jobs.get(token) ?? null;
    },

    /**
     * Start `run` for the token unless it's already running.
     * Returns the job and whether this call started it.
     */
    start(token, run) {
      prune();
      const existing = jobs.get(token);
      if (existing?.status === "processing") return { job: existing, started: false };

      const job = { status: "processing", startedAt: now(), finishedAt: null, result: null, error: null };
      jobs.set(token, job);
      Promise.resolve()
        .then(run)
        .then((result) => {
          Object.assign(job, { status: "completed", result, finishedAt: now() });
        })
        .catch((err) => {
          Object.assign(job, {
            status: "failed",
            error: { message: err?.message || "Analysis failed", code: err?.code || "ANALYSIS_FAILED" },
            finishedAt: now(),
          });
          console.error(`[ANALYSIS] Job for ${token.slice(0, 8)}… failed:`, err?.message);
        });
      return { job, started: true };
    },
  };
}
