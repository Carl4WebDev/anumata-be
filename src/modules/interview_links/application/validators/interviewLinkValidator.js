import ValidationError from "../../../../core/errors/ValidationError.js";

export function validateCreateInterviewLink({ patient_id, question_set_id }) {
  const errors = {};

  if (!patient_id) {
    errors.patient_id = "Patient ID is required";
  }

  if (!question_set_id) {
    errors.question_set_id = "Question set ID is required";
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError("Validation failed", errors);
  }

  return { patient_id, question_set_id };
}
