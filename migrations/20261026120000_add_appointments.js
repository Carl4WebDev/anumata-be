export async function up(pgm) {
  // btree_gist enables the `=` operator for scalar columns in EXCLUDE constraints.
  await pgm.sql(`CREATE EXTENSION IF NOT EXISTS btree_gist`);

  // Appointments are booked by the therapist (or their assistant) on behalf of
  // a patient — there is no patient-facing booking.
  pgm.createTable("appointments", {
    appointment_id: { type: "serial", primaryKey: true },
    therapist_id: {
      type: "integer",
      notNull: true,
      references: "users(user_id)",
      onDelete: "CASCADE",
    },
    patient_id: {
      type: "integer",
      notNull: true,
      references: "patients(patient_id)",
      onDelete: "CASCADE",
    },
    // Follow-up recommendation this appointment fulfils, if booked from one.
    // The appointment drives that follow-up's status.
    follow_up_id: {
      type: "integer",
      references: "follow_ups(follow_up_id)",
      onDelete: "SET NULL",
    },
    // scheduled | completed | no_show | cancelled
    status: { type: "varchar(16)", notNull: true, default: "scheduled" },
    start_at: { type: "timestamptz", notNull: true },
    end_at: { type: "timestamptz", notNull: true },
    reason: { type: "varchar(255)" },
    cancel_reason: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });

  pgm.addConstraint("appointments", "appointments_status_check", {
    check: "status IN ('scheduled', 'completed', 'no_show', 'cancelled')",
  });
  pgm.addConstraint("appointments", "appointments_time_check", { check: "end_at > start_at" });

  // History of what happened to each appointment (booked, rescheduled, ...).
  pgm.createTable("appointment_events", {
    event_id: { type: "serial", primaryKey: true },
    appointment_id: {
      type: "integer",
      notNull: true,
      references: "appointments(appointment_id)",
      onDelete: "CASCADE",
    },
    // booked | rescheduled | updated | cancelled | completed | no_show
    action: { type: "varchar(16)", notNull: true },
    detail: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });

  // CONCURRENCY GUARANTEE: no two scheduled appointments for one therapist may
  // overlap. A losing concurrent insert/update raises an exclusion violation,
  // which the repo maps to 409.
  await pgm.sql(`
    ALTER TABLE appointments ADD CONSTRAINT appointments_no_overlap
    EXCLUDE USING gist (
      therapist_id WITH =,
      tstzrange(start_at, end_at, '[)') WITH &&
    )
    WHERE (status = 'scheduled')
  `);

  pgm.createIndex("appointments", ["therapist_id", "start_at"]);
  pgm.createIndex("appointments", ["patient_id"]);
  // A follow-up can have at most one scheduled appointment at a time.
  pgm.createIndex("appointments", ["follow_up_id"], {
    name: "appointments_one_scheduled_per_follow_up",
    unique: true,
    where: "status = 'scheduled' AND follow_up_id IS NOT NULL",
  });
  pgm.createIndex("appointment_events", ["appointment_id"]);
}

export async function down(pgm) {
  pgm.dropTable("appointment_events");
  pgm.dropTable("appointments");
}
