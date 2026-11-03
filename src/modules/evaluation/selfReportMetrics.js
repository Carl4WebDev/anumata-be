/**
 * How well the AI agrees with what patients said about themselves, in real
 * interviews (the test-set results in docs/evaluation/ cover public datasets).
 *
 * Two kinds of self-report are saved with each session:
 *  - feeling words tapped per question (transcript[i].feelings_tapped)
 *  - mood before / after the interview, 1–5 (emotion_summary.self_report)
 *
 * Pure functions: the script in scripts/evaluate-self-report.mjs loads the
 * sessions and writes the report.
 */

export const EMOTIONS = ["Angry", "Happy", "Neutral", "Sad"];

/**
 * Which of the AI's four emotions a feeling word corresponds to. "worried"
 * and "scared" have no match among the four, so they are left out of the
 * per-question comparison (they are still counted in the report).
 */
export const FEELING_TO_EMOTION = {
  sad: "Sad",
  lonely: "Sad",
  tired: "Sad",
  angry: "Angry",
  okay: "Neutral",
  hopeful: "Happy",
  worried: null,
  scared: null,
};

const titleCase = (s) => (typeof s === "string" && s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : null);

/**
 * The single emotion a question's tapped words point to, or why there isn't one:
 * `{ label }`, `{ skip: "none" }` (no words), `{ skip: "unmapped" }` (only
 * worried/scared), or `{ skip: "mixed" }` (words pointing to different emotions).
 */
export function selfReportLabel(feelings) {
  if (!Array.isArray(feelings) || feelings.length === 0) return { skip: "none" };
  const emotions = [...new Set(feelings.map((f) => FEELING_TO_EMOTION[f]).filter(Boolean))];
  if (emotions.length === 0) return { skip: "unmapped" };
  if (emotions.length > 1) return { skip: "mixed" };
  return { label: emotions[0] };
}

/** Which AI reading to compare: the fused result, or the face / voice model alone. */
const AI_FIELDS = { fusion: "combined_emotion", fer: "fer_emotion", ser: "ser_emotion" };

/**
 * Per-question pairs of (patient's emotion, AI's emotion) across sessions,
 * plus counts of the questions that couldn't be compared and why.
 */
export function collectQuestionPairs(sessions, model = "fusion") {
  const field = AI_FIELDS[model];
  const pairs = [];
  const skipped = { none: 0, unmapped: 0, mixed: 0, noAi: 0 };
  for (const session of sessions) {
    for (const entry of Array.isArray(session.transcript) ? session.transcript : []) {
      const self = selfReportLabel(entry?.feelings_tapped);
      if (self.skip) {
        skipped[self.skip] += 1;
        continue;
      }
      const ai = titleCase(entry[field]);
      if (!EMOTIONS.includes(ai)) {
        skipped.noAi += 1;
        continue;
      }
      pairs.push({ self: self.label, ai });
    }
  }
  return { pairs, skipped };
}

/**
 * Confusion matrix (rows = patient's report, columns = AI), accuracy,
 * per-emotion precision / recall / F1, macro F1 and Cohen's kappa
 * (agreement beyond chance). Values are null when there is nothing to divide by.
 */
