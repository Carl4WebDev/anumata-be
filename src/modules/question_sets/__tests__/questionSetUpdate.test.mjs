import { describe, test, expect, vi, beforeEach } from "vitest";

const client = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
const db = vi.hoisted(() => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
vi.mock("../../../core/database/db.js", () => ({ default: db }));

const { default: QuestionSetRepo } = await import("../infrastructure/QuestionSetRepo.js");

const SAVED = { question_set_id: 7, name: "School", questions: [{ text: "Q1", order: 0 }] };

beforeEach(() => {
  vi.clearAllMocks();
  db.pool.connect.mockResolvedValue(client);
  client.query.mockImplementation(async (sql) => (sql.startsWith("UPDATE") ? { rows: [SAVED] } : { rows: [] }));
  db.query.mockResolvedValue({ rows: [SAVED] });
});

const sqlOf = (mock) => mock.mock.calls.map(([sql]) => sql.trim().split(/\s+/).slice(0, 3).join(" "));

describe("QuestionSetRepo.update", () => {
  test("saving the questions of a set built from the question bank replaces its items, in one transaction", async () => {
    const result = await new QuestionSetRepo().update(7, { name: "School", questions: [{ text: "Q1", order: 0 }] });

    expect(result).toEqual(SAVED);
    expect(sqlOf(client.query)).toEqual(["BEGIN", "UPDATE question_sets SET", "DELETE FROM question_set_items", "COMMIT"]);
    expect(client.query.mock.calls[2][1]).toEqual([7]);
    expect(client.release).toHaveBeenCalled();
  });

  test("if anything fails, nothing is changed", async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.startsWith("DELETE")) throw new Error("db down");
      return { rows: [SAVED] };
    });

    await expect(new QuestionSetRepo().update(7, { questions: [{ text: "Q1", order: 0 }] })).rejects.toThrow("db down");
    expect(sqlOf(client.query)).toContain("ROLLBACK");
    expect(sqlOf(client.query)).not.toContain("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });

  test("renaming only leaves the questions and items alone", async () => {
    await new QuestionSetRepo().update(7, { name: "New name" });

    expect(db.pool.connect).not.toHaveBeenCalled();
    expect(db.query.mock.calls[0][0]).not.toMatch(/question_set_items/);
    expect(db.query.mock.calls[0][0]).not.toMatch(/questions =/);
  });
});
