/**
 * Rules for messages between the therapist and the patient during a live
 * interview: what text is accepted and how often.
 */

export const MAX_BODY = 500; // same limit as interview_messages.body
export const KEEP_IN_ROOM = 50; // recent messages a (re)joining browser receives
export const RATE = { max: 5, perMs: 10_000 }; // per browser

// The patient says they're ready to go on while the therapist has paused the questions:
// the therapist is told, and the questions resume by themselves after a minute
// unless the therapist resumes or replies first — the patient is never stuck.
export const READY_RESUME_MS = 60_000;
export const READY_BODY = "I'm ready to continue.";
export const READY_RESUMED_BODY = "Resumed automatically: the patient was ready and the therapist didn't respond within 1 minute.";

/**
 * The message text, cleaned: control characters removed (new lines kept) and
 * trimmed. null if it isn't text, is empty, or is longer than MAX_BODY.
 */
export function cleanBody(value) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\p{Cc}/gu, (c) => (c === "\n" ? c : "")).trim();
  if (!text || text.length > MAX_BODY) return null;
  return text;
}

/**
 * Allows at most RATE.max messages per RATE.perMs for each sender.
 * Returns a function: allow(sender, now) → true if this one may go through.
 */
export function rateLimiter({ max, perMs } = RATE) {
  const times = new WeakMap(); // sender → recent send times
  return (sender, now = Date.now()) => {
    const recent = (times.get(sender) ?? []).filter((t) => now - t < perMs);
    if (recent.length >= max) {
      times.set(sender, recent);
      return false;
    }
    times.set(sender, [...recent, now]);
    return true;
  };
}
