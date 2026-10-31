/**
 * Slot computation — pure functions, no database.
 *
 * Availability windows are stored as therapist wall-clock weekday/time
 * (Asia/Manila). The Philippines has no DST, so a fixed +08:00 offset is
 * exact and deterministic. All instants in/out are UTC Date objects.
 */

export const PH_OFFSET_MIN = 8 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcMsFromPhWall(year, month, day, hours, minutes) {
  // Wall time in +08:00 expressed as UTC.
  return Date.UTC(year, month, day, hours, minutes) - PH_OFFSET_MIN * 60 * 1000;
}

function phWeekdayOf(utcMs) {
  // ISO weekday in +08:00: 0 = Monday ... 6 = Sunday.
  const shifted = new Date(utcMs + PH_OFFSET_MIN * 60 * 1000);
  const day = shifted.getUTCDay();
  return (day + 6) % 7;
}

function parseTimeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Generate candidate slot starts (UTC ms) across the horizon:
 * every slot_minutes inside each availability window, on its weekday,
 * starting at or after `notBeforeMs`.
 */
export function generateCandidateSlots({
  availability,
  settings,
  horizonStartMs,
  horizonEndMs,
  notBeforeMs,
}) {
  const slotMs = settings.slot_minutes * 60 * 1000;
  const slots = [];

  // Iterate PH calendar days.
  for (let dayMs = horizonStartMs; dayMs <= horizonEndMs; dayMs += 24 * 60 * 60 * 1000) {
    const weekday = phWeekdayOf(dayMs);
    const windows = availability.filter((w) => w.weekday === weekday);
    if (windows.length === 0) continue;

    const shifted = new Date(dayMs + PH_OFFSET_MIN * 60 * 1000);
    const year = shifted.getUTCFullYear();
    const month = shifted.getUTCMonth();
    const day = shifted.getUTCDate();

    for (const window of windows) {
      const startMin = parseTimeToMinutes(window.start_time);
      const endMin = parseTimeToMinutes(window.end_time);
      for (let min = startMin; min + settings.slot_minutes <= endMin; min += settings.slot_minutes) {
        const slotStart = toUtcMsFromPhWall(year, month, day, Math.floor(min / 60), min % 60);
        const slotEnd = slotStart + slotMs;
        if (slotStart >= notBeforeMs && slotEnd <= horizonEndMs) {
          slots.push(slotStart);
        }
      }
    }
  }

  return [...new Set(slots)].sort((a, b) => a - b);
}

/**
 * Free slots = candidates minus unavailable ranges minus active appointments
 * (any status holding a slot). Returns ascending UTC ms.
 */
export function computeFreeSlots({ candidates, unavailableRanges, busyRanges, slotMs }) {
  const free = candidates.filter((start) => {
    const end = start + slotMs;
    const blockedByUnavailable = unavailableRanges.some((r) =>
      rangesOverlap(start, end, r.startMs, r.endMs),
    );
    const blockedByBusy = busyRanges.some((r) =>
      rangesOverlap(start, end, r.startMs, r.endMs),
    );
    return !blockedByUnavailable && !blockedByBusy;
  });
  return free;
}

/** "YYYY-MM-DD" Manila calendar day → its [startMs, endMs) in UTC ms. */
export function phDayRange(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const startMs = toUtcMsFromPhWall(year, month - 1, day, 0, 0);
  return { startMs, endMs: startMs + DAY_MS };
}

/** UTC ms → "YYYY-MM-DD" of the Manila calendar day it falls on. */
export function phDateOf(utcMs) {
  return new Date(utcMs + PH_OFFSET_MIN * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Free slot starts (UTC ms) on one Manila calendar day: working-hour slots,
 * not before `notBeforeMs`, minus blocked periods and booked appointments.
 */
export function freeSlotsForDay({ availability, slotMinutes, dateStr, notBeforeMs, unavailableRanges, busyRanges }) {
  const { startMs, endMs } = phDayRange(dateStr);
  const candidates = generateCandidateSlots({
    availability,
    settings: { slot_minutes: slotMinutes },
    horizonStartMs: startMs,
    horizonEndMs: endMs,
    notBeforeMs: Math.max(notBeforeMs, startMs),
  });
  return computeFreeSlots({ candidates, unavailableRanges, busyRanges, slotMs: slotMinutes * 60 * 1000 });
}

/** Convert raw rows to the {startMs, endMs} shape the filters expect. */
export function toRange(rows, startKey, endKey) {
  return rows
    .map((r) => ({ startMs: new Date(r[startKey]).getTime(), endMs: new Date(r[endKey]).getTime() }))
    .filter((r) => !Number.isNaN(r.startMs) && !Number.isNaN(r.endMs) && r.startMs < r.endMs);
}
