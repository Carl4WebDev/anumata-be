export const shorthands = undefined;

export async function up(pgm) {
  pgm.addColumn("patients", {
    longitudinal_report: { type: "jsonb", notNull: false },
  });
}

export async function down(pgm) {
  pgm.dropColumn("patients", "longitudinal_report");
}
