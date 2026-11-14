import AppError from "../../../core/errors/AppError.js";
import NotFoundError from "../../../core/errors/NotFoundError.js";
import ValidationError from "../../../core/errors/ValidationError.js";

const STATUS_FILTERS = ["pending", "verified", "not_matched", "deactivated"];
const NOTE_MAX = 500;

function noteOf(note) {
  if (note === undefined || note === null) return null;
  if (typeof note !== "string") throw new ValidationError("Note must be text.");
  const text = note.trim();
  if (text.length > NOTE_MAX) throw new ValidationError(`Note must not exceed ${NOTE_MAX} characters.`);
  return text || null;
}

/** Admin work on therapist accounts: PRC license checks and deactivation. Every change is logged. */
export default class AdminService {
  /**
   * @param repo AdminRepo
   * @param notifications NotificationService (to tell the therapist the result)
   * @param forgetAccount clears the cached role/active flag so a change applies at once
   */
  constructor(repo, notifications, forgetAccount = () => {}) {
    this.repo = repo;
    this.notifications = notifications;
    this.forgetAccount = forgetAccount;
  }

  async overview({ status, search } = {}) {
    if (status !== undefined && status !== "" && !STATUS_FILTERS.includes(status)) {
      throw new ValidationError("Unknown status filter.");
    }
    const term = typeof search === "string" && search.trim() ? search.trim().slice(0, 100) : null;
    const [summary, therapists] = await Promise.all([
      this.repo.summary(),
      this.repo.listTherapists({ status: status || null, search: term }),
    ]);
    return { summary, therapists };
  }

  /** System usage for the Overview tab: aggregate counts and times only. */
  async usage() {
    return this.repo.usage();
  }

  async therapist(userId) {
    const therapist = await this.repo.findTherapist(userId);
    if (!therapist) throw new NotFoundError("Therapist not found.");
    const actions = await this.repo.listActions(userId);
    return { ...therapist, actions };
  }

  /** Record the result of checking the license on the PRC verification site. */
  async setLicense(adminId, userId, { status, note }) {
    if (!["verified", "not_matched"].includes(status)) {
      throw new ValidationError("Status must be 'verified' or 'not_matched'.");
    }
    const text = noteOf(note);
    if (status === "not_matched" && !text) {
      throw new ValidationError("Add a short reason so the therapist knows what to fix.");
    }
    const therapist = await this.repo.findTherapist(userId);
    if (!therapist) throw new NotFoundError("Therapist not found.");

    await this.repo.setLicenseStatus(userId, status, text, adminId);
    await this.repo.logAction(adminId, userId, status === "verified" ? "license_verified" : "license_not_matched", text);
    await this.notifications.notifyAccount(
      userId,
      status === "verified"
        ? {
            type: "license_verified",
            title: "Your PRC license is verified",
            message: "Thank you — your license was checked on the PRC verification service.",
          }
        : {
            type: "license_not_matched",
            title: "Your PRC license details didn't match",
            message: `${text} Please check your license number and the name on your PRC ID in Settings.`,
          },
    );
    return this.therapist(userId);
  }

  async setActive(adminId, userId, { active, note }) {
    if (typeof active !== "boolean") throw new ValidationError("active must be true or false.");
    if (Number(adminId) === Number(userId)) throw new AppError("You can't deactivate your own account.", 400, "SELF_DEACTIVATE");
    const text = noteOf(note);
    const therapist = await this.repo.findTherapist(userId);
    if (!therapist) throw new NotFoundError("Therapist not found.");

    await this.repo.setActive(userId, active);
    await this.repo.logAction(adminId, userId, active ? "reactivated" : "deactivated", text);
    this.forgetAccount(userId);
    return this.therapist(userId);
  }
}
