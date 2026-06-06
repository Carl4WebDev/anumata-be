export const shorthands = undefined;

export async function up(pgm) {
  // Users table (therapists)
  pgm.createTable("users", {
    user_id: { type: "serial", primaryKey: true },
    email: { type: "varchar(255)", notNull: true, unique: true },
    password_hash: { type: "varchar(255)", notNull: true },
    full_name: { type: "varchar(100)", notNull: true },
    created_at: { type: "timestamp", notNull: true, default: pgm.func("NOW()") },
    updated_at: { type: "timestamp", notNull: true, default: pgm.func("NOW()") },
  });

  // Patients table
  pgm.createTable("patients", {
    patient_id: { type: "serial", primaryKey: true },
    therapist_id: {
      type: "integer",
      notNull: true,
      references: "users(user_id)",
      onDelete: "CASCADE",
    },
    full_name: { type: "varchar(150)", notNull: true },
    age: { type: "integer", notNull: true },
    gender: { type: "varchar(10)", notNull: true },
    primary_concern: { type: "varchar(255)", notNull: true },
    created_at: { type: "timestamp", notNull: true, default: pgm.func("NOW()") },
    updated_at: { type: "timestamp", notNull: true, default: pgm.func("NOW()") },
  });

  pgm.createIndex("patients", "therapist_id");

  // Question sets table
  pgm.createTable("question_sets", {
    question_set_id: { type: "serial", primaryKey: true },
    therapist_id: {
      type: "integer",
      notNull: true,
      references: "users(user_id)",
      onDelete: "CASCADE",
    },
    name: { type: "varchar(200)", notNull: true },
    questions: { type: "jsonb", notNull: true },
    created_at: { type: "timestamp", notNull: true, default: pgm.func("NOW()") },
    updated_at: { type: "timestamp", notNull: true, default: pgm.func("NOW()") },
  });

  pgm.createIndex("question_sets", "therapist_id");

  // Interview links table
  pgm.createTable("interview_links", {
    interview_link_id: { type: "serial", primaryKey: true },
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
    question_set_id: {
      type: "integer",
      notNull: true,
      references: "question_sets(question_set_id)",
      onDelete: "CASCADE",
    },
    token: { type: "varchar(36)", notNull: true, unique: true },
    status: {
      type: "varchar(20)",
      notNull: true,
      default: "pending",
    },
    created_at: { type: "timestamp", notNull: true, default: pgm.func("NOW()") },
    updated_at: { type: "timestamp", notNull: true, default: pgm.func("NOW()") },
  });

  pgm.createIndex("interview_links", "therapist_id");
  pgm.createIndex("interview_links", "patient_id");
  pgm.createIndex("interview_links", "token");

  // Sessions table
  pgm.createTable("sessions", {
    session_id: { type: "serial", primaryKey: true },
    interview_link_id: {
      type: "integer",
      notNull: true,
      references: "interview_links(interview_link_id)",
      onDelete: "CASCADE",
    },
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
    transcript: { type: "jsonb", notNull: true },
    emotion_summary: { type: "jsonb", notNull: true },
    risk_level: {
      type: "varchar(10)",
      notNull: true,
    },
    emotional_spikes: { type: "jsonb", notNull: true, default: "[]" },
    notes: { type: "text" },
    created_at: { type: "timestamp", notNull: true, default: pgm.func("NOW()") },
    updated_at: { type: "timestamp", notNull: true, default: pgm.func("NOW()") },
  });

  pgm.createIndex("sessions", "therapist_id");
  pgm.createIndex("sessions", "patient_id");
  pgm.createIndex("sessions", "interview_link_id");
}

export async function down(pgm) {
  pgm.dropTable("sessions");
  pgm.dropTable("interview_links");
  pgm.dropTable("question_sets");
  pgm.dropTable("patients");
  pgm.dropTable("users");
}
