export async function up(pgm) {
  // In-app notifications for therapists (e.g. "Maria finished the interview").
  pgm.createTable("notifications", {
    notification_id: { type: "serial", primaryKey: true },
    user_id: {
      type: "integer",
      notNull: true,
      references: "users(user_id)",
      onDelete: "CASCADE",
    },
    // interview_finished | results_ready | analysis_failed
    type: { type: "varchar(32)", notNull: true },
    title: { type: "varchar(200)", notNull: true },
    message: { type: "text" },
    // Frontend route to open when clicked, e.g. /sessions/12
    link: { type: "varchar(255)" },
    patient_id: {
      type: "integer",
      references: "patients(patient_id)",
      onDelete: "CASCADE",
    },
    interview_link_id: {
      type: "integer",
      references: "interview_links(interview_link_id)",
      onDelete: "CASCADE",
    },
    read_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });

  pgm.createIndex("notifications", ["user_id", "created_at"]);
  // One notification of each kind per interview, even if the upload is retried.
  pgm.createIndex("notifications", ["interview_link_id", "type"], {
    name: "notifications_once_per_interview",
    unique: true,
    where: "interview_link_id IS NOT NULL",
  });
}

export async function down(pgm) {
  pgm.dropTable("notifications");
}
