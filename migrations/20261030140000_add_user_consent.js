export async function up(pgm) {
  // Record of the user agreement each therapist accepted at registration.
  // NULL for accounts created before the agreement existed.
  pgm.addColumn("users", {
    terms_version: { type: "varchar(20)" },
    terms_accepted_at: { type: "timestamptz" },
  });
}

export async function down(pgm) {
  pgm.dropColumn("users", ["terms_version", "terms_accepted_at"]);
}
