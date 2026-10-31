/**
 * Password strength rules for new passwords (registration and change).
 * Mirrored in the frontend (src/shared/utils/passwordPolicy.ts) so users see
 * the same checklist the server enforces — keep both in sync.
 */

export const PASSWORD_MIN_LENGTH = 8;
// bcrypt only uses the first 72 bytes; longer input would be silently truncated.
export const PASSWORD_MAX_LENGTH = 72;

// Frequently breached / guessable bases. Checked case-insensitively, also
// after stripping trailing digits and symbols ("Password123!" → "password").
const COMMON_PASSWORDS = new Set([
  "password", "passw0rd", "p@ssword", "p@ssw0rd", "password1", "letmein", "welcome", "admin",
  "administrator", "qwerty", "qwertyuiop", "asdfgh", "asdfghjkl", "zxcvbnm", "iloveyou", "monkey",
  "dragon", "sunshine", "princess", "football", "baseball", "basketball", "master", "superman",
  "batman", "trustno1", "abc123", "changeme", "secret", "default", "login", "starwars", "whatever",
  "freedom", "shadow", "michael", "jennifer", "computer", "internet", "hello", "test", "guest",
  "user", "root", "therapist", "therapy", "doctor", "clinic", "hospital", "anumata", "amumata",
  "philippines", "pilipinas", "manila", "mahalkita", "iloveu", "summer", "winter", "spring", "autumn",
]);

const SEQUENCES = ["0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
const SEQUENCE_RUN = 4;

function hasSequence(lower) {
  for (const seq of SEQUENCES) {
    const both = [seq, [...seq].reverse().join("")];
    for (const s of both) {
      for (let i = 0; i + SEQUENCE_RUN <= s.length; i++) {
        if (lower.includes(s.slice(i, i + SEQUENCE_RUN))) return true;
      }
    }
  }
  return false;
}

function isCommon(lower) {
  const base = lower.replace(/[\d\W_]+$/u, "").replace(/^[\d\W_]+/u, "");
  return COMMON_PASSWORDS.has(lower) || (base.length > 0 && COMMON_PASSWORDS.has(base));
}

/**
 * @param {string} password
 * @param {{ email?: string, names?: (string|null|undefined)[] }} context personal info the password must not contain
 * @returns {string[]} unmet rules (empty = strong enough)
 */
export function checkPasswordStrength(password, { email, names = [] } = {}) {
  if (typeof password !== "string" || password.length === 0) return ["Password is required."];
  const errors = [];
  const lower = password.toLowerCase();

  if (password.length < PASSWORD_MIN_LENGTH) errors.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  if (password.length > PASSWORD_MAX_LENGTH) errors.push(`Use at most ${PASSWORD_MAX_LENGTH} characters.`);
  if (!/[a-z]/.test(password)) errors.push("Add a lowercase letter.");
  if (!/[A-Z]/.test(password)) errors.push("Add an uppercase letter.");
  if (!/\d/.test(password)) errors.push("Add a number.");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Add a symbol (e.g. ! @ # $).");
  if (/^\s|\s$/.test(password)) errors.push("Don't start or end with a space.");
  if (/(.)\1{3,}/.test(password)) errors.push("Don't repeat the same character 4 or more times.");
  if (hasSequence(lower)) errors.push("Avoid sequences like 1234, abcd or qwer.");
  if (isCommon(lower)) errors.push("This password is too common.");

  const personal = [email?.split("@")[0], ...names]
    .filter((part) => typeof part === "string")
    .flatMap((part) => part.toLowerCase().split(/[\s._-]+/))
    .filter((part) => part.length >= 3);
  if (personal.some((part) => lower.includes(part))) errors.push("Don't use your name or email in your password.");

  return errors;
}
