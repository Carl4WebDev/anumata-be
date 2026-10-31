import http from "node:http";
import https from "node:https";

/**
 * POST helpers for slow calls to the AI service.
 *
 * Node's built-in fetch abandons any response that takes longer than 300 s
 * (undici's headersTimeout) — long interviews and AI reports can take longer.
 * node:http has no response timeout unless we set one, so we choose it here:
 * none for the interview analysis, an explicit limit for the AI reports.
 *
 * Both resolve with { ok, status, text } (server errors don't throw) and
 * reject only on network failure or when `timeoutMs` passes.
 */

function sendPost(url, body, contentType, timeoutMs) {
  const target = new URL(url);
  const client = target.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      target,
      { method: "POST", headers: { "content-type": contentType, "content-length": body.length } },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          clearTimeout(timer);
          const status = res.statusCode ?? 0;
          resolve({ ok: status >= 200 && status < 300, status, text: Buffer.concat(chunks).toString("utf8") });
        });
        res.on("error", reject);
      },
    );
    // Overall limit (not an idle timeout: the AI service is silent until it's done).
    const timer = timeoutMs
      ? setTimeout(() => {
          const err = Object.assign(new Error(`No reply from ${target.host} within ${Math.round(timeoutMs / 1000)}s`), {
            code: "REQUEST_TIMEOUT",
          });
          req.destroy(err);
        }, timeoutMs)
      : null;
    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.end(body);
  });
}

/**
 * POST multipart form data and wait for the response with NO time limit.
 * @param {string} url
 * @param {FormData} formData
 * @returns {Promise<{ ok: boolean, status: number, text: string }>}
 */
export async function postFormData(url, formData) {
  // Let the platform encode the multipart body (boundary + content-type).
  const encoded = new Request(url, { method: "POST", body: formData });
  const body = Buffer.from(await encoded.arrayBuffer());
  return sendPost(url, body, encoded.headers.get("content-type"), null);
}

/**
 * POST JSON, waiting up to `timeoutMs` (default: no limit).
 * @param {string} url
 * @param {unknown} data
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, status: number, text: string }>}
 */
export function postJson(url, data, { timeoutMs = null } = {}) {
  return sendPost(url, Buffer.from(JSON.stringify(data)), "application/json", timeoutMs);
}
