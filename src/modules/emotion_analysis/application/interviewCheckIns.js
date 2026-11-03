/**
 * Check-ins and skipped questions from the interview room.
 *
 * When a patient seems to struggle with a question (no answer for a while,
 * "I don't know / lisod", or head down / a blank stare while silent), Amumata
 * gently asks if they're okay to continue. The room reports, per question,
 * why the check-in happened and what the patient chose, plus which questions
 * they skipped without answering.
 *
 * Skipped questions are left out of the session's emotion mix, risk level,
 * indicators and spikes — a silent non-answer would otherwise count as a
 * "Neutral" answer and water the results down.
 */

export const CHECK_IN_REASONS = ["no_answer", "said_hard", "head_down", "still"];
export const CHECK_IN_OUTCOMES = ["continued", "break", "skipped"];
const MAX_QUESTIONS = 200;

const isIndex = (i) => Number.isInteger(i) && i >= 0 && i < MAX_QUESTIONS;

function parseJson(raw) {
  if (typeof raw !== "string" || !raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** `{ "<index>": { reason, outcome } }` → Map; unknown reasons/outcomes are dropped. */
export function parseCheckIns(raw) {
  const result = new Map();
  const data = parseJson(raw);
  if (!data || typeof data !== "object" || Array.isArray(data)) return result;
  for (const [key, value] of Object.entries(data)) {
    const index = Number(key);
    if (!isIndex(index) || !value || !CHECK_IN_REASONS.includes(value.reason)) continue;
    const outcome = CHECK_IN_OUTCOMES.includes(value.outcome) ? value.outcome : "continued";
    result.set(index, { reason: value.reason, outcome });
  }
  return result;
}

/** JSON list of question indexes → Set; anything else is ignored. */
export function parseSkipped(raw) {
  const data = parseJson(raw);
  return new Set(Array.isArray(data) ? data.filter(isIndex) : []);
}

/** For question `index`'s transcript entry: `{ check_in }` and/or `{ skipped: true }`, or {}. */
export function checkInFields(index, checkIns, skipped) {
  return {
    ...(checkIns.has(index) ? { check_in: checkIns.get(index) } : {}),
    ...(skipped.has(index) ? { skipped: true } : {}),
  };
}

// Same rules as the AI service (src/ai/fusion/fusion_engine.py): Sad+Angry % above these.
const RISK_HIGH = 60;
const RISK_MODERATE = 30;
const EMOTIONS = ["Angry", "Happy", "Neutral", "Sad"];

function riskLevel(distribution) {
  const negative = (distribution.Sad ?? 0) + (distribution.Angry ?? 0);
  if (negative > RISK_HIGH) return "High";
  if (negative > RISK_MODERATE) return "Moderate";
  return "Low";
}

function indicators(d) {
  const sad = d.Sad ?? 0;
  const angry = d.Angry ?? 0;
  const out = [];
  if (sad > 50) out.push("Predominantly sad affect");
  if (angry > 30) out.push("Elevated anger indicators");
  if (sad > 30 && angry > 20) out.push("Mixed negative emotions");
  if ((d.Neutral ?? 0) > 70) out.push("Predominantly neutral affect");
  if ((d.Happy ?? 0) > 50) out.push("Predominantly positive affect");
  return out;
}

/**
 * The AI's session results with skipped questions left out. Returns the AI
 * service's own results unchanged when nothing was skipped (or everything was).
 *
 * @param {{ overall_distribution?: object, risk_level?: string, indicators?: string[], spikes?: object[], per_question?: object[] }} mlResult
 * @param {Set<number>} skipped
 */
export function resultsWithoutSkipped(mlResult, skipped) {
  const original = {
    distribution: mlResult.overall_distribution || {},
    riskLevel: mlResult.risk_level || "Low",
    indicators: mlResult.indicators || [],
    spikes: mlResult.spikes || [],
  };
  const answered = (mlResult.per_question || []).filter((_, i) => !skipped.has(i));
  if (skipped.size === 0 || answered.length === 0) return original;

  const counts = Object.fromEntries(EMOTIONS.map((e) => [e, 0]));
  for (const q of answered) {
    const emotion = EMOTIONS.includes(q.combined_emotion) ? q.combined_emotion : "Neutral";
    counts[emotion] += 1;
  }
  const distribution = Object.fromEntries(
    EMOTIONS.map((e) => [e, Math.round((counts[e] / answered.length) * 1000) / 10]),
  );
  return {
    distribution,
    riskLevel: riskLevel(distribution),
    indicators: indicators(distribution),
    spikes: original.spikes.filter((s) => !skipped.has(s.question_index ?? s.questionIndex)),
  };
}
