export const shorthands = undefined;

export async function up(pgm) {
  pgm.addColumns("users", {
    profile_image: { type: "text" },
    phone: { type: "varchar(30)" },
    specialization: { type: "varchar(120)" },
    license_number: { type: "varchar(60)" },
    affiliation: { type: "varchar(120)" },
  });
}

export async function down(pgm) {
  pgm.dropColumns("users", ["profile_image", "phone", "specialization", "license_number", "affiliation"]);
}
