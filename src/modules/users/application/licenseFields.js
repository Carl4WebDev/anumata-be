/**
 * PRC license details a therapist gives at registration (and can edit later).
 * They are checked by an admin on the PRC verification site; here we only make
 * sure they are complete and well-formed.
 */

/** Professions licensed by the PRC that may use Amumata. */
export const PROFESSIONS = ["psychologist", "psychometrician", "guidance_counselor", "psychiatrist", "social_worker"];

export const LICENSE_STATUSES = ["pending", "verified", "not_matched"];

/** "0012 345" or "0012-345" → "0012345". PRC license numbers are digits only. */
export function normalizeLicenseNumber(value) {
  return typeof value === "string" ? value.replace(/[\s-]/g, "") : "";
}

/**
 * Validate the license fields that were sent. With `required`, all three must be present.
 * Returns { data, errors }: data holds only the fields that were sent, normalized.
 */
export function validateLicenseFields({ profession, license_number, license_name }, { required = false } = {}) {
  const errors = {};
  const data = {};

  if (profession !== undefined || required) {
    if (!PROFESSIONS.includes(profession)) {
      errors.profession = "Choose your profession.";
    } else {
      data.profession = profession;
    }
  }

  if (license_number !== undefined || required) {
    const number = normalizeLicenseNumber(license_number);
    if (!number) {
      errors.license_number = "PRC license number is required.";
    } else if (!/^\d{4,10}$/.test(number)) {
      errors.license_number = "Enter your PRC license number using digits only, e.g. 0012345.";
    } else {
      data.license_number = number;
    }
  }

  if (license_name !== undefined || required) {
    const name = typeof license_name === "string" ? license_name.trim().replace(/\s+/g, " ").toUpperCase() : "";
    if (!name) {
      errors.license_name = "Enter your name exactly as it appears on your PRC ID.";
    } else if (name.length > 150) {
      errors.license_name = "Name on the PRC ID must not exceed 150 characters.";
    } else {
      data.license_name = name;
    }
  }

  return { data, errors };
}
