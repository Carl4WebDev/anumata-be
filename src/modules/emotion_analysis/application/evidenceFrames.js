/**
 * Which face photos to keep for one answer.
 *
 * The AI looks at every frame, but storing them all makes the sessions table
 * grow fast (a frame every 3s, as base64). We keep the AI's best frame plus the
 * most confident others, in the order they were taken.
 */
export const MAX_STORED_FRAMES = 4;

/**
 * @param {string[]} frames data-URL images for one question, in capture order
 * @param {{ frame_index: number, emotion?: string, confidence?: number }[]} ferResults
 * @param {number} bestIdx the frame the AI picked as most telling
 * @returns {{ frame_image: string, fer_emotion: string|null, fer_confidence: number }[]}
 */
export function pickEvidenceFrames(frames, ferResults, bestIdx, max = MAX_STORED_FRAMES) {
  const withFer = frames.map((frame_image, i) => {
    const fer = (ferResults || []).find((r) => r.frame_index === i);
    return { i, frame_image, fer_emotion: fer?.emotion || null, fer_confidence: fer?.confidence || 0 };
  });

  const kept = new Set(bestIdx < frames.length ? [bestIdx] : []);
  [...withFer]
    .sort((a, b) => b.fer_confidence - a.fer_confidence)
    .forEach((f) => kept.size < max && kept.add(f.i));

  return withFer.filter((f) => kept.has(f.i)).map(({ i, ...frame }) => frame);
}

const NOT_A_FACE_READING = new Set(["NoFace", "Unknown"]);

/**
 * What the AI saw across every frame of one answer (all frames, not only the
 * stored ones): how many were checked, in how many it found a face, how often
 * each emotion was read, and how many times the reading changed.
 *
 * @param {{ frame_index: number, emotion?: string }[]} ferResults
 * @returns {{ analysed: number, face_found: number, counts: Record<string, number>, changes: number } | null}
 */
export function summarizeFaceFrames(ferResults) {
  if (!Array.isArray(ferResults) || ferResults.length === 0) return null;
  const readings = [...ferResults]
    .sort((a, b) => a.frame_index - b.frame_index)
    .map((r) => r.emotion)
    .filter((emotion) => emotion && !NOT_A_FACE_READING.has(emotion));
  const counts = {};
  for (const emotion of readings) counts[emotion] = (counts[emotion] || 0) + 1;
  const changes = readings.filter((emotion, i) => i > 0 && emotion !== readings[i - 1]).length;
  return { analysed: ferResults.length, face_found: readings.length, counts, changes };
}
