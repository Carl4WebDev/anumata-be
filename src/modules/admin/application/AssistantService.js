import AppError from "../../../core/errors/AppError.js";
import ValidationError from "../../../core/errors/ValidationError.js";
import { AI_SERVICE_URL, aiServiceHeaders } from "../../../core/http/aiService.js";

/**
 * "Ask Amumata" (admin): forwards a question and the matching info-page
 * entries (found in the browser) to Llama on the AI service. System
 * documentation only — nothing is saved, and no patient data is involved.
 */

export const ASK_LIMITS = Object.freeze({
  question: 500,
  passages: 8,
  source: 100,
  title: 300,
  text: 1500,
  totalText: 6000,
});

// The AI may need 1–3 minutes to wake up on Modal, then ~10–30 s to answer.
const ANSWER_TIMEOUT_MS = 4 * 60 * 1000;

const isText = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max;

function cleanPassage(passage, index) {
  const { source, title, text } = passage ?? {};
  if (!isText(source, ASK_LIMITS.source) || !isText(title, ASK_LIMITS.title) || !isText(text, ASK_LIMITS.text)) {
    throw new ValidationError("Each entry needs a source, title and text within the size limits.", { passage: index });
  }
  return { source, title, text };
}

/** The question and entries, checked and trimmed to what the AI service accepts. */
export function validateAsk(body) {
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question || question.length > ASK_LIMITS.question) {
    throw new ValidationError(`Ask a question of 1 to ${ASK_LIMITS.question} characters.`);
  }
  const raw = Array.isArray(body?.passages) ? body.passages : [];
  if (raw.length > ASK_LIMITS.passages) {
    throw new ValidationError(`Send at most ${ASK_LIMITS.passages} entries.`);
  }
  const passages = raw.map(cleanPassage);
  if (passages.reduce((sum, p) => sum + p.text.length, 0) > ASK_LIMITS.totalText) {
    throw new ValidationError("The entries are too long in total.");
  }
  return { question, passages };
}

export default class AssistantService {
  constructor({ fetchImpl = globalThis.fetch, baseUrl = AI_SERVICE_URL, headers = aiServiceHeaders, timeoutMs = ANSWER_TIMEOUT_MS } = {}) {
    this.fetch = fetchImpl;
    this.baseUrl = baseUrl;
    this.headers = headers;
    this.timeoutMs = timeoutMs;
  }

  async ask(body) {
    const { question, passages } = validateAsk(body);
    let data;
    try {
      const response = await this.fetch(`${this.baseUrl}/api/assistant/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...this.headers() },
        body: JSON.stringify({ question, passages }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      data = response.ok ? await response.json() : null;
    } catch (err) {
      console.error("[Assistant] AI service unreachable:", err?.name ?? err?.message);
      data = null;
    }
    if (!data?.ok) {
      throw new AppError(
        "The AI couldn't answer right now. The matching entries are shown below — try again in a minute.",
        503,
        "ASSISTANT_UNAVAILABLE",
      );
    }
    return { answer: data.answer, found: Boolean(data.found), sources: Array.isArray(data.sources) ? data.sources : [] };
  }
}
