export const shorthands = undefined;

export async function up(pgm) {
  pgm.createTable("follow_ups", {
    follow_up_id: { type: "serial", primaryKey: true },
    patient_id: {
      type: "integer",
      notNull: true,
      references: "patients(patient_id)",
      onDelete: "CASCADE",
    },
    therapist_id: {
      type: "integer",
      notNull: true,
      references: "users(user_id)",
      onDelete: "CASCADE",
    },
    session_id: {
      type: "integer",
      references: "sessions(session_id)",
      onDelete: "SET NULL",
    },
    recommended_date: { type: "date", notNull: true },
    appointment_time: { type: "time" },
    reason: { type: "text" },
    status: {
      type: "varchar(20)",
      notNull: true,
      default: "recommended",
    },
    created_at: { type: "timestamp", notNull: true, default: pgm.func("NOW()") },
    updated_at: { type: "timestamp", notNull: true, default: pgm.func("NOW()") },
  });

  pgm.createIndex("follow_ups", "patient_id");
  pgm.createIndex("follow_ups", "therapist_id");
  pgm.createIndex("follow_ups", "session_id");
  pgm.createIndex("follow_ups", "status");
  pgm.createIndex("follow_ups", "recommended_date");
}

export async function down(pgm) {
  pgm.dropTable("follow_ups");
}