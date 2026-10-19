/**
 * Validate patient creation input.
 */
export function validateCreatePatient({ f_name, m_name, l_name, age, gender, primary_concern }) {
  const errors = {};

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
  } else if (!["male", "female"].includes(gender.trim().toLowerCase())) {
    errors.gender = "Gender must be male or female";
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
    },
  };
}

/**
 * Validate patient update input.
 */
export function validateUpdatePatient({ f_name, m_name, l_name, age, gender, primary_concern }) {
  const errors = {};
  const data = {};

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
    } else if (!["male", "female"].includes(gender.trim().toLowerCase())) {
      errors.gender = "Gender must be male or female";
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