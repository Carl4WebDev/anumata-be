/**
 * The variables the EmailJS reminder template uses ({{to_name}}, {{appointment_when}}, …).
 * Only what the patient needs to show up — no clinical details in an email.
 */

const TIME_ZONE = "Asia/Manila";

/** "Tuesday, November 3, 2026" and "1:00 PM", in Philippine time. */
export function formatWhen(startAt) {
  const d = new Date(startAt);
  return {
    date: d.toLocaleDateString("en-US", { timeZone: TIME_ZONE, weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" }),
  };
}

const KIND_NOTES = {
  day_before: "This is a reminder of your appointment within the next day.",
  hours_before: "Your appointment is in about 2 hours.",
};

/**
 * @param {{ start_at: string|Date, session_type?: string|null, patient_first_name: string, patient_email: string, therapist_name: string }} reminder
 * @param {"day_before"|"hours_before"} kind
 */
export function reminderTemplateParams(reminder, kind) {
  const { date, time } = formatWhen(reminder.start_at);
  const firstName = (reminder.patient_first_name || "").trim();
  const name = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase() : "there";
  return {
    to_email: reminder.patient_email,
    to_name: name,
    therapist_name: (reminder.therapist_name || "your therapist").trim(),
    appointment_date: date,
    appointment_time: time,
    appointment_when: `${date} at ${time}`,
    session_type: reminder.session_type || "Therapy session",
    reminder_note: KIND_NOTES[kind],
  };
}
