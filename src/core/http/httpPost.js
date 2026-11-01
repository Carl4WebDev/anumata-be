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
 * Modal answers a request that runs past 150 s with a 303 redirect to a
 * "result URL"; fetching that URL waits for the result (and may redirect
 * again). Both helpers follow those redirects, sending the same headers.
 *
 * Both resolve with { ok, status, text } (server errors don't throw) and
 * reject only on network failure, too many redirects, or when `timeoutMs`
 * passes (counted over the whole exchange, redirects included).
 */

// Modal redirects every 150 s: 40 hops ≈ 100 minutes, far beyond any analysis.
const MAX_REDIRECTS = 40;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function codedError(message, code) {
  return Object.assign(new Error(message), { code });
}

/** One HTTP request; resolves with the status, the Location header, and the body. */
function request(url, { method, headers, body }, deadline) {
  const target = new URL(url);
  const client = target.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(target, { method, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        clearTimeout(timer);
        resolve({ status: res.statusCode ?? 0, location: res.headers.location, text: Buffer.concat(chunks).toString("utf8") });
      });
      res.on("error", reject);
    });
    // Overall limit (not an idle timeout: the AI service is silent until it's done).
    const timer =
      deadline === null
        ? null
        : setTimeout(() => {
            req.destroy(codedError(`No reply from ${target.host} in time`, "REQUEST_TIMEOUT"));
          }, Math.max(0, deadline - Date.now()));
    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.end(body);
  });
}

async function sendPost(url, body, contentType, { timeoutMs = null, headers = {} } = {}) {
  const deadline = timeoutMs ? Date.now() + timeoutMs : null;
  const post = { method: "POST", headers: { ...headers, "content-type": contentType, "content-length": body.length }, body };
  let res = await request(url, post, deadline);

  for (let hops = 0; REDIRECTS.has(res.status) && res.location; hops++) {
    if (hops >= MAX_REDIRECTS) throw codedError(`Too many redirects from ${new URL(url).host}`, "TOO_MANY_REDIRECTS");
    url = new URL(res.location, url).href;
    // 307/308 repeat the POST; 303 (Modal's result URL) and the rest fetch with GET.
    res = await request(url, res.status === 307 || res.status === 308 ? post : { method: "GET", headers }, deadline);
  }
  return { ok: res.status >= 200 && res.status < 300, status: res.status, text: res.text };
}

/**
 * POST multipart form data and wait for the response with NO time limit.
 * @param {string} url
 * @param {FormData} formData
 * @param {{ headers?: Record<string, string> }} [options]
 * @returns {Promise<{ ok: boolean, status: number, text: string }>}
 */
export async function postFormData(url, formData, { headers = {} } = {}) {
  // Let the platform encode the multipart body (boundary + content-type).
  const encoded = new Request(url, { method: "POST", body: formData });
  const body = Buffer.from(await encoded.arrayBuffer());
  return sendPost(url, body, encoded.headers.get("content-type"), { headers });
}

/**
 * POST JSON, waiting up to `timeoutMs` (default: no limit).
 * @param {string} url
 * @param {unknown} data
 * @param {{ timeoutMs?: number, headers?: Record<string, string> }} [options]
 * @returns {Promise<{ ok: boolean, status: number, text: string }>}
 */
export function postJson(url, data, { timeoutMs = null, headers = {} } = {}) {
  return sendPost(url, Buffer.from(JSON.stringify(data)), "application/json", { timeoutMs, headers });
}
