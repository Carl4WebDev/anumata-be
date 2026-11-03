export async function up(pgm) {
  // Patient contacts for appointment reminders (both optional), and their consent to receive them.
  pgm.addColumn("patients", {
    contact_number: { type: "varchar(20)" },
    email: { type: "varchar(255)" },
    reminder_consent: { type: "boolean", notNull: true, default: false },
  });

  // One row per reminder sent, so nobody gets the same reminder twice.
  pgm.createTable("appointment_reminders", {
    reminder_id: { type: "serial", primaryKey: true },
    appointment_id: {
      type: "integer",
      notNull: true,
      references: "appointments(appointment_id)",
      onDelete: "CASCADE",
    },
    kind: { type: "varchar(20)", notNull: true }, // e.g. 'day_before', 'hours_before'
    channel: { type: "varchar(10)", notNull: true }, // 'email' or 'sms'
    status: { type: "varchar(10)", notNull: true }, // 'sent' or 'failed'
    error: { type: "text" },
    sent_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });
  pgm.addConstraint("appointment_reminders", "appointment_reminders_appointment_id_kind_channel_key", {
    unique: ["appointment_id", "kind", "channel"],
  });
}

export async function down(pgm) {
  pgm.dropTable("appointment_reminders");
  pgm.dropColumn("patients", ["contact_number", "email", "reminder_consent"]);
}
