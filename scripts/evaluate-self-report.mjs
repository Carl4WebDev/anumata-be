#!/usr/bin/env node
/**
 * Agreement between the AI and patients' own report, across saved sessions.
 *
 *   npm run eval:self-report                     # all sessions
 *   npm run eval:self-report -- --therapist 3    # one therapist's sessions
 *
 * Uses the database in .env (DATABASE_URL or DB_*). Read-only. Writes
 * docs/evaluation/self-report/self_report_results.md and .json, and prints a
 * short summary. Metrics: src/modules/evaluation/selfReportMetrics.js.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import db from "../src/core/database/db.js";
import {
  EMOTIONS,
  FEELING_TO_EMOTION,
  agreementMetrics,
  collectQuestionPairs,
  feelingCounts,
  moodAgreement,
} from "../src/modules/evaluation/selfReportMetrics.js";

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../docs/evaluation/self-report");

function parseArgs(argv) {
  const i = argv.indexOf("--therapist");
  if (i === -1) return { therapistId: null };
  const therapistId = Number(argv[i + 1]);
  if (!Number.isInteger(therapistId) || therapistId <= 0) throw new Error("--therapist needs a user id, e.g. --therapist 3");
  return { therapistId };
}

const pct = (v) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(1)}%`);
const num = (v, digits = 3) => (v === null || v === undefined ? "—" : v.toFixed(digits));

function matrixTable(m) {
  const head = `| Patient said ↓ / AI read → | ${m.labels.join(" | ")} |`;
  const sep = `|---|${m.labels.map(() => "---").join("|")}|`;
  const rows = m.labels.map((label, i) => `| **${label}** | ${m.matrix[i].join(" | ")} |`);
  return [head, sep, ...rows].join("\n");
}

function modelSection(title, { metrics, skipped }) {
  const perClass = metrics.perClass
    .map((c) => `| ${c.label} | ${num(c.precision)} | ${num(c.recall)} | ${num(c.f1)} | ${c.support} |`)
    .join("\n");
  return [
    `### ${title}`,
    "",
    `Questions compared: **${metrics.n}** · Agreement (accuracy): **${pct(metrics.accuracy)}** · ` +
      `Macro F1: **${num(metrics.macroF1)}** · Cohen's kappa: **${num(metrics.kappa)}**`,
    "",
    matrixTable(metrics),
    "",
    "| Emotion | Precision | Recall | F1 | Questions (patient said) |",
    "|---|---|---|---|---|",
    perClass,
    "",
    `Not compared: ${skipped.none} with no words tapped, ${skipped.unmapped} with only worried/scared, ` +
      `${skipped.mixed} with words pointing to different emotions, ${skipped.noAi} with no AI reading.`,
    "",
  ].join("\n");
}

function moodSection(mood) {
  const byMood = (side) =>
    side.byMood
      .map((g) => `| ${g.mood} | ${g.sessions} | ${g.meanNegativeShare === null ? "—" : `${g.meanNegativeShare.toFixed(1)}%`} |`)
      .join("\n");
  return [
    "## Mood check vs the AI (per session)",
    "",
    "Mood: 1 = very bad … 5 = very good. *Sad/Angry share* = % of the session's answers the AI read as Sad or Angry. " +
      "If the AI agrees with patients, a lower mood goes with a higher Sad/Angry share — a **negative** correlation.",
    "",
    `Sessions with a mood check: **${mood.sessionsWithMood}**`,
    "",
    "| | Sessions | Spearman ρ (mood vs Sad/Angry share) |",
    "|---|---|---|",
    `| Mood before | ${mood.before.n} | ${num(mood.before.spearman)} |`,
    `| Mood after | ${mood.after.n} | ${num(mood.after.spearman)} |`,
    "",
    "**Mood before → average Sad/Angry share**",
    "",
    "| Mood | Sessions | Avg Sad/Angry share |",
    "|---|---|---|",
    byMood(mood.before),
    "",
    `**Mood change** (${mood.change.n} sessions with both): ${mood.change.better} felt better after, ` +
      `${mood.change.same} the same, ${mood.change.worse} worse.`,
    "",
  ].join("\n");
}

function buildMarkdown(result) {
  const mapping = Object.entries(FEELING_TO_EMOTION)
    .map(([word, emotion]) => `${word} → ${emotion ?? "(no AI match)"}`)
    .join(", ");
  const counts = Object.entries(result.feelingCounts)
    .map(([word, n]) => `${word} ${n}`)
    .join(" · ");
  return [
    "# Agreement with patients' self-report",
    "",
    `Generated ${result.generatedAt} from ${result.sessions} session(s)` +
      `${result.therapistId ? ` of therapist #${result.therapistId}` : ""}. ` +
      "The patient's report is the reference; this measures **agreement**, not ground-truth accuracy — " +
      "people don't always tap the feeling the AI could see or hear, and the feeling words are a coarse match for the 4 emotions.",
    "",
    "## Feeling words vs the AI (per question)",
    "",
    `Feeling word → emotion used: ${mapping}. A question is compared when its tapped words point to exactly one emotion.`,
    "",
    `Feeling words tapped: ${counts}`,
    "",
    modelSection("Fused result (face + voice) — what the therapist sees", result.questions.fusion),
    modelSection("Face model (FER) alone", result.questions.fer),
    modelSection("Voice model (SER) alone", result.questions.ser),
    moodSection(result.mood),
  ].join("\n");
}

async function main() {
  const { therapistId } = parseArgs(process.argv.slice(2));
  const { rows: sessions } = await db.query(
    `SELECT session_id, transcript, emotion_summary FROM sessions
     WHERE ($1::int IS NULL OR therapist_id = $1::int)
     ORDER BY session_id`,
    [therapistId],
  );

  const question = (model) => {
    const { pairs, skipped } = collectQuestionPairs(sessions, model);
    return { metrics: agreementMetrics(pairs, EMOTIONS), skipped };
  };
  const result = {
    generatedAt: new Date().toISOString(),
    therapistId,
    sessions: sessions.length,
    feelingCounts: feelingCounts(sessions),
    questions: { fusion: question("fusion"), fer: question("fer"), ser: question("ser") },
    mood: moodAgreement(sessions),
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "self_report_results.json"), JSON.stringify(result, null, 2));
  await writeFile(path.join(OUT_DIR, "self_report_results.md"), buildMarkdown(result));

  const f = result.questions.fusion.metrics;
  console.log(`Sessions: ${result.sessions}`);
  console.log(`Questions compared (feeling words): ${f.n} · agreement ${pct(f.accuracy)} · macro F1 ${num(f.macroF1)} · kappa ${num(f.kappa)}`);
  console.log(`Sessions with a mood check: ${result.mood.sessionsWithMood} · Spearman (mood before vs Sad/Angry share) ${num(result.mood.before.spearman)}`);
  if (f.n < 30) console.log("Note: fewer than 30 compared questions — treat these numbers as preliminary.");
  console.log(`Report: ${path.join(OUT_DIR, "self_report_results.md")}`);
}

main()
  .catch((err) => {
    console.error(`Evaluation failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.end());
