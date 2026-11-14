export const shorthands = undefined;

/** Admin role, PRC license verification and account deactivation. Same as migrations/manual/add_admin_and_license_verification.sql. */
export async function up(pgm) {
  pgm.addColumns("users", {
    // 'THERAPIST' | 'ADMIN' — admins are made by hand with an UPDATE.
    role: { type: "varchar(20)", notNull: true, default: "THERAPIST" },
    profession: { type: "varchar(40)" },
    // The name exactly as on the PRC ID.
    license_name: { type: "varchar(150)" },
    // 'pending' | 'verified' | 'not_matched'
    license_status: { type: "varchar(20)", notNull: true, default: "pending" },
    license_note: { type: "text" },
    license_checked_at: { type: "timestamptz" },
    license_checked_by: { type: "integer", references: "users(user_id)", onDelete: "SET NULL" },
    is_active: { type: "boolean", notNull: true, default: true },
    deactivated_at: { type: "timestamptz" },
  });

  pgm.createTable("admin_actions", {
    action_id: { type: "serial", primaryKey: true },
    admin_id: { type: "integer", references: "users(user_id)", onDelete: "SET NULL" },
    target_user_id: { type: "integer", notNull: true, references: "users(user_id)", onDelete: "CASCADE" },
    // 'license_verified' | 'license_not_matched' | 'deactivated' | 'reactivated'
    action: { type: "varchar(30)", notNull: true },
    note: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });
  pgm.createIndex("admin_actions", ["target_user_id", "created_at"], { name: "admin_actions_target_idx" });
}

export async function down(pgm) {
  pgm.dropTable("admin_actions");
  pgm.dropColumns("users", [
    "role", "profession", "license_name", "license_status", "license_note",
    "license_checked_at", "license_checked_by", "is_active", "deactivated_at",
  ]);
}
