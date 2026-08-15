export const shorthands = undefined;

export async function up(pgm) {
  pgm.addColumn("sessions", {
    report: { type: "jsonb", notNull: false },
  });
}

export async function down(pgm) {
  pgm.dropColumn("sessions", "report");
}
