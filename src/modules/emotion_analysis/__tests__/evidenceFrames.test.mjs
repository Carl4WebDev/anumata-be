import { describe, test, expect } from "vitest";
import { pickEvidenceFrames, summarizeFaceFrames, MAX_STORED_FRAMES } from "../application/evidenceFrames.js";

const frames = (n) => Array.from({ length: n }, (_, i) => `img${i}`);
const fer = (confidences) => confidences.map((confidence, frame_index) => ({ frame_index, emotion: "Sad", confidence }));

describe("pickEvidenceFrames", () => {
  test("keeps every frame when there are only a few", () => {
    const picked = pickEvidenceFrames(frames(3), fer([0.2, 0.9, 0.5]), 1);
    expect(picked.map((f) => f.frame_image)).toEqual(["img0", "img1", "img2"]);
    expect(picked[1]).toEqual({ frame_image: "img1", fer_emotion: "Sad", fer_confidence: 0.9 });
  });

  test("keeps only a few frames: the best one plus the most confident others, in time order", () => {
    const picked = pickEvidenceFrames(frames(8), fer([0.1, 0.8, 0.2, 0.3, 0.95, 0.05, 0.7, 0.4]), 2);
    expect(picked).toHaveLength(MAX_STORED_FRAMES);
    expect(picked.map((f) => f.frame_image)).toEqual(["img1", "img2", "img4", "img6"]);
  });

  test("frames without an AI result still work", () => {
    const picked = pickEvidenceFrames(frames(2), [], 0);
    expect(picked).toEqual([
      { frame_image: "img0", fer_emotion: null, fer_confidence: 0 },
      { frame_image: "img1", fer_emotion: null, fer_confidence: 0 },
    ]);
  });

  test("no frames gives an empty list", () => {
    expect(pickEvidenceFrames([], [], 0)).toEqual([]);
  });
});

describe("summarizeFaceFrames", () => {
  const frame = (frame_index, emotion) => ({ frame_index, emotion, confidence: 0.5 });

  test("counts each emotion over all frames and how often the reading changed", () => {
    const summary = summarizeFaceFrames([frame(0, "Sad"), frame(1, "Sad"), frame(2, "Neutral"), frame(3, "Sad"), frame(4, "Happy")]);
    expect(summary).toEqual({ analysed: 5, face_found: 5, counts: { Sad: 3, Neutral: 1, Happy: 1 }, changes: 3 });
  });

  test("frames with no face are counted as checked but not read", () => {
    const summary = summarizeFaceFrames([frame(0, "NoFace"), frame(1, "Sad"), frame(2, "Unknown"), frame(3, "Sad")]);
    expect(summary).toEqual({ analysed: 4, face_found: 2, counts: { Sad: 2 }, changes: 0 });
  });

  test("uses capture order, not the order results arrived in", () => {
    expect(summarizeFaceFrames([frame(2, "Sad"), frame(0, "Sad"), frame(1, "Happy")]).changes).toBe(2);
  });

  test("no frames gives nothing", () => {
    expect(summarizeFaceFrames([])).toBeNull();
    expect(summarizeFaceFrames(undefined)).toBeNull();
  });
});
