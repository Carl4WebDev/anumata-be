import NotFoundError from "../../../core/errors/NotFoundError.js";
import ValidationError from "../../../core/errors/ValidationError.js";

export const LANGS = ["tl", "ceb"];
const MAX_TRANSLATION = 1000;

/** The English texts a question set asks: each question and its follow-up, without repeats. */
export function textsOf(questions) {
  const texts = [];
  for (const q of Array.isArray(questions) ? questions : []) {
    const text = typeof q === "string" ? q : q?.text;
    const followUp = typeof q === "object" && q ? q.follow_up : null;
    for (const t of [text, followUp]) {
      if (typeof t === "string" && t.trim() && !texts.includes(t.trim())) texts.push(t.trim());
    }
  }
  return texts;
}

function langOf(lang) {
  if (!LANGS.includes(lang)) throw new ValidationError("Language must be tl (Tagalog) or ceb (Bisaya).");
  return lang;
}

/**
 * Saved translations of interview questions. The interview room loads them at
 * once when the patient's language is known; questions without one are
 * translated by the AI during the interview and saved for next time.
 * Therapists review and edit them per question set.
 */
export default class TranslationService {
  /**
   * @param repo TranslationRepo
   * @param links InterviewLinkRepo (findByToken)
   * @param sets QuestionSetRepo (findById)
   * @param translate (text, lang) => Promise<string|null> — the AI translator
   */
  constructor(repo, links, sets, translate) {
    this.repo = repo;
    this.links = links;
    this.sets = sets;
    this.translate = translate;
  }

  async linkFor(token) {
    const link = typeof token === "string" ? await this.links.findByToken(token) : null;
    if (!link || link.status === "expired") throw new NotFoundError("Interview link not found or expired");
    return link;
  }

  /** For the interview room: { english text: translation } in one language. */
  async forInterview(token, lang) {
    const link = await this.linkFor(token);
    const rows = await this.repo.best(link.therapist_id, textsOf(link.questions), [langOf(lang)]);
    return Object.fromEntries(rows.map((r) => [r.source_text, r.translated_text]));
  }

  /** For the interview room: translate one of the link's questions with the AI, and keep it. */
  async translateForInterview(token, text, lang) {
    const link = await this.linkFor(token);
    langOf(lang);
    const source = typeof text === "string" ? text.trim() : "";
    // Only this interview's own questions — the endpoint is public.
    if (!textsOf(link.questions).includes(source)) throw new ValidationError("Not a question of this interview.");

    const [saved] = await this.repo.best(link.therapist_id, [source], [lang]);
    if (saved) return { translated: saved.translated_text, source: saved.source };

    const translated = await this.translate(source, lang);
    if (!translated) return { translated: null, source: null };
    await this.repo.saveMachine(link.therapist_id, source, lang, translated);
    return { translated, source: "machine" };
  }

  async ownSet(therapistId, setId) {
    const set = await this.sets.findById(Number(setId));
    if (!set || Number(set.therapist_id) !== Number(therapistId)) throw new NotFoundError("Question set not found");
    return set;
  }

  /** For the therapist: each question of the set with its Tagalog and Bisaya translations (or none yet). */
  async forQuestionSet(therapistId, setId) {
    const set = await this.ownSet(therapistId, setId);
    const texts = textsOf(set.questions);
    const rows = await this.repo.best(therapistId, texts);
    const pick = (text, lang) => {
      const r = rows.find((row) => row.source_text === text && row.lang === lang);
      return r ? { text: r.translated_text, source: r.source, own: r.own } : null;
    };
    const followUps = new Set(
      (Array.isArray(set.questions) ? set.questions : []).map((q) => (typeof q === "object" && q ? q.follow_up?.trim() : null)),
    );
    return texts.map((text) => ({
      source_text: text,
      kind: followUps.has(text) ? "follow_up" : "question",
      tl: pick(text, "tl"),
      ceb: pick(text, "ceb"),
    }));
  }

  /** The therapist saves (or clears) their translation of one of the set's questions. */
  async saveForQuestionSet(therapistId, setId, { source_text, lang, translated_text }) {
    const set = await this.ownSet(therapistId, setId);
    langOf(lang);
    const source = typeof source_text === "string" ? source_text.trim() : "";
    if (!textsOf(set.questions).includes(source)) throw new ValidationError("That question isn't in this set.");
    const translated = typeof translated_text === "string" ? translated_text.trim() : "";
    if (translated.length > MAX_TRANSLATION) throw new ValidationError(`Translation must not exceed ${MAX_TRANSLATION} characters.`);

    if (translated) await this.repo.saveReviewed(therapistId, source, lang, translated);
    else await this.repo.removeOwn(therapistId, source, lang);
    return this.forQuestionSet(therapistId, setId);
  }
}
