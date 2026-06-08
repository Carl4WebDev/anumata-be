export const shorthands = undefined;

export async function up(pgm) {
  pgm.addColumn("sessions", {
    emotional_events: { type: "jsonb", notNull: false },
  });
  pgm.addColumn("sessions", {
    session_highlights: { type: "jsonb", notNull: false },
  });
}

export async function down(pgm) {
  pgm.dropColumn("sessions", "session_highlights");
  pgm.dropColumn("sessions", "emotional_events");
}
