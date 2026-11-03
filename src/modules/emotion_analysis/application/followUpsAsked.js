/**
 * Which questions got the therapist's follow-up during the interview (it is
 * only asked after a short answer). Sent by the interview room as a JSON list
 * of question indexes; malformed input just means "none" — it never blocks
 * the analysis.
 */

const MAX_QUESTIONS = 200;

/** @returns {Set<number>} */
export function parseFollowUpsAsked(raw) {
  if (typeof raw !== "string" || !raw) return new Set();
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    return new Set();
  }
  if (!Array.isArray(list)) return new Set();
  return new Set(list.filter((i) => Number.isInteger(i) && i >= 0 && i < MAX_QUESTIONS));
}

/**
 * The follow-up the patient was asked after question `index`, for its
 * transcript entry: `{ follow_up_asked: "What did that feel like?" }`, or {}.
 */
export function followUpAskedFields(question, index, asked) {
  const followUp = typeof question === "object" && question !== null ? question.follow_up : null;
  return asked.has(index) && typeof followUp === "string" && followUp ? { follow_up_asked: followUp } : {};
}
