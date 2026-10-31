export async function up(pgm) {
  // Weekly working hours, in therapist wall-clock time (Asia/Manila).
  pgm.createTable("therapist_availability", {
    availability_id: { type: "serial", primaryKey: true },
    therapist_id: {
      type: "integer",
      notNull: true,
      references: "users(user_id)",
      onDelete: "CASCADE",
    },
    // 0 = Monday ... 6 = Sunday (ISO weekday).
    weekday: { type: "smallint", notNull: true },
    start_time: { type: "time", notNull: true },
    end_time: { type: "time", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });
  pgm.addConstraint("therapist_availability", "therapist_availability_weekday_check", {
    check: "weekday BETWEEN 0 AND 6",
  });
  pgm.addConstraint("therapist_availability", "therapist_availability_time_check", {
    check: "end_time > start_time",
  });

  // One-off blocked periods (leave, holidays, meetings).
  pgm.createTable("therapist_unavailable", {
    unavailable_id: { type: "serial", primaryKey: true },
    therapist_id: {
      type: "integer",
      notNull: true,
      references: "users(user_id)",
      onDelete: "CASCADE",
    },
    start_at: { type: "timestamptz", notNull: true },
    end_at: { type: "timestamptz", notNull: true },
    reason: { type: "varchar(255)" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });
  pgm.addConstraint("therapist_unavailable", "therapist_unavailable_time_check", {
    check: "end_at > start_at",
  });

  // One row per therapist; created lazily on first access with defaults.
  pgm.createTable("appointment_settings", {
    therapist_id: {
      type: "integer",
      primaryKey: true,
      references: "users(user_id)",
      onDelete: "CASCADE",
    },
    // Length of each bookable slot / session.
    slot_minutes: { type: "integer", notNull: true, default: 60 },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });
  pgm.addConstraint("appointment_settings", "appointment_settings_slot_check", {
    check: "slot_minutes BETWEEN 15 AND 240",
  });

  pgm.createIndex("therapist_availability", ["therapist_id"]);
  pgm.createIndex("therapist_unavailable", ["therapist_id"]);
}

export async function down(pgm) {
  pgm.dropTable("appointment_settings");
  pgm.dropTable("therapist_unavailable");
  pgm.dropTable("therapist_availability");
}
