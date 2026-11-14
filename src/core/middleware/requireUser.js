import AppError from "../errors/AppError.js";
import db from "../database/db.js";

// A deactivated account must stop working even with a valid login token, so the
// account's current role and active flag are read from the database. Cached for a
// few seconds only (one page load fires many requests), so a role changed by SQL —
// e.g. making the admin account — applies almost at once.
const CACHE_MS = 5 * 1000;
const accountCache = new Map();

async function loadAccount(userId) {
  const cached = accountCache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached;
  const { rows } = await db.query(`SELECT role, is_active FROM users WHERE user_id = $1`, [userId]);
  const account = { role: rows[0]?.role ?? null, active: Boolean(rows[0]?.is_active), at: Date.now() };
  accountCache.set(userId, account);
  return account;
}

/** Forget a cached account, e.g. right after an admin deactivates it. */
export function forgetAccount(userId) {
  accountCache.delete(Number(userId));
}

/** Allows signed-in, active accounts with one of the given roles. */
function requireRole(...roles) {
  return (req, res, next) => {
    loadAccount(req.user?.id)
      .then((account) => {
        if (!account.active) {
          throw new AppError(
            "This account has been deactivated. Contact the administrator if you think this is a mistake.",
            403,
            "ACCOUNT_DEACTIVATED",
          );
        }
        if (!roles.includes(account.role)) {
          throw new AppError(roles.includes("ADMIN") && roles.length === 1 ? "Admin access required" : "Therapist access required", 403, "FORBIDDEN");
        }
        req.user.role = account.role;
        next();
      })
      .catch(next);
  };
}

export const requireTherapist = requireRole("THERAPIST");
export const requireAdmin = requireRole("ADMIN");
/** Any active account — therapist or admin. */
export const requireAccount = requireRole("THERAPIST", "ADMIN");

// Keep backwards-compatible alias
export const requireUser = requireTherapist;
