import { describe, test, expect, vi } from "vitest";
import SessionService from "../application/SessionService.js";

const SESSION = { session_id: 5, therapist_id: 3, interview_link_id: 7 };
const MESSAGES = [
  { message_id: 1, sender: "therapist", kind: "pause", body: null, question_index: 2, seen_at: null, created_at: "2026-11-15T02:30:00Z" },
  { message_id: 2, sender: "therapist", kind: "message", body: "I'm here.", question_index: 2, seen_at: "2026-11-15T02:30:05Z", created_at: "2026-11-15T02:30:02Z" },
];

const service = (messageRepo) => new SessionService({ findById: vi.fn().mockResolvedValue(SESSION) }, {}, messageRepo);

describe("session details include the live conversation", () => {
  test("what the therapist and patient said during the interview comes with the session", async () => {
    const listByLink = vi.fn().mockResolvedValue(MESSAGES);
    const session = await service({ listByLink }).getById(3, 5);
    expect(listByLink).toHaveBeenCalledWith(7);
    expect(session.live_messages).toEqual(MESSAGES);
    expect(session.session_id).toBe(5);
  });

  test("the report still opens if the conversation can't be loaded", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const session = await service({ listByLink: vi.fn().mockRejectedValue(new Error("relation does not exist")) }).getById(3, 5);
    expect(session.live_messages).toEqual([]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  test("another therapist's session is still refused", async () => {
    const listByLink = vi.fn();
    await expect(service({ listByLink }).getById(4, 5)).rejects.toThrow("Access denied");
    expect(listByLink).not.toHaveBeenCalled();
  });
});
