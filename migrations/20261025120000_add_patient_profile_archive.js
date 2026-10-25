export const shorthands = undefined;

export async function up(pgm) {
  pgm.addColumns("patients", {
    profile_image: { type: "text" },
    is_archived: { type: "boolean", notNull: true, default: false },
    archived_at: { type: "timestamptz" },
  });
  pgm.createIndex("patients", ["therapist_id", "is_archived"]);
}

export async function down(pgm) {
  pgm.dropIndex("patients", ["therapist_id", "is_archived"]);
  pgm.dropColumns("patients", ["profile_image", "is_archived", "archived_at"]);
}
