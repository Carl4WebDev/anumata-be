/**
 * When appointment reminders are due. Pure — the service runs it every few
 * minutes with each upcoming appointment and the reminders it already got.
 *
 *  - day_before:   once the appointment is within 24 hours (but more than 2 hours away)
 *  - hours_before: once it is within 2 hours
 *
 * An appointment booked late (say 10 hours ahead) gets its day_before reminder
 * right away; one booked less than 2 hours ahead gets only hours_before.
 */

const HOUR_MS = 60 * 60 * 1000;

export const REMINDER_KINDS = {
  day_before: { within: 24 * HOUR_MS, after: 2 * HOUR_MS },
  hours_before: { within: 2 * HOUR_MS, after: 0 },
};

export const DEFAULT_REMINDER_KINDS = ["day_before", "hours_before"];

/** Reminder kinds turned on, from REMINDER_KINDS env ("day_before,hours_before"); unknown names are ignored. */
export function enabledKinds(raw) {
  if (typeof raw !== "string" || !raw.trim()) return DEFAULT_REMINDER_KINDS;
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k in REMINDER_KINDS);
}

/**
 * The reminder to send now for an appointment starting at `startMs`, or null.
 * `sent`: kinds already sent (or being sent) for it.
 */
export function dueReminder(startMs, nowMs, kinds, sent) {
  const left = startMs - nowMs;
  if (left <= 0) return null;
  // Closest first: within 2 hours, the day-before reminder is no longer useful.
  for (const kind of ["hours_before", "day_before"]) {
    const window = REMINDER_KINDS[kind];
    if (!kinds.includes(kind) || sent.has(kind)) continue;
    if (left <= window.within && left > window.after) return kind;
  }
  return null;
}
