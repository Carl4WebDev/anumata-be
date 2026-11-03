/**
 * Sends an email through EmailJS's REST API, from the server.
 *
 * Needs these in .env (EmailJS dashboard):
 *   EMAILJS_SERVICE_ID   Email Services → your Gmail service
 *   EMAILJS_TEMPLATE_ID  Email Templates → the reminder template
 *   EMAILJS_PUBLIC_KEY   Account → General → Public Key
 *   EMAILJS_PRIVATE_KEY  Account → General → Private Key
 * and, in Account → Security, "Allow EmailJS API for non-browser applications" turned on.
 */

const EMAILJS_URL = "https://api.emailjs.com/api/v1.0/email/send";
const TIMEOUT_MS = 15000;

const config = () => ({
  serviceId: process.env.EMAILJS_SERVICE_ID,
  templateId: process.env.EMAILJS_TEMPLATE_ID,
  publicKey: process.env.EMAILJS_PUBLIC_KEY,
  privateKey: process.env.EMAILJS_PRIVATE_KEY,
});

/** All four EmailJS settings are present. */
export function isEmailConfigured() {
  const c = config();
  return Boolean(c.serviceId && c.templateId && c.publicKey && c.privateKey);
}

/**
 * @param {Record<string, string>} templateParams
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>} never throws
 */
export async function sendEmail(templateParams, fetchImpl = fetch) {
  const c = config();
  try {
    const res = await fetchImpl(EMAILJS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: c.serviceId,
        template_id: c.templateId,
        user_id: c.publicKey,
        accessToken: c.privateKey,
        template_params: templateParams,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return { ok: true };
    const text = await res.text().catch(() => "");
    return { ok: false, error: `EmailJS ${res.status}: ${text}`.slice(0, 500) };
  } catch (err) {
    return { ok: false, error: `EmailJS unreachable: ${err?.message ?? err}`.slice(0, 500) };
  }
}
