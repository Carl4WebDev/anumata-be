export const shorthands = undefined;

export async function up(pgm) {
  pgm.addColumn("question_sets", {
    description: { type: "varchar(500)", notNull: true, default: "" },
  });
}

export async function down(pgm) {
  pgm.dropColumn("question_sets", "description");
}
