import http from "node:http";
import https from "node:https";

/**
 * POST multipart form data and wait for the response with NO time limit.
 *
 * Node's built-in fetch abandons any response that takes longer than 300 s
 * (undici's headersTimeout) — long interviews take longer than that to
 * analyse. node:http has no response timeout unless one is set.
 *
 * @param {string} url
 * @param {FormData} formData
 * @returns {Promise<{ ok: boolean, status: number, text: string }>}
 */
export async function postFormData(url, formData) {
  // Let the platform encode the multipart body (boundary + content-type).
  const encoded = new Request(url, { method: "POST", body: formData });
  const body = Buffer.from(await encoded.arrayBuffer());
  const target = new URL(url);
  const client = target.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      target,
      {
        method: "POST",
        headers: { "content-type": encoded.headers.get("content-type"), "content-length": body.length },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          resolve({ ok: status >= 200 && status < 300, status, text: Buffer.concat(chunks).toString("utf8") });
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}
