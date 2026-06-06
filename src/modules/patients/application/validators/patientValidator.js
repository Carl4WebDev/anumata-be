import ValidationError from "../../../../core/errors/ValidationError.js";

export function validateCreatePatient({ full_name, age, gender, primary_concern }) {
  const errors = {};

  if (!full_name?.trim()) {
    errors.full_name = "Patient name is required";
  } else if (full_name.trim().length > 150) {
    errors.full_name = "Name must not exceed 150 characters";
  }

  if (age === undefined || age === null || age === "") {
    errors.age = "Age is required";
  } else if (isNaN(age) || Number(age) < 10 || Number(age) > 120) {
    errors.age = "Age must be between 10 and 120";
  }

  if (!gender?.trim()) {
    errors.gender = "Gender is required";
  } else if (!["male", "female", "other"].includes(gender.toLowerCase())) {
    errors.gender = "Gender must be male, female, or other";
  }

  if (!primary_concern?.trim()) {
    errors.primary_concern = "Primary concern is required";
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError("Validation failed", errors);
  }

  return {
    full_name: full_name.trim(),
    age: Number(age),
    gender: gender.toLowerCase(),
    primary_concern: primary_concern.trim(),
  };
}

export function validateUpdatePatient({ full_name, age, gender, primary_concern }) {
  const errors = {};
  const data = {};

  if (full_name !== undefined) {
    if (!full_name?.trim()) {
      errors.full_name = "Patient name cannot be empty";
    } else if (full_name.trim().length > 150) {
      errors.full_name = "Name must not exceed 150 characters";
    } else {
      data.full_name = full_name.trim();
    }
  }

  if (age !== undefined) {
    if (isNaN(age) || Number(age) < 10 || Number(age) > 120) {
      errors.age = "Age must be between 10 and 120";
    } else {
      data.age = Number(age);
    }
  }

  if (gender !== undefined) {
    if (!gender?.trim()) {
      errors.gender = "Gender cannot be empty";
    } else if (!["male", "female", "other"].includes(gender.toLowerCase())) {
      errors.gender = "Gender must be male, female, or other";
    } else {
      data.gender = gender.toLowerCase();
    }
  }

  if (primary_concern !== undefined) {
    if (!primary_concern?.trim()) {
      errors.primary_concern = "Primary concern cannot be empty";
    } else {
      data.primary_concern = primary_concern.trim();
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError("Validation failed", errors);
  }

  return data;
}
