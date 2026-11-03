const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Optional mobile number. A Philippine mobile number (09XX…, +639XX…, 639XX…)
 * is stored as +639XXXXXXXXX; anything else with 7–15 digits is kept as typed.
 * "" / null clears it. Returns undefined when the field wasn't sent.
 */
function contactNumberOf(value, errors) {
  if (value === undefined) return undefined;
  if (value === null || (typeof value === "string" && !value.trim())) return null;
  if (typeof value !== "string" || !/^[+\d\s()-]+$/.test(value.trim())) {
    errors.contact_number = "Mobile number can only contain digits, spaces, dashes and +";
    return null;
  }
  const digits = value.replace(/\D/g, "");
  if (/^(0|63)9\d{9}$/.test(digits)) return `+63${digits.slice(-10)}`;
  if (digits.length < 7 || digits.length > 15) {
    errors.contact_number = "Enter a valid mobile number, e.g. 0917 123 4567";
    return null;
  }
  return value.trim().replace(/\s+/g, " ");
}

/** Optional email, stored lowercased. "" / null clears it; undefined when not sent. */
function emailOf(value, errors) {
  if (value === undefined) return undefined;
  if (value === null || (typeof value === "string" && !value.trim())) return null;
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 255) {
    errors.email = "Enter a valid email address, e.g. name@example.com";
    return null;
  }
  return email;
}

/** Did the patient agree to appointment reminders? Must be true/false when sent. */
function reminderConsentOf(value, errors) {
  if (value === undefined) return {};
  if (typeof value !== "boolean") {
    errors.reminder_consent = "reminder_consent must be true or false";
    return {};
  }
  return { reminder_consent: value };
}

/** The patient's contact details for appointment reminders, as fields to save (only those sent). */
function contactFields({ contact_number, email, reminder_consent }, errors) {
  const number = contactNumberOf(contact_number, errors);
  const mail = emailOf(email, errors);
  return {
    ...(number !== undefined ? { contact_number: number } : {}),
    ...(mail !== undefined ? { email: mail } : {}),
    ...reminderConsentOf(reminder_consent, errors),
  };
}

/**
 * Validate patient creation input.
 */
export function validateCreatePatient({
  f_name,
  m_name,
  l_name,
  age,
  gender,
  primary_concern,
  contact_number,
  email,
  reminder_consent,
}) {
  const errors = {};
  const contact = contactFields({ contact_number, email, reminder_consent }, errors);

  if (!f_name?.trim()) {
    errors.f_name = "First name is required";
  } else if (f_name.trim().length > 75) {
    errors.f_name = "First name must not exceed 75 characters";
  }

  if (!l_name?.trim()) {
    errors.l_name = "Last name is required";
  } else if (l_name.trim().length > 75) {
    errors.l_name = "Last name must not exceed 75 characters";
  }

  if (m_name && m_name.trim().length > 75) {
    errors.m_name = "Middle name must not exceed 75 characters";
  }

  if (age === undefined || age === null || age === "") {
    errors.age = "Age is required";
  } else if (!Number.isInteger(Number(age)) || Number(age) < 0 || Number(age) > 150) {
    errors.age = "Age must be a valid number between 0 and 150";
  }

  if (!gender?.trim()) {
    errors.gender = "Gender is required";
  } else if (!["male", "female", "other"].includes(gender.trim().toLowerCase())) {
    errors.gender = "Gender must be male, female, or other";
  }

  if (!primary_concern?.trim()) {
    errors.primary_concern = "Primary concern is required";
  } else if (primary_concern.trim().length > 255) {
    errors.primary_concern = "Primary concern must not exceed 255 characters";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      f_name: f_name.trim().toUpperCase(),
      m_name: m_name?.trim()?.toUpperCase() || null,
      l_name: l_name.trim().toUpperCase(),
      age: Number(age),
      gender: gender.trim().toLowerCase(),
      primary_concern: primary_concern.trim(),
      contact_number: contact.contact_number ?? null,
      email: contact.email ?? null,
      // Consent only counts with an email to send to.
      reminder_consent: Boolean(contact.reminder_consent && contact.email),
    },
  };
}

/**
 * Validate patient update input.
 */
export function validateUpdatePatient({
  f_name,
  m_name,
  l_name,
  age,
  gender,
  primary_concern,
  profile_image,
  is_archived,
  contact_number,
  email,
  reminder_consent,
}) {
  const errors = {};
  const data = { ...contactFields({ contact_number, email, reminder_consent }, errors) };
  // Clearing the email also turns reminders off.
  if (data.email === null) data.reminder_consent = false;

  if (profile_image !== undefined) {
    if (profile_image === null) {
      data.profile_image = null;
    } else if (typeof profile_image !== "string" || !/^data:image\/(png|jpe?g|webp);base64,/.test(profile_image)) {
      errors.profile_image = "Profile image must be a base64 image data URL";
    } else if (profile_image.length > 1_500_000) {
      errors.profile_image = "Profile image must be under 1.5MB";
    } else {
      data.profile_image = profile_image;
    }
  }

  if (is_archived !== undefined) {
    if (typeof is_archived !== "boolean") {
      errors.is_archived = "is_archived must be a boolean";
    } else {
      data.is_archived = is_archived;
      data.archived_at = is_archived ? new Date().toISOString() : null;
    }
  }

  if (f_name !== undefined) {
    if (!f_name?.trim()) {
      errors.f_name = "First name cannot be empty";
    } else if (f_name.trim().length > 75) {
      errors.f_name = "First name must not exceed 75 characters";
    } else {
      data.f_name = f_name.trim().toUpperCase();
    }
  }

  if (l_name !== undefined) {
    if (!l_name?.trim()) {
      errors.l_name = "Last name cannot be empty";
    } else if (l_name.trim().length > 75) {
      errors.l_name = "Last name must not exceed 75 characters";
    } else {
      data.l_name = l_name.trim().toUpperCase();
    }
  }

  if (m_name !== undefined) {
    data.m_name = m_name?.trim()?.toUpperCase() || null;
  }

  if (age !== undefined) {
    if (!Number.isInteger(Number(age)) || Number(age) < 0 || Number(age) > 150) {
      errors.age = "Age must be a valid number between 0 and 150";
    } else {
      data.age = Number(age);
    }
  }

  if (gender !== undefined) {
    if (!gender?.trim()) {
      errors.gender = "Gender cannot be empty";
    } else if (!["male", "female", "other"].includes(gender.trim().toLowerCase())) {
      errors.gender = "Gender must be male, female, or other";
    } else {
      data.gender = gender.trim().toLowerCase();
    }
  }

  if (primary_concern !== undefined) {
    if (!primary_concern?.trim()) {
      errors.primary_concern = "Primary concern cannot be empty";
    } else if (primary_concern.trim().length > 255) {
      errors.primary_concern = "Primary concern must not exceed 255 characters";
    } else {
      data.primary_concern = primary_concern.trim();
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, data };
}