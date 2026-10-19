export const shorthands = undefined;

export async function up(pgm) {
  // Step 1: Add new columns (nullable initially)
  pgm.addColumn("users", {
    f_name: { type: "varchar(50)" },
    m_name: { type: "varchar(50)" },
    l_name: { type: "varchar(50)" },
  });

  pgm.addColumn("patients", {
    f_name: { type: "varchar(75)" },
    m_name: { type: "varchar(75)" },
    l_name: { type: "varchar(75)" },
  });

  // Step 2: Migrate existing data — split full_name
  // Strategy: first word = f_name, last word = l_name, middle = everything in between
  // Compound surnames (e.g., "De la Cruz") get l_name = "De la Cruz" (correct)
  pgm.sql(`
    UPDATE users SET
      f_name = UPPER(SPLIT_PART(full_name, ' ', 1)),
      l_name = UPPER(CASE
        WHEN ARRAY_LENGTH(STRING_TO_ARRAY(TRIM(full_name), ' '), 1) > 1
        THEN TRIM(SUBSTRING(TRIM(full_name) FROM POSITION(' ' IN TRIM(full_name)) + 1))
        ELSE ''
      END)
    WHERE full_name IS NOT NULL AND full_name != '';
  `);

  pgm.sql(`
    UPDATE patients SET
      f_name = UPPER(SPLIT_PART(full_name, ' ', 1)),
      l_name = UPPER(CASE
        WHEN ARRAY_LENGTH(STRING_TO_ARRAY(TRIM(full_name), ' '), 1) > 1
        THEN TRIM(SUBSTRING(TRIM(full_name) FROM POSITION(' ' IN TRIM(full_name)) + 1))
        ELSE ''
      END)
    WHERE full_name IS NOT NULL AND full_name != '';
  `);

  // Step 3: Make f_name and l_name NOT NULL
  pgm.alterColumn("users", "f_name", { notNull: true });
  pgm.alterColumn("users", "l_name", { notNull: true });
  pgm.alterColumn("patients", "f_name", { notNull: true });
  pgm.alterColumn("patients", "l_name", { notNull: true });

  // Step 4: Update full_name to match new structure (for backward compat)
  pgm.sql(`
    UPDATE users SET full_name = UPPER(TRIM(f_name || ' ' || COALESCE(m_name || ' ', '') || l_name))
    WHERE f_name IS NOT NULL;
  `);

  pgm.sql(`
    UPDATE patients SET full_name = UPPER(TRIM(f_name || ' ' || COALESCE(m_name || ' ', '') || l_name))
    WHERE f_name IS NOT NULL;
  `);
}

export async function down(pgm) {
  // Remove the new columns (full_name still has the original data)
  pgm.dropColumns("users", ["f_name", "m_name", "l_name"]);
  pgm.dropColumns("patients", ["f_name", "m_name", "l_name"]);
}