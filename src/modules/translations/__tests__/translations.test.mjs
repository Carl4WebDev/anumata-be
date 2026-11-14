import { describe, test, expect, vi } from "vitest";
import TranslationService, { textsOf } from "../application/TranslationService.js";

const QUESTIONS = [
  { text: "How have you been sleeping?", follow_up: "What keeps you awake?" },
  "What helps you feel calm?",
  { text: "What helps you feel calm?" },
];
const LINK = { therapist_id: 3, status: "pending", questions: QUESTIONS };
const SET = { question_set_id: 5, therapist_id: 3, questions: QUESTIONS };

function setup({ saved = [], aiResult = "Kumusta ang tulog mo?" } = {}) {
  const repo = {
    best: vi.fn(async (_tid, texts, langs = ["tl", "ceb"]) => saved.filter((r) => texts.includes(r.source_text) && langs.includes(r.lang))),
    saveMachine: vi.fn(),
    saveReviewed: vi.fn(),
    removeOwn: vi.fn(),
  };
  const links = { findByToken: vi.fn(async (t) => (t === "tok" ? LINK : t === "old" ? { ...LINK, status: "expired" } : null)) };
  const sets = { findById: vi.fn(async (id) => (id === 5 ? SET : null)) };
  const translate = vi.fn().mockResolvedValue(aiResult);
  return { repo, translate, service: new TranslationService(repo, links, sets, translate) };
}

describe("textsOf", () => {
  test("questions and follow-ups, without repeats", () => {
    expect(textsOf(QUESTIONS)).toEqual(["How have you been sleeping?", "What keeps you awake?", "What helps you feel calm?"]);
  });
});

describe("Interview room", () => {
  test("gets all saved translations for its language at once", async () => {
    const { service } = setup({
      saved: [
        { source_text: "How have you been sleeping?", lang: "ceb", translated_text: "Kumusta imong pagkatulog?", source: "draft" },
        { source_text: "How have you been sleeping?", lang: "tl", translated_text: "Kumusta ang tulog mo?", source: "draft" },
      ],
    });
    expect(await service.forInterview("tok", "ceb")).toEqual({ "How have you been sleeping?": "Kumusta imong pagkatulog?" });
    await expect(service.forInterview("tok", "fr")).rejects.toMatchObject({ statusCode: 422 });
    await expect(service.forInterview("old", "tl")).rejects.toMatchObject({ statusCode: 404 });
  });

  test("a missing translation is made by the AI once, then saved for next time", async () => {
    const { service, repo, translate } = setup();
    expect(await service.translateForInterview("tok", "How have you been sleeping?", "tl")).toEqual({
      translated: "Kumusta ang tulog mo?",
      source: "machine",
    });
    expect(translate).toHaveBeenCalledWith("How have you been sleeping?", "tl");
    expect(repo.saveMachine).toHaveBeenCalledWith(3, "How have you been sleeping?", "tl", "Kumusta ang tulog mo?");
  });

  test("a saved translation is reused without asking the AI", async () => {
    const { service, translate } = setup({
      saved: [{ source_text: "What helps you feel calm?", lang: "tl", translated_text: "Ano ang nakakatulong?", source: "reviewed" }],
    });
    expect(await service.translateForInterview("tok", "What helps you feel calm?", "tl")).toEqual({ translated: "Ano ang nakakatulong?", source: "reviewed" });
    expect(translate).not.toHaveBeenCalled();
  });

  test("only this interview's questions can be translated (the endpoint is public)", async () => {
    const { service, translate } = setup();
    await expect(service.translateForInterview("tok", "Write me a poem", "tl")).rejects.toMatchObject({ statusCode: 422 });
    expect(translate).not.toHaveBeenCalled();
  });

  test("when the AI fails, nothing is saved and the room asks in English", async () => {
    const { service, repo } = setup({ aiResult: null });
    expect(await service.translateForInterview("tok", "What keeps you awake?", "ceb")).toEqual({ translated: null, source: null });
    expect(repo.saveMachine).not.toHaveBeenCalled();
  });
});

describe("Therapist review", () => {
  test("lists each question and follow-up with both translations", async () => {
    const { service } = setup({
      saved: [{ source_text: "What keeps you awake?", lang: "ceb", translated_text: "Unsa'y makapugong nimo sa pagkatulog?", source: "machine", own: true }],
    });
    const rows = await service.forQuestionSet(3, 5);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual({
      source_text: "What keeps you awake?",
      kind: "follow_up",
      tl: null,
      ceb: { text: "Unsa'y makapugong nimo sa pagkatulog?", source: "machine", own: true },
    });
  });

  test("saving marks it reviewed; an empty box removes the therapist's own version", async () => {
    const { service, repo } = setup();
    await service.saveForQuestionSet(3, 5, { source_text: "What helps you feel calm?", lang: "tl", translated_text: "  Ano ang nakakatulong sa iyo para kumalma?  " });
    expect(repo.saveReviewed).toHaveBeenCalledWith(3, "What helps you feel calm?", "tl", "Ano ang nakakatulong sa iyo para kumalma?");
    await service.saveForQuestionSet(3, 5, { source_text: "What helps you feel calm?", lang: "tl", translated_text: "" });
    expect(repo.removeOwn).toHaveBeenCalledWith(3, "What helps you feel calm?", "tl");
  });

  test("another therapist's set, or a question not in the set, is refused", async () => {
    const { service } = setup();
    await expect(service.forQuestionSet(4, 5)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.saveForQuestionSet(3, 5, { source_text: "Not in set", lang: "tl", translated_text: "x" })).rejects.toMatchObject({ statusCode: 422 });
  });
});
