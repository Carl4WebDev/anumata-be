import { describe, test, expect } from "vitest";
import http from "node:http";
import { postJson } from "../httpPost.js";

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
