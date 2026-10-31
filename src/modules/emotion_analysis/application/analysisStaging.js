/**
 * Early upload ("work ahead"): the interview room sends each answer's
 * recordings while the patient moves on to the next question. When the
 * interview ends only the last answer is left to upload, so analysis can
 * start almost at once.
 *
 * In memory and short-lived. If staged files are lost (server restart,
 * expiry), the analyze request reports which ones are missing and the
 * patient's browser uploads them again from its own copy.
 */

const STAGED_TTL_MS = 2 * 60 * 60 * 1000; // an interview never takes this long
const MAX_FILES_PER_TOKEN = 500; // same cap as the analyze upload
const MAX_BYTES_PER_TOKEN = 300 * 1024 * 1024;

/** Only the names the interview room produces: frame_<q>_<n>.jpg and audio_<q>.webm. */
export const STAGED_NAME = /^(frame_\d{1,3}_\d{1,4}\.jpg|audio_\d{1,3}\.webm)$/;

export function createStagingStore({ now = () => Date.now() } = {}) {
  const byToken = new Map(); // token -> { files: Map<name, file>, bytes, touchedAt }

  const prune = () => {
    for (const [token, entry] of byToken) {
      if (now() - entry.touchedAt > STAGED_TTL_MS) byToken.delete(token);
    }
  };

  return {
    /**
     * Keep files for later. Returns { ok: true, count } or { ok: false, reason }
     * when the files are invalid or the per-interview limits would be exceeded.
     */
    add(token, files) {
      prune();
      const bad = files.find((f) => !STAGED_NAME.test(f.originalname));
      if (bad) return { ok: false, reason: `Unexpected file name: ${bad.originalname}` };

      const entry = byToken.get(token) ?? { files: new Map(), bytes: 0, touchedAt: now() };
      const next = new Map(entry.files);
      let bytes = entry.bytes;
      for (const f of files) {
        bytes += f.buffer.length - (next.get(f.originalname)?.buffer.length ?? 0);
        next.set(f.originalname, f);
      }
      if (next.size > MAX_FILES_PER_TOKEN || bytes > MAX_BYTES_PER_TOKEN) {
        return { ok: false, reason: "Too many files for one interview" };
      }
      byToken.set(token, { files: next, bytes, touchedAt: now() });
      return { ok: true, count: next.size };
    },

    /** The staged files with these names, plus the names no longer here. */
    collect(token, names) {
      prune();
      const files = byToken.get(token)?.files ?? new Map();
      return {
        files: names.filter((n) => files.has(n)).map((n) => files.get(n)),
        missing: names.filter((n) => !files.has(n)),
      };
    },

    clear(token) {
      byToken.delete(token);
    },
  };
}

/**
 * Staged files first, then uploaded ones; an uploaded file replaces a staged
 * file with the same name (the browser's copy is the latest).
 */
export function mergeFiles(staged, uploaded) {
  const byName = new Map();
  for (const f of [...staged, ...uploaded]) byName.set(f.originalname, f);
  return [...byName.values()];
}
