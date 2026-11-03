/**
 * Feeling words the patient tapped during a question ("Hard to put into
 * words? Tap how you feel"). Their own report, per question, next to what
 * the AI read. Sent as JSON `{ "<question index>": ["worried", "tired"] }`;
 * unknown words are dropped and malformed input just means none.
 */

export const FEELING_WORDS = ["sad", "worried", "scared", "angry", "tired", "lonely", "okay", "hopeful"];
export const MAX_FEELINGS_PER_QUESTION = 3;
const MAX_QUESTIONS = 200;

/** @returns {Map<number, string[]>} */
export function parseFeelingsTapped(raw) {
  const result = new Map();
  if (typeof raw !== "string" || !raw) return result;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return result;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return result;
  for (const [key, words] of Object.entries(data)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= MAX_QUESTIONS || !Array.isArray(words)) continue;
    const valid = [...new Set(words.filter((w) => FEELING_WORDS.includes(w)))].slice(0, MAX_FEELINGS_PER_QUESTION);
    if (valid.length > 0) result.set(index, valid);
  }
  return result;
}

/** For question `index`'s transcript entry: `{ feelings_tapped: [...] }`, or {} when none were tapped. */
export function feelingsTappedFields(index, tapped) {
  const words = tapped.get(index);
  return words ? { feelings_tapped: words } : {};
}
