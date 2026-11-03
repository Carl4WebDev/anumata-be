/**
 * The patient's own rating of how they feel, asked right before the first
 * question and after the last: 1 (very bad) … 5 (very good). Optional — a
 * missing or malformed value never blocks the analysis, it is just left out.
 */

export const MOOD_MIN = 1;
export const MOOD_MAX = 5;

const asMood = (value) => (Number.isInteger(value) && value >= MOOD_MIN && value <= MOOD_MAX ? value : null);

/**
 * @param {unknown} raw the `self_report` form field: JSON `{ mood_before, mood_after }`
 * @returns {{ mood_before: number|null, mood_after: number|null } | null} null when neither was given
 */
export function parseSelfReport(raw) {
  if (typeof raw !== "string" || !raw) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const report = { mood_before: asMood(data.mood_before), mood_after: asMood(data.mood_after) };
  return report.mood_before === null && report.mood_after === null ? null : report;
}
