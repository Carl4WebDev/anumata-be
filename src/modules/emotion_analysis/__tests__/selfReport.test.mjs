import { describe, test, expect } from "vitest";
import { parseSelfReport } from "../application/selfReport.js";

describe("parseSelfReport", () => {
  test("keeps moods from 1 to 5", () => {
    expect(parseSelfReport(JSON.stringify({ mood_before: 2, mood_after: 4 }))).toEqual({ mood_before: 2, mood_after: 4 });
  });

  test("a skipped or invalid mood is null", () => {
    expect(parseSelfReport(JSON.stringify({ mood_before: 3, mood_after: null }))).toEqual({ mood_before: 3, mood_after: null });
    expect(parseSelfReport(JSON.stringify({ mood_before: 9, mood_after: "4" }))).toBeNull();
    expect(parseSelfReport(JSON.stringify({ mood_before: 2.5, mood_after: 1 }))).toEqual({ mood_before: null, mood_after: 1 });
  });

  test("nothing usable gives null, never an error", () => {
    expect(parseSelfReport(undefined)).toBeNull();
    expect(parseSelfReport("")).toBeNull();
    expect(parseSelfReport("not json")).toBeNull();
    expect(parseSelfReport("[1,2]")).toBeNull();
  });
});