export function agreementMetrics(pairs, labels = EMOTIONS) {
  const index = Object.fromEntries(labels.map((l, i) => [l, i]));
  const matrix = labels.map(() => labels.map(() => 0));
  for (const { self, ai } of pairs) {
    if (self in index && ai in index) matrix[index[self]][index[ai]] += 1;
  }
  const n = matrix.flat().reduce((a, b) => a + b, 0);
  const correct = labels.reduce((sum, _, i) => sum + matrix[i][i], 0);
  const rowTotal = (i) => matrix[i].reduce((a, b) => a + b, 0);
  const colTotal = (j) => matrix.reduce((a, row) => a + row[j], 0);
  const ratio = (a, b) => (b > 0 ? a / b : null);

  const perClass = labels.map((label, i) => {
    const precision = ratio(matrix[i][i], colTotal(i));
    const recall = ratio(matrix[i][i], rowTotal(i));
    const f1 = precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null;
    return { label, precision, recall, f1, support: rowTotal(i) };
  });
  const supported = perClass.filter((c) => c.support > 0);
  const macroF1 = supported.length > 0 ? supported.reduce((s, c) => s + (c.f1 ?? 0), 0) / supported.length : null;
  const observed = ratio(correct, n);
  const expected = n > 0 ? labels.reduce((s, _, i) => s + (rowTotal(i) / n) * (colTotal(i) / n), 0) : null;
  const kappa = observed !== null && expected !== null && expected < 1 ? (observed - expected) / (1 - expected) : null;

  return { labels, matrix, n, accuracy: observed, perClass, macroF1, kappa };
}

/** Spearman rank correlation (ties get average ranks); null with fewer than 3 pairs or no variation. */
export function spearman(xs, ys) {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const rank = (values) => {
    const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const ranks = new Array(values.length);
    for (let i = 0; i < order.length; ) {
      let j = i;
      while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k += 1) ranks[order[k][1]] = avg;
      i = j + 1;
    }
    return ranks;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < rx.length; i += 1) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : null;
}

/** Share of the session's answers the AI read as Sad or Angry (0–100). */
export function negativeShare(session) {
  const d = session.emotion_summary?.distribution ?? {};
  const get = (k) => Number(d[k] ?? d[k.toLowerCase()] ?? 0);
  return get("Sad") + get("Angry");
}

/**
 * Mood check vs the AI, per session. A patient who feels worse should show a
 * larger share of Sad/Angry answers, so a good agreement is a **negative**
 * correlation between mood (1 = very bad … 5 = very good) and that share.
 */
export function moodAgreement(sessions) {
  const rated = sessions
    .map((s) => ({ report: s.emotion_summary?.self_report, negative: negativeShare(s) }))
    .filter((s) => s.report);
  const pick = (key) => rated.filter((s) => Number.isInteger(s.report[key]));
  const before = pick("mood_before");
  const after = pick("mood_after");
  const both = rated.filter((s) => Number.isInteger(s.report.mood_before) && Number.isInteger(s.report.mood_after));

  const byMood = (list, key) =>
    [1, 2, 3, 4, 5].map((mood) => {
      const group = list.filter((s) => s.report[key] === mood);
      return {
        mood,
        sessions: group.length,
        meanNegativeShare: group.length ? group.reduce((sum, s) => sum + s.negative, 0) / group.length : null,
      };
    });

  return {
    sessionsWithMood: rated.length,
    before: {
      n: before.length,
      spearman: spearman(before.map((s) => s.report.mood_before), before.map((s) => s.negative)),
      byMood: byMood(before, "mood_before"),
    },
    after: {
      n: after.length,
      spearman: spearman(after.map((s) => s.report.mood_after), after.map((s) => s.negative)),
      byMood: byMood(after, "mood_after"),
    },
    change: {
      n: both.length,
      better: both.filter((s) => s.report.mood_after > s.report.mood_before).length,
      same: both.filter((s) => s.report.mood_after === s.report.mood_before).length,
      worse: both.filter((s) => s.report.mood_after < s.report.mood_before).length,
    },
  };
}

/** How often each feeling word was tapped (including worried/scared, which have no AI match). */
export function feelingCounts(sessions) {
  const counts = Object.fromEntries(Object.keys(FEELING_TO_EMOTION).map((k) => [k, 0]));
  for (const session of sessions) {
    for (const entry of Array.isArray(session.transcript) ? session.transcript : []) {
      for (const word of Array.isArray(entry?.feelings_tapped) ? entry.feelings_tapped : []) {
        if (word in counts) counts[word] += 1;
      }
    }
  }
  return counts;
}
