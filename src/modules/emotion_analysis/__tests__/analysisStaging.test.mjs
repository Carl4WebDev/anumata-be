import { describe, test, expect } from "vitest";
import { createStagingStore, mergeFiles } from "../application/analysisStaging.js";

const file = (name, text = "x") => ({ originalname: name, mimetype: "application/octet-stream", buffer: Buffer.from(text) });

describe("early-upload staging", () => {
  test("keeps each answer's files until the analysis collects them", () => {
    const store = createStagingStore();
    expect(store.add("tok", [file("audio_0.webm"), file("frame_0_0.jpg")])).toEqual({ ok: true, count: 2 });
    expect(store.add("tok", [file("audio_1.webm")])).toEqual({ ok: true, count: 3 });

    const { files, missing } = store.collect("tok", ["audio_0.webm", "audio_1.webm"]);
    expect(files.map((f) => f.originalname)).toEqual(["audio_0.webm", "audio_1.webm"]);
    expect(missing).toEqual([]);
  });

  test("reports files that are no longer here (server restart / expiry)", () => {
    let now = 0;
    const store = createStagingStore({ now: () => now });
    store.add("tok", [file("audio_0.webm")]);
    now = 3 * 60 * 60 * 1000;
    expect(store.collect("tok", ["audio_0.webm"]).missing).toEqual(["audio_0.webm"]);
  });

  test("rejects unexpected names and keeps interviews apart", () => {
    const store = createStagingStore();
    expect(store.add("tok", [file("../etc/passwd")]).ok).toBe(false);
    store.add("a", [file("audio_0.webm")]);
    expect(store.collect("b", ["audio_0.webm"]).missing).toEqual(["audio_0.webm"]);
  });

  test("clear drops everything for an interview", () => {
    const store = createStagingStore();
    store.add("tok", [file("audio_0.webm")]);
    store.clear("tok");
    expect(store.collect("tok", ["audio_0.webm"]).files).toEqual([]);
  });

  test("an uploaded file replaces the staged copy with the same name", () => {
    const merged = mergeFiles([file("audio_0.webm", "old"), file("audio_1.webm")], [file("audio_0.webm", "new")]);
    expect(merged).toHaveLength(2);
    expect(merged.find((f) => f.originalname === "audio_0.webm").buffer.toString()).toBe("new");
  });
});
