export async function up(pgm) {
  // Therapist-defined session types ("Initial consultation", 90 min), each
  // booking its own length. Removed types are kept (is_active = false) so
  // past appointments still name them.
  pgm.createTable("session_types", {
    session_type_id: { type: "serial", primaryKey: true },
    therapist_id: { type: "integer", notNull: true, references: "users(user_id)", onDelete: "CASCADE" },
    name: { type: "varchar(60)", notNull: true },
    duration_minutes: { type: "integer", notNull: true },
    is_active: { type: "boolean", notNull: true, default: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });
  pgm.addConstraint("session_types", "session_types_duration_check", {
    check: "duration_minutes BETWEEN 15 AND 240",
  });
  pgm.createIndex("session_types", ["therapist_id"]);
  pgm.sql(
    "CREATE UNIQUE INDEX session_types_unique_active_name ON session_types (therapist_id, lower(name)) WHERE is_active",
  );

  // The type an appointment was booked as, plus its name at booking time.
  pgm.addColumn("appointments", {
    session_type_id: { type: "integer", references: "session_types(session_type_id)", onDelete: "SET NULL" },
    session_type: { type: "varchar(60)" },
  });

  // Free time kept after every appointment.
  pgm.addColumn("appointment_settings", {
    break_minutes: { type: "integer", notNull: true, default: 0 },
  });
  pgm.addConstraint("appointment_settings", "appointment_settings_break_check", {
    check: "break_minutes BETWEEN 0 AND 60",
  });
}

export async function down(pgm) {
  pgm.dropConstraint("appointment_settings", "appointment_settings_break_check");
  pgm.dropColumn("appointment_settings", "break_minutes");
  pgm.dropColumn("appointments", ["session_type_id", "session_type"]);
  pgm.dropTable("session_types");
}
