import { describe, test, expect } from "vitest";
import http from "node:http";
import { postFormData, postJson } from "../httpPost.js";

function serverReplyingAfter(ms, handler) {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const timer = setTimeout(() => handler(req, Buffer.concat(chunks).toString("utf8"), res), ms);
      res.on("close", () => clearTimeout(timer));
    });
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}
const urlOf = (server) => `http://127.0.0.1:${server.address().port}/`;

describe("postJson", () => {
  test("sends JSON and returns status and body text", async () => {
    const server = await serverReplyingAfter(0, (req, body, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: req.headers["content-type"], got: JSON.parse(body) }));
    });
    const res = await postJson(urlOf(server), { sessions: [1] });
    server.close();
    expect(res.ok).toBe(true);
    expect(JSON.parse(res.text)).toEqual({ type: "application/json", got: { sessions: [1] } });
  });

  test("reports server errors without throwing", async () => {
    const server = await serverReplyingAfter(0, (_req, _body, res) => {
      res.writeHead(503);
      res.end("Ollama is off");
    });
    const res = await postJson(urlOf(server), {});
    server.close();
    expect(res).toEqual({ ok: false, status: 503, text: "Ollama is off" });
  });

  test("waits for a slow reply that is within the limit", async () => {
    const server = await serverReplyingAfter(300, (_req, _body, res) => res.end("done"));
    const res = await postJson(urlOf(server), {}, { timeoutMs: 2000 });
    server.close();
    expect(res.text).toBe("done");
  });

  test("gives up once the time limit passes", async () => {
    const server = await serverReplyingAfter(5000, (_req, _body, res) => res.end("too late"));
    const err = await postJson(urlOf(server), {}, { timeoutMs: 200 }).catch((e) => e);
    server.close();
    expect(err.code).toBe("REQUEST_TIMEOUT");
  });
});

describe("Modal's long-request redirect (303 → result URL)", () => {
  /** First answers 303 to /result, then serves the result (to GET) — like Modal after 150 s. */
  function modalLikeServer({ hops = 1, result = '{"ok":true}' } = {}) {
    const seen = [];
    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        seen.push({ method: req.method, url: req.url, key: req.headers["modal-key"], secret: req.headers["modal-secret"] });
        const hop = seen.length;
        if (hop <= hops) {
          res.writeHead(303, { location: `/result?call=abc&hop=${hop}` });
          return res.end();
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(result);
      });
    });
    return new Promise((resolve) => server.listen(0, () => resolve({ server, seen })));
  }
  const auth = { "Modal-Key": "wk-123", "Modal-Secret": "ws-456" };

  test("follows the redirect with GET and returns the final result", async () => {
    const { server, seen } = await modalLikeServer({ hops: 2 });
    const res = await postJson(urlOf(server) + "api/analyze", { a: 1 }, { headers: auth });
    server.close();
    expect(res).toEqual({ ok: true, status: 200, text: '{"ok":true}' });
    expect(seen.map((s) => s.method)).toEqual(["POST", "GET", "GET"]);
    expect(seen[1].url).toBe("/result?call=abc&hop=1");
  });

  test("sends the password headers on the first request and every redirect", async () => {
    const { server, seen } = await modalLikeServer({ hops: 1 });
    const form = new FormData();
    form.append("x", "1");
    await postFormData(urlOf(server), form, { headers: auth });
    server.close();
    expect(seen.every((s) => s.key === "wk-123" && s.secret === "ws-456")).toBe(true);
  });

  test("gives up after too many redirects instead of looping forever", async () => {
    const { server } = await modalLikeServer({ hops: 1000 });
    const err = await postJson(urlOf(server), {}).catch((e) => e);
    server.close();
    expect(err.code).toBe("TOO_MANY_REDIRECTS");
  });
});
